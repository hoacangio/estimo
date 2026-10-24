// Security test suite — attacks a running Estimo server over its real protocol.
//
//   node scripts/local-server.mjs 8787 &
//   node test/security.test.mjs http://localhost:8787
//
// Needs Node 22+ (global WebSocket). Exit code 1 if any test fails.

import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";

const BASE = new URL(process.argv[2] || "http://localhost:8787");
const WS_BASE = `${BASE.protocol === "https:" ? "wss" : "ws"}://${BASE.host}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const room = (tag) => `sec-${tag}-${crypto.randomBytes(3).toString("hex")}`;

/* ---------- tiny client ---------- */
function client(roomId, name, { id = crypto.randomUUID(), spectator = false, join = true, create = true } = {}) {
  const ws = new WebSocket(`${WS_BASE}/ws/${roomId}`);
  const c = { ws, id, name, states: [], raw: [], closed: null, last: null };
  ws.onmessage = (e) => {
    const data = typeof e.data === "string" ? e.data : "";
    c.raw.push(data);
    try { const m = JSON.parse(data); if (m.t === "state") { c.states.push(m); c.last = m; } } catch {}
  };
  ws.onclose = (e) => { c.closed = { code: e.code, reason: e.reason }; };
  c.ready = new Promise((res, rej) => {
    ws.onopen = () => { if (join) ws.send(JSON.stringify({ t: "join", id, name, spectator, create })); res(); };
    ws.onerror = () => rej(new Error("ws error"));
  });
  c.send = (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o));
  c.close = () => { try { ws.close(); } catch {} };
  c.settle = (ms = 400) => sleep(ms);
  return c;
}

/* raw HTTP upgrade so we can control headers (Origin, path) */
function upgrade(path, headers = {}) {
  return new Promise((resolve) => {
    const lib = BASE.protocol === "https:" ? https : http;
    const req = lib.request({
      host: BASE.hostname, port: BASE.port || (BASE.protocol === "https:" ? 443 : 80), path, method: "GET",
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"), ...headers },
    });
    req.on("upgrade", (res, sock) => { sock.destroy(); resolve(res.statusCode); });
    req.on("response", (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve(0));
    req.setTimeout(5000, () => { req.destroy(); resolve(0); });
    req.end();
  });
}
function get(path) {
  return new Promise((resolve) => {
    const lib = BASE.protocol === "https:" ? https : http;
    lib.get(new URL(path, BASE), (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b })); }).on("error", () => resolve({ status: 0, headers: {}, body: "" }));
  });
}

/* ---------- runner ---------- */
const results = [];
async function test(id, title, fn) {
  try { await fn(); results.push({ id, title, ok: true }); console.log(`  ✓ ${id} ${title}`); }
  catch (e) { results.push({ id, title, ok: false, err: e.message }); console.log(`  ✗ ${id} ${title}\n      → ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log(`Estimo security tests → ${BASE.origin}\n`);

/* 1. Confidentiality of votes */
await test("S01", "Votes are not sent to other clients before reveal", async () => {
  const r = room("leak"); const a = client(r, "Alice"), b = client(r, "Bob");
  await Promise.all([a.ready, b.ready]); await a.settle();
  a.send({ t: "vote", v: "13" }); await b.settle(400);
  const after = b.raw.slice(-3).join("\n");
  assert(!/"vote":"13"/.test(after), "Bob received Alice's vote value before reveal");
  const p = b.last.participants.find((x) => x.name === "Alice");
  assert(p && p.voted === true && p.vote === undefined, "Bob should only see that Alice voted");
  assert(b.last.mine == null, "Bob's 'mine' leaked another vote");
  a.close(); b.close();
});

await test("S02", "Secret client ids are never broadcast", async () => {
  const r = room("ids"); const a = client(r, "Alice"), b = client(r, "Bob");
  await Promise.all([a.ready, b.ready]); await b.settle(400);
  assert(!b.raw.join("").includes(a.id), "Alice's secret clientId appears in Bob's messages");
  a.close(); b.close();
});

await test("S03", "Cannot impersonate another participant to change their vote", async () => {
  const r = room("imp"); const victim = client(r, "Victim"), atk = client(r, "Mallory");
  await Promise.all([victim.ready, atk.ready]); await atk.settle();
  victim.send({ t: "vote", v: "5" }); await atk.settle();
  // Attacker reuses every id it can observe and tries to overwrite / withdraw the victim's vote
  const seen = atk.last.participants.find((p) => p.name === "Victim")?.id;
  const spoof = client(r, "Victim", { id: seen || "x" });
  await spoof.ready; await spoof.settle();
  spoof.send({ t: "vote", v: "5" }); // toggling the same value would withdraw it
  spoof.send({ t: "vote", v: "21" });
  await victim.settle(400);
  assert(victim.last.mine === "5", `victim's vote changed to ${victim.last.mine}`);
  victim.close(); atk.close(); spoof.close();
});

