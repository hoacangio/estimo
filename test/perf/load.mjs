// Load & latency tests for Estimo.
//
//   node scripts/local-server.mjs 8787 &
//   node test/perf/load.mjs http://localhost:8787 [--quick]
//
// Prints a JSON summary at the end (used for the performance report).

import crypto from "node:crypto";

const BASE = new URL(process.argv[2] || "http://localhost:8787");
const QUICK = process.argv.includes("--quick");
const WS = `${BASE.protocol === "https:" ? "wss" : "ws"}://${BASE.host}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
const pct = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))].toFixed(2); };
const stats = (arr) => ({ n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), max: pct(arr, 100) });

function user(room, name) {
  const ws = new WebSocket(`${WS}/ws/${room}`);
  const u = { ws, name, waiters: [], bytes: 0, msgs: 0, last: null };
  ws.onmessage = (e) => {
    u.bytes += e.data.length; u.msgs++;
    if (e.data === "pong") { const w = u.waiters.shift(); w && w(); return; }
    const m = JSON.parse(e.data); u.lastBytes = e.data.length;
    u.last = { ...u.last, ...m };
    for (const w of u.waiters.splice(0)) w(u.last);
  };
  u.ready = new Promise((res, rej) => { ws.onopen = () => { ws.send(JSON.stringify({ t: "join", id: crypto.randomUUID(), name })); res(); }; ws.onerror = rej; });
  u.next = (pred = () => true) => new Promise((res) => { const f = (m) => (pred(m) ? res(m) : u.waiters.push(f)); u.waiters.push(f); });
  u.send = (o) => ws.send(JSON.stringify(o));
  return u;
}
async function makeRoom(n, tag) {
  const room = `perf-${tag}-${crypto.randomBytes(3).toString("hex")}`;
  const users = [];
  for (let i = 0; i < n; i++) { users.push(user(room, `u${i}`)); }
  await Promise.all(users.map((u) => u.ready));
  await Promise.all(users.map((u) => u.next((m) => m.participants?.length === n)));
  return { room, users };
}
const close = (users) => users.forEach((u) => { try { u.ws.close(); } catch {} });

const summary = {};
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const run = (k) => !ONLY || ONLY.split(",").includes(k);

if (run("P1")) {
/* P1 — fan-out latency: one vote → every client in the room has the new state */
console.log("P1 fan-out latency (vote → all clients updated)");
summary.fanout = {};
for (const n of QUICK ? [10, 50] : [5, 10, 25, 50, 100]) {
  const { users } = await makeRoom(n, `fan${n}`);
  const firstMs = [], allMs = [];
  const cards = ["1", "2", "3", "5", "8", "13"];
  for (let i = 0; i < (QUICK ? 20 : 60); i++) {
    const v = cards[i % cards.length];
    const t0 = now();
    const waits = users.map((u) => u.next((m) => m.participants?.[0]?.voted !== undefined).then(() => now() - t0));
    users[0].send({ t: "vote", v: v === users[0].last?.mine ? "21" : v });
    const times = await Promise.all(waits);
    firstMs.push(Math.min(...times)); allMs.push(Math.max(...times));
    await sleep(220); // stay under the per-socket rate limit (5 msg/s)
  }
  const bytes = users[1].lastBytes || 0;
  summary.fanout[n] = { firstClient: stats(firstMs), lastClient: stats(allMs), stateBytes: bytes };
  console.log(`  ${String(n).padStart(3)} users: last client p50 ${pct(allMs, 50)} ms · p95 ${pct(allMs, 95)} ms · p99 ${pct(allMs, 99)} ms · state ${bytes} B`);
  close(users); await sleep(300);
}

}

if (run("P2")) {
/* P2 — payload growth with history */
console.log("P2 state payload size with full history (30 tickets, 10 voters)");
{
  const { users } = await makeRoom(10, "hist");
  for (let t = 0; t < 30; t++) {
    users[0].send({ t: "topic", text: `PROJ-${1000 + t} · ${"Some realistic ticket title ".repeat(2)}`.slice(0, 120) });
    await sleep(210);
    for (const u of users) u.send({ t: "vote", v: ["3", "5", "8"][t % 3] });
    await sleep(210);
    users[0].send({ t: "reveal" }); await sleep(210);
    users[0].send({ t: "next", final: "5" }); await sleep(210);
  }
  await sleep(400);
  users[0].send({ t: "topic", text: "probe" }); await sleep(300);
  const bytes = users[1].lastBytes; // a typical broadcast on the wire after 30 tickets
  const deckBytes = JSON.stringify(users[1].last.decks).length;
  const histBytes = JSON.stringify(users[1].last.history).length;
  summary.payload = { stateBytes: bytes, decksBytes: deckBytes, historyBytes: histBytes, historyLen: users[1].last.history.length };
  console.log(`  state ${bytes} B (decks ${deckBytes} B, history ${histBytes} B for ${users[1].last.history.length} tickets)`);
  close(users); await sleep(300);
}

}

if (run("P3")) {
/* P3 — many concurrent rooms with realistic voting */
const ROOMS = QUICK ? 10 : 50, PER = 10, SECONDS = QUICK ? 10 : 30;
console.log(`P3 concurrent load: ${ROOMS} rooms × ${PER} users for ${SECONDS}s (each user acts every ~2s)`);
{
  const rooms = [];
  for (let r = 0; r < ROOMS; r++) rooms.push(await makeRoom(PER, `load${r}`));
  const lat = []; let sent = 0, errors = 0;
  const end = Date.now() + SECONDS * 1000;
  const loops = rooms.flatMap(({ users }) => users.map(async (u, i) => {
    await sleep(Math.random() * 2000);
    while (Date.now() < end) {
      const v = ["1", "2", "3", "5", "8", "13"][Math.floor(Math.random() * 6)];
      const t0 = now();
      const p = u.next((m) => m.mine !== undefined);
      try { u.send({ t: "vote", v }); sent++; await Promise.race([p, sleep(5000).then(() => { throw new Error("timeout"); })]); lat.push(now() - t0); }
      catch { errors++; }
      await sleep(1500 + Math.random() * 1000);
    }
  }));
  const t0 = Date.now();
  await Promise.all(loops);
  const secs = (Date.now() - t0) / 1000;
  const fanoutMsgs = rooms.reduce((a, r) => a + r.users.reduce((b, u) => b + u.msgs, 0), 0);
  summary.concurrent = { rooms: ROOMS, usersPerRoom: PER, seconds: +secs.toFixed(1), actionsSent: sent, actionsPerSec: +(sent / secs).toFixed(1), messagesDelivered: fanoutMsgs, deliveredPerSec: +(fanoutMsgs / secs).toFixed(0), errors, roundTrip: stats(lat) };
  console.log(`  ${sent} actions (${(sent / secs).toFixed(1)}/s) → ${fanoutMsgs} messages delivered (${(fanoutMsgs / secs).toFixed(0)}/s), errors ${errors}`);
  console.log(`  round-trip p50 ${pct(lat, 50)} ms · p95 ${pct(lat, 95)} ms · p99 ${pct(lat, 99)} ms`);
  rooms.forEach((r) => close(r.users)); await sleep(500);
}

}

if (run("P4")) {
/* P4 — connection setup time */
console.log("P4 connection setup (socket open + join → first state)");
{
  const times = [];
  const room = `perf-conn-${crypto.randomBytes(3).toString("hex")}`;
  for (let i = 0; i < (QUICK ? 20 : 50); i++) {
    const t0 = now(); const u = user(room, "c" + i); await u.ready; await u.next(); times.push(now() - t0); u.ws.close();
  }
  summary.connect = stats(times);
  console.log(`  p50 ${pct(times, 50)} ms · p95 ${pct(times, 95)} ms`);
}

}

/* P5 — fan-out in a busy room that already has 30 tickets of history */
if (run("P5")) {
  console.log("P5 fan-out with 30-ticket history, 50 users");
  const { users } = await makeRoom(50, "busy");
  for (let t = 0; t < 30; t++) {
    users[0].send({ t: "topic", text: `PROJ-${2000 + t} · Realistic ticket title for history sizing` }); await sleep(210);
    for (let i = 0; i < 10; i++) users[i].send({ t: "vote", v: ["3", "5", "8"][(t + i) % 3] });
    await sleep(210); users[0].send({ t: "reveal" }); await sleep(210); users[0].send({ t: "next", final: "5" }); await sleep(210);
  }
  await sleep(400);
  const allMs = [];
  for (let i = 0; i < 40; i++) {
    const t0 = now();
    const waits = users.map((u) => u.next(() => true).then(() => now() - t0));
    users[1 + (i % 5)].send({ t: "vote", v: ["1", "2"][i % 2] });
    allMs.push(Math.max(...(await Promise.all(waits)))); await sleep(450);
  }
  summary.busy = { users: 50, history: users[2].last.history.length, lastClient: stats(allMs), wireBytes: users[2].lastBytes };
  console.log(`  last client p50 ${pct(allMs, 50)} ms · p95 ${pct(allMs, 95)} ms · broadcast ${users[2].lastBytes} B × 50 clients`);
  close(users);
}

console.log("\nSUMMARY " + JSON.stringify(summary));
process.exit(0);
