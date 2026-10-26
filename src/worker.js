import { DurableObject } from "cloudflare:workers";
import { DECKS, DEFAULT_DECK } from "./decks.js";

const ROOM_RE = /^[a-z0-9-]{3,40}$/;
// Random UUID generated in the browser; anything else (low-entropy or prototype names) is refused
const CLIENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HISTORY = 30;
const MAX_MESSAGE_CHARS = 2000;
const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAX_CONNECTIONS = 100;           // sockets per room
const DEFAULT_MAX_ROOMS_PER_HOST = 5;          // override with the MAX_ROOMS_PER_HOST var
const RATE = { burst: 20, perSecond: 5, dropLimit: 40 }; // per-socket token bucket
const EMOTES = ["👍", "🎉", "🤔", "🔥"];

const clean = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";

// Own-property lookups only, so "constructor" or "__proto__" never resolve.
export const hasDeck = (k) => typeof k === "string" && Object.hasOwn(DECKS, k);
const own = (obj, k) => Object.hasOwn(obj, k);

/** Browsers always send Origin on WebSocket upgrades; refuse other sites (CSWSH). */
export function isAllowedOrigin(origin, host) {
  if (!origin) return true; // non-browser clients (CLI, tests) send none
  try { return new URL(origin).host === host; } catch { return false; }
}

async function sha256Hex(text, bytes = 32) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const publicId = (secret, salt) => sha256Hex(`${salt}:${secret}`, 8); // per-room, safe to broadcast
const hostKey = (secret) => sha256Hex(`host:${secret}`);               // global, never broadcast

/* ------------------------------------------------------------------ *
 * Edge entry: static assets are served by Cloudflare before this runs.
 * We only see /ws/:room (and /api/* reserved for future endpoints).
 * ------------------------------------------------------------------ */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    const m = url.pathname.match(/^\/ws\/([^/]+)$/);
    if (m) {
      const room = m[1].toLowerCase();
      if (!ROOM_RE.test(room)) return new Response("Bad room id", { status: 400 });
      if (req.headers.get("Upgrade") !== "websocket")
        return new Response("Expected WebSocket", { status: 426 });
      if (!isAllowedOrigin(req.headers.get("Origin"), url.host))
        return new Response("Forbidden origin", { status: 403 });
      const stub = env.ROOM.get(env.ROOM.idFromName(room));
      const fwd = new Request(req);
      fwd.headers.set("X-Estimo-Room", room);
      return stub.fetch(fwd);
    }

    if (url.pathname.startsWith("/api/")) return handleApi(req, url, env);

    return env.ASSETS.fetch(req);
  },
};

/**
 * REST endpoints (also used by scripts/local-server.mjs).
 *   GET  /api/health
 *   POST /api/host/rooms          { id }  — the rooms this browser hosts, and the limit
 *   POST /api/rooms/:code/delete  { id }  — host deletes a room without joining it
 * The secret client id is the credential (sent in the body, never the URL); only its hash
 * is stored as the room's host key.
 */
export async function handleApi(req, url, env) {
  const json = (body, status = 200, headers) => Response.json(body, { status, headers });
  if (url.pathname === "/api/health") return json({ ok: true });
  const del = url.pathname.match(/^\/api\/rooms\/([^/]+)\/delete$/);
  if (!del && url.pathname !== "/api/host/rooms") return json({ ok: false, code: "not_found" }, 404);
  if (req.method !== "POST") return json({ ok: false, code: "method" }, 405, { Allow: "POST" });
  if (!isAllowedOrigin(req.headers.get("Origin"), url.host)) return json({ ok: false, code: "origin" }, 403);
  if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return json({ ok: false, code: "bad_request" }, 415);
  const text = await req.text();
  if (text.length > 200) return json({ ok: false, code: "bad_request" }, 413);
  let body; try { body = JSON.parse(text); } catch { body = null; }
  const id = body && typeof body === "object" && typeof body.id === "string" && CLIENT_ID_RE.test(body.id) ? body.id : "";
  if (!id) return json({ ok: false, code: "bad_request" }, 400);
  const max = Number(env.MAX_ROOMS_PER_HOST) || DEFAULT_MAX_ROOMS_PER_HOST;

  if (!del) {
    const key = await hostKey(id);
    const rooms = await env.HOSTS.get(env.HOSTS.idFromName(key)).list();
    return json({ ok: true, rooms, max });
  }
  const room = del[1].toLowerCase();
  if (!ROOM_RE.test(room)) return json({ ok: false, code: "bad_request" }, 400);
  const res = await env.ROOM.get(env.ROOM.idFromName(room)).deleteByHost(id, room);
  return json({ ...res, max }, res.ok ? 200 : 403);
}