/* 2. Input validation */
await test("S04", "Votes outside the current deck are rejected", async () => {
  const r = room("deck"); const a = client(r, "Alice"); await a.ready; await a.settle();
  for (const v of ["999", "<img src=x onerror=alert(1)>", "", null, 5, { x: 1 }, "1".repeat(50)]) a.send({ t: "vote", v });
  await a.settle(400);
  assert(a.last.mine == null, `invalid vote accepted: ${JSON.stringify(a.last.mine)}`);
  a.close();
});

await test("S05", "Name and topic are length-limited and stripped of control characters", async () => {
  const r = room("len"); const a = client(r, "A\u0000B\u001b[31mC" + "x".repeat(100)); await a.ready; await a.settle();
  a.send({ t: "topic", text: "T\u0007" + "y".repeat(500) }); await a.settle(400);
  const me = a.last.participants[0];
  assert(me.name.length <= 24, `name length ${me.name.length}`);
  assert(!/[\u0000-\u001f]/.test(me.name), "control characters kept in name");
  assert(a.last.topic.length <= 200 && !/[\u0000-\u001f]/.test(a.last.topic), "topic not sanitised");
  a.close();
});

await test("S06", "Malformed, oversized, binary and unknown messages are ignored without crashing", async () => {
  const r = room("fuzz"); const a = client(r, "Alice"); await a.ready; await a.settle();
  a.send("{not json"); a.send("[]"); a.send("null"); a.send("42"); a.send({ t: "nope" }); a.send({});
  a.send(JSON.stringify({ t: "topic", text: "z".repeat(5000) }));
  a.ws.send(new Uint8Array([1, 2, 3, 4]));
  a.send({ t: "topic", text: "still alive" }); await a.settle(500);
  assert(!a.closed, `socket closed: ${JSON.stringify(a.closed)}`);
  assert(a.last.topic === "still alive", `server stopped responding (topic=${a.last.topic?.slice(0, 20)})`);
  a.close();
});

await test("S07", "Prototype-style ids (__proto__, constructor) cannot corrupt state", async () => {
  const r = room("proto"); const obs = client(r, "Observer"); await obs.ready;
  const p1 = client(r, "Proto", { id: "__proto__" }), p2 = client(r, "Ctor", { id: "constructor" }), p3 = client(r, "HasOwn", { id: "hasOwnProperty" });
  await Promise.all([p1.ready, p2.ready, p3.ready]); await obs.settle(400);
  for (const p of [p1, p2, p3]) p.send({ t: "vote", v: "3" });
  await obs.settle(400);
  const bad = obs.last.participants.filter((p) => ["Proto", "Ctor", "HasOwn"].includes(p.name) && p.voted);
  const ghost = obs.last.participants.filter((p) => ["Ctor", "HasOwn"].includes(p.name) && p.voted && !p.vote);
  assert(!obs.last.participants.some((p) => ["Proto", "Ctor", "HasOwn"].includes(p.name)) || bad.length === 0 || ghost.length === 0,
    `weird ids accepted: ${obs.last.participants.map((p) => p.name + ":" + p.voted).join(", ")}`);
  assert(!obs.last.participants.some((p) => ["Proto", "Ctor", "HasOwn"].includes(p.name)), "non-random client ids should be rejected at join");
  [obs, p1, p2, p3].forEach((c) => c.close());
});

await test("S08", "Actions sent before joining are ignored", async () => {
  const r = room("nojoin"); const a = client(r, "Alice"); await a.ready; await a.settle();
  a.send({ t: "vote", v: "3" });
  const ghost = client(r, "", { join: false }); await ghost.ready;
  ghost.send({ t: "reveal" }); ghost.send({ t: "topic", text: "pwned" }); ghost.send({ t: "deck", deck: "tshirt" });
  await a.settle(400);
  assert(!a.last.revealed && a.last.topic !== "pwned" && a.last.deck === "fibonacci", "un-joined socket changed the room");
  a.close(); ghost.close();
});

await test("S09", "Invalid deck, final estimate and emote values are rejected", async () => {
  const r = room("misc"); const a = client(r, "Alice"); await a.ready; await a.settle();
  a.send({ t: "deck", deck: "__proto__" }); a.send({ t: "deck", deck: "constructor" });
  a.send({ t: "vote", v: "3" }); a.send({ t: "reveal" });
  a.send({ t: "next", final: "<script>alert(1)</script>", topic: "next" });
  a.send({ t: "emote", e: "<b>" });
  await a.settle(400);
  assert(a.last.deck === "fibonacci", `deck became ${a.last.deck}`);
  assert(a.last.history[0] && a.last.history[0].final === null, `final stored as ${JSON.stringify(a.last.history[0]?.final)}`);
  assert(!a.raw.some((m) => m.includes('"emote"') && m.includes("<b>")), "invalid emote broadcast");
  a.close();
});

