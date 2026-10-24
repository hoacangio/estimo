import { DurableObject } from "cloudflare:workers";
import { DECKS, DEFAULT_DECK } from "./decks.js";

const ROOM_RE = /^[a-z0-9-]{3,40}$/;
const MAX_HISTORY = 30;
const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const clean = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "";

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
      const stub = env.ROOM.get(env.ROOM.idFromName(room));
      return stub.fetch(req);
    }

    if (url.pathname === "/api/health") return Response.json({ ok: true });

    return env.ASSETS.fetch(req);
  },
};

/* ------------------------------------------------------------------ *
 * One Durable Object instance = one room.
 * Uses the WebSocket Hibernation API so idle rooms cost nothing.
 * ------------------------------------------------------------------ */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get("s")) ?? {
        topic: "",
        deck: DEFAULT_DECK,
        revealed: false,
        votes: {}, // clientId -> card
        history: [], // [{ topic, deck, votes: {name: card}, at }]
      };
    });
    // Heartbeats answered without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, name: "", spectator: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const me = ws.deserializeAttachment() ?? {};
    const s = this.s;
    let persist = true;

    if (msg.t !== "join" && !me.id) return; // must join first

    switch (msg.t) {
      case "join": {
        const id = clean(msg.id, 40);
        const name = clean(msg.name, 24);
        if (!id || !name) return;
        ws.serializeAttachment({ id, name, spectator: !!msg.spectator });
        persist = false;
        break;
      }
      case "rename": {
        const name = clean(msg.name, 24);
        if (!name) return;
        this.#updateSockets(me.id, { name });
        persist = false;
        break;
      }
      case "spectator": {
        this.#updateSockets(me.id, { spectator: !!msg.on });
        if (msg.on) delete s.votes[me.id];
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
          const final = DECKS[s.deck].cards.includes(msg.final) ? msg.final : null;
          s.history.unshift({ topic: s.topic || "Untitled", deck: s.deck, final, votes, at: Date.now() });
          s.history.length = Math.min(s.history.length, MAX_HISTORY);
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
        if (!DECKS[msg.deck] || s.deck === msg.deck) return;
        s.deck = msg.deck;
        s.votes = {};
        s.revealed = false;
        break;
      case "clearHistory":
        s.history = [];
        break;
      case "emote": { // lightweight, not persisted
        const e = clean(msg.e, 4);
        if (!["👍", "🎉", "🤔", "🔥"].includes(e)) return;
        this.#send({ t: "emote", from: me.id, e });
        return;
      }
      default:
        return;
    }

    if (persist) {
      await this.ctx.storage.put("s", s);
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }
    this.#broadcast();
  }

  // Inactive rooms are wiped after ROOM_TTL_MS without a change.
  async alarm() {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.s = { topic: "", deck: DEFAULT_DECK, revealed: false, votes: {}, history: [] };
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

  #send(payload, exclude) {
    const data = JSON.stringify(payload);
    for (const w of this.#sockets(exclude)) {
      try { w.send(data); } catch {}
    }
  }

  // Each socket gets its own view: hidden votes are never sent before reveal.
  #broadcast(exclude) {
    const s = this.s;
    const live = this.#sockets(exclude);
    const people = new Map(); // dedupe multiple tabs of the same user
    for (const w of live) {
      const a = w.deserializeAttachment();
      if (a?.id) people.set(a.id, a);
    }
    const participants = [...people.values()].map((p) => ({
      id: p.id,
      name: p.name,
      spectator: p.spectator,
      voted: p.id in s.votes,
      vote: s.revealed ? s.votes[p.id] ?? null : undefined,
    }));

    const base = {
      t: "state",
      topic: s.topic,
      deck: s.deck,
      decks: DECKS,
      revealed: s.revealed,
      participants,
      history: s.history,
    };
    for (const w of live) {
      const a = w.deserializeAttachment();
      if (!a?.id) continue;
      try { w.send(JSON.stringify({ ...base, mine: s.votes[a.id] ?? null })); } catch {}
    }
  }
}