/* ------------------------------------------------------------------ *
 * One Durable Object instance = one room.
 * Uses the WebSocket Hibernation API so idle rooms cost nothing.
 *
 * Identity: each browser keeps a random secret `clientId`. The server only
 * ever broadcasts a salted hash of it (`pid`), so other participants cannot
 * learn the secret and impersonate someone to change their vote.
 * ------------------------------------------------------------------ */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    this.buckets = new WeakMap(); // ws -> rate-limit bucket (in-memory, reset on hibernation)
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("s");
      this.s = saved ?? Room.empty();
      if (saved && saved.exists === undefined) this.s.exists = true; // rooms from before hosts existed
      if (!hasDeck(this.s.deck)) this.s.deck = DEFAULT_DECK;         // repair rooms saved by older versions
    });
    // Heartbeats answered without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  static empty() {
    return { exists: false, code: null, host: null, topic: "", deck: DEFAULT_DECK, revealed: false, votes: {}, history: [] };
  }

  get maxRooms() { return Number(this.env?.MAX_ROOMS_PER_HOST) || DEFAULT_MAX_ROOMS_PER_HOST; }
  #registry(key) { return this.env.HOSTS.get(this.env.HOSTS.idFromName(key)); }

  async fetch(req) {
    this.code ??= req?.headers?.get("X-Estimo-Room") || null;
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS)
      return new Response("Room is full", { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, pid: null, name: "", spectator: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  #allow(ws) {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? { tokens: RATE.burst, t: now, dropped: 0 };
    b.tokens = Math.min(RATE.burst, b.tokens + ((now - b.t) / 1000) * RATE.perSecond);
    b.t = now;
    this.buckets.set(ws, b);
    if (b.tokens >= 1) { b.tokens -= 1; return true; }
    if (++b.dropped >= RATE.dropLimit) { try { ws.close(1008, "Rate limit exceeded"); } catch {} }
    return false;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_CHARS) return;
    if (!this.#allow(ws)) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.t !== "string") return;

    const me = ws.deserializeAttachment() ?? {};
    const s = this.s;
    let persist = true;
    let historyChanged = false;

    if (msg.t !== "join" && !me.id) return; // must join first

    switch (msg.t) {
      case "join": {
        const id = typeof msg.id === "string" && CLIENT_ID_RE.test(msg.id) ? msg.id : "";
        const name = clean(msg.name, 24);
        if (!id || !name) return;
        const pid = await publicId(id, this.ctx.id.toString());
        // Rooms must be created explicitly; a random URL does not create one.
        if (!s.exists) {
          if (msg.create !== true) return this.#reject(ws, { code: "not_found" }, 4004);
          const created = await this.#create(id, pid);
          if (!created.ok) return this.#reject(ws, { code: "room_limit", max: this.maxRooms, rooms: created.rooms }, 4003);
        }
        ws.serializeAttachment({ id, pid, name, spectator: msg.spectator === true });
        persist = false;
        break;
      }
      case "deleteRoom": {
        if (!s.host || me.pid !== s.host.pid) return this.#send({ t: "error", code: "forbidden" }, null, ws);
        await this.#destroy("deleted");
        return;
      }
      case "rename": {
        const name = clean(msg.name, 24);
        if (!name) return;
        this.#updateSockets(me.id, { name });
        persist = false;
        break;
      }
      case "spectator": {
        this.#updateSockets(me.id, { spectator: msg.on === true });
        if (msg.on === true) delete s.votes[me.id];
        break;
      }
      case "vote": {
        if (s.revealed || me.spectator) return;
        const card = clean(msg.v, 8);
        if (card === "" || s.votes[me.id] === card) delete s.votes[me.id]; // toggle off
        else if (DECKS[s.deck].cards.includes(card)) s.votes[me.id] = card;
        else return;
        break;
      }
      case "reveal":
        if (s.revealed) return;
        s.revealed = true;
        break;
      case "reset": // re-vote same ticket
        s.revealed = false;
        s.votes = {};
        break;
      case "next": { // archive result, move to next ticket
        if (s.revealed && Object.keys(s.votes).length) {
          const names = this.#nameMap();
          const votes = {};
          for (const [id, v] of Object.entries(s.votes)) votes[names[id] ?? "—"] = v;
          const final = typeof msg.final === "string" && DECKS[s.deck].cards.includes(msg.final) ? msg.final : null;
          s.history.unshift({ topic: s.topic || "Untitled", deck: s.deck, final, votes, at: Date.now() });
          s.history.length = Math.min(s.history.length, MAX_HISTORY);
          historyChanged = true;
        }
        s.revealed = false;
        s.votes = {};
        s.topic = clean(msg.topic, 200);
        break;
      }
      case "topic":
        s.topic = clean(msg.text, 200);
        break;
      case "deck":
        if (!hasDeck(msg.deck) || s.deck === msg.deck) return;
        s.deck = msg.deck;
        s.votes = {};
        s.revealed = false;
        break;
      case "clearHistory":
        s.history = [];
        historyChanged = true;
        break;
      case "emote": { // lightweight, not persisted
        if (!EMOTES.includes(msg.e)) return;
        this.#send({ t: "emote", from: me.pid, e: msg.e });
        return;
      }
      default:
        return;
    }

    if (persist) {
      await this.ctx.storage.put("s", s);
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }
    this.#broadcast(undefined, historyChanged);
  }

  // Inactive rooms are wiped after ROOM_TTL_MS without a change.
  async alarm() {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return;
    }
    await this.#destroy("expired");
  }

  /* ---------------- room lifecycle ---------------- */

  // Reserve a slot in the host's registry, then mark the room as created.
  // Concurrent creates for the same room are serialised through one promise.
  async #create(secretId, pid) {
    if (this.creating) await this.creating;
    if (this.s.exists) return { ok: true };
    this.creating = (async () => {
      const key = await hostKey(secretId);
      const code = this.code || "unknown";
      const res = await this.#registry(key).reserve(code, this.maxRooms);
      if (!res.ok) return res;
      Object.assign(this.s, { exists: true, code, host: { pid, key }, createdAt: Date.now() });
      await this.ctx.storage.put("s", this.s);
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return res;
    })();
    try { return await this.creating; } finally { this.creating = null; }
  }

  // RPC from the edge Worker: the host deletes the room from the home page.
  async deleteByHost(secretId, code) {
    const key = await hostKey(secretId);
    if (!this.s.exists) { // already gone (expired or deleted): just free a stale slot, if any
      try { await this.#registry(key).release(code); } catch {}
      return { ok: true, gone: true };
    }
    if (this.s.host?.key !== key) return { ok: false, code: "forbidden" };
    await this.#destroy("deleted");
    return { ok: true };
  }

  // Delete everything and free the host's slot; connected clients are told why.
  async #destroy(reason) {
    const { host, code } = this.s;
    for (const w of this.ctx.getWebSockets()) {
      try { w.send(JSON.stringify({ t: "deleted", reason })); w.close(4000, `Room ${reason}`); } catch {}
    }
    if (host?.key && code) { try { await this.#registry(host.key).release(code); } catch {} }
    await this.ctx.storage.deleteAll();
    this.s = Room.empty();
  }

  #reject(ws, payload, closeCode) {
    try { ws.send(JSON.stringify({ t: "error", ...payload })); ws.close(closeCode, payload.code); } catch {}
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this.#broadcast(ws);
  }

  async webSocketError(ws) {
    this.#broadcast(ws);
  }

  /* ---------------- helpers ---------------- */

  #sockets(exclude) {
    return this.ctx.getWebSockets().filter((w) => w !== exclude);
  }

  #updateSockets(id, patch) {
    for (const w of this.ctx.getWebSockets()) {
      const a = w.deserializeAttachment();
      if (a?.id === id) w.serializeAttachment({ ...a, ...patch });
    }
  }

  #nameMap() {
    const m = {};
    for (const w of this.ctx.getWebSockets()) {
      const a = w.deserializeAttachment();
      if (a?.id) m[a.id] = a.name;
    }
    return m;
  }

  #send(payload, exclude, only) {
    const data = JSON.stringify(payload);
    for (const w of only ? [only] : this.#sockets(exclude)) {
      try { w.send(data); } catch {}
    }
  }

  // Each socket gets its own view: hidden votes are never sent before reveal,
  // and secret client ids never leave the server (only their salted hash `pid`).
  #broadcast(exclude, historyChanged = false) {
    const s = this.s;
    const live = this.#sockets(exclude);
    const people = new Map(); // dedupe multiple tabs of the same user
    for (const w of live) {
      const a = w.deserializeAttachment();
      if (a?.id) people.set(a.id, a);
    }
    const participants = [...people.values()].map((p) => ({
      id: p.pid,
      name: p.name,
      spectator: p.spectator,
      voted: own(s.votes, p.id),
      vote: s.revealed ? (own(s.votes, p.id) ? s.votes[p.id] : null) : undefined,
    }));

    // Shared part is serialised once; per-socket fields are appended as strings.
    // `decks` and `history` are only sent to sockets that have not synced yet,
    // or when they changed — a vote broadcast stays ~1 KB instead of ~10 KB.
    const shared = JSON.stringify({ t: "state", topic: s.topic, deck: s.deck, revealed: s.revealed, host: s.host?.pid ?? null, maxRooms: this.maxRooms, participants }).slice(0, -1);
    let historyJson = null, decksJson = null;
    for (const w of live) {
      const a = w.deserializeAttachment();
      if (!a?.id) continue;
      const mine = own(s.votes, a.id) ? s.votes[a.id] : null;
      let msg = `${shared},"you":${JSON.stringify(a.pid)},"mine":${JSON.stringify(mine)}`;
      if (!a.synced || historyChanged) msg += `,"history":${(historyJson ??= JSON.stringify(s.history))}`;
      if (!a.synced) {
        msg += `,"decks":${(decksJson ??= JSON.stringify(DECKS))}`;
        w.serializeAttachment({ ...a, synced: true });
      }
      try { w.send(msg + "}"); } catch {}
    }
  }
}

/* ------------------------------------------------------------------ *
 * One instance per host (keyed by a hash of the host's secret client id).
 * Tracks which rooms the host owns, so the per-host room limit holds across
 * every Room object. Called from Room via Durable Object RPC.
 * ------------------------------------------------------------------ */
export class HostRegistry extends DurableObject {
  async #rooms() { return (await this.ctx.storage.get("rooms")) ?? []; }

  async reserve(code, max) {
    const rooms = await this.#rooms();
    if (rooms.includes(code)) return { ok: true, rooms };
    if (rooms.length >= max) return { ok: false, rooms };
    rooms.push(code);
    await this.ctx.storage.put("rooms", rooms);
    return { ok: true, rooms };
  }

  async release(code) {
    const rooms = (await this.#rooms()).filter((c) => c !== code);
    await this.ctx.storage.put("rooms", rooms);
    return rooms;
  }

  async list() { return this.#rooms(); }
}