/* 3. Abuse / availability */
await test("S10", "Message flooding is rate-limited", async () => {
  const r = room("flood"); const a = client(r, "Flooder"); await a.ready; await a.settle();
  for (let i = 0; i < 400; i++) a.send({ t: "topic", text: "spam " + i });
  await a.settle(1500);
  const applied = a.states.filter((s) => s.topic.startsWith("spam")).length;
  assert(a.closed?.code === 1008 || applied < 100, `server processed ${applied}/400 flood messages without limiting`);
  a.close();
});

await test("S11", "Connections per room are capped", async () => {
  const r = room("cap"); const conns = [];
  for (let i = 0; i < 110; i++) conns.push(client(r, "c" + i));
  await Promise.allSettled(conns.map((c) => c.ready)); await sleep(1500);
  const alive = conns.filter((c) => c.ws.readyState === 1).length;
  conns.forEach((c) => c.close());
  assert(alive <= 100, `${alive} sockets stayed open in one room`);
});

await test("S12", "Cross-site WebSocket hijacking: foreign Origin is refused", async () => {
  const code = await upgrade(`/ws/${room("origin")}`, { Origin: "https://evil.example" });
  assert(code === 403, `foreign origin got HTTP ${code}`);
  const ok = await upgrade(`/ws/${room("origin")}`, { Origin: BASE.origin });
  assert(ok === 101, `same origin got HTTP ${ok}`);
});

await test("S13", "Malformed room ids are rejected at the edge", async () => {
  for (const p of ["/ws/..%2F..%2Fetc", "/ws/ab", "/ws/" + "a".repeat(41), "/ws/<script>", "/ws/a%00b"]) {
    const code = await upgrade(p, { Origin: BASE.origin });
    assert(code !== 101, `${p} was upgraded`);
  }
});

/* 4. Browser hardening */
await test("S14", "Security headers are set on the app shell", async () => {
  const { headers } = await get("/");
  const csp = headers["content-security-policy"] || "";
  assert(/frame-ancestors 'none'/.test(csp), "CSP missing frame-ancestors 'none' (clickjacking)");
  assert(/script-src 'self'(?![^;]*unsafe-inline)/.test(csp), "CSP missing or allows inline scripts");
  assert(headers["x-content-type-options"] === "nosniff", "missing X-Content-Type-Options: nosniff");
  assert(/strict-origin|no-referrer/.test(headers["referrer-policy"] || ""), "missing Referrer-Policy");
});

/* 5. Room ownership */
await test("S15", "Rooms are not created implicitly by visiting a URL", async () => {
  const r = room("ghost"); const a = client(r, "Alice", { create: false }); await a.ready; await a.settle(500);
  assert(a.raw.some((m) => m.includes('"not_found"')), "joining an unknown room without create did not fail");
  assert(a.closed?.code === 4004, `expected close 4004, got ${JSON.stringify(a.closed)}`);
});

await test("S16", "Only the host can delete a room; everyone is notified", async () => {
  const r = room("del"); const host = client(r, "Host"); await host.ready; await host.settle();
  const guest = client(r, "Guest", { create: false }); await guest.ready; await guest.settle();
  assert(guest.last.host === host.last.you && guest.last.host !== guest.last.you, "host id not reported correctly");
  guest.send({ t: "deleteRoom" }); await guest.settle();
  assert(!guest.closed && !host.closed, "a guest was able to delete the room");
  assert(guest.raw.some((m) => m.includes('"forbidden"')), "guest did not get a forbidden error");
  host.send({ t: "deleteRoom" }); await host.settle(500);
  assert(guest.raw.some((m) => m.includes('"t":"deleted"')) && guest.closed?.code === 4000, "guest was not notified of deletion");
  const again = client(r, "Late", { create: false }); await again.ready; await again.settle(400);
  assert(again.closed?.code === 4004, "deleted room still accepts joins");
});

await test("S17", "Each host can own at most MAX_ROOMS_PER_HOST rooms (default 5)", async () => {
  const hostId = crypto.randomUUID(); const made = [];
  for (let i = 0; i < 5; i++) { const c = client(room("lim" + i), "Host", { id: hostId }); await c.ready; await c.settle(250); made.push(c); }
  assert(made.every((c) => !c.closed && c.last?.host === c.last?.you), "first five rooms should be created");
  const sixth = client(room("lim6"), "Host", { id: hostId }); await sixth.ready; await sixth.settle(400);
  const err = sixth.raw.map((m) => { try { return JSON.parse(m); } catch { return {}; } }).find((m) => m.code === "room_limit");
  assert(err && err.max === 5 && err.rooms.length === 5 && sixth.closed?.code === 4003, "sixth room was not refused with the room list");
  made[0].send({ t: "deleteRoom" }); await made[0].settle(400);
  const retry = client(room("lim7"), "Host", { id: hostId }); await retry.ready; await retry.settle(400);
  assert(!retry.closed && retry.last?.host === retry.last?.you, "deleting a room did not free a slot");
  [...made, retry].forEach((c) => c.close());
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
