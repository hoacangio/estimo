// Offline dev server — runs Estimo without wrangler or any npm package.
// It serves public/ and runs the real `Room` class from src/worker.js
// against a minimal in-memory emulation of the Durable Object runtime.
//
//   node scripts/local-server.mjs [port]
//
// Use `npx wrangler dev` for the real Cloudflare runtime; this script is for
// quick UI work, tests, and machines where npm registry access is blocked.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8787);

/* ---------- load src/worker.js with a tiny shim for cloudflare:workers ---------- */
globalThis.WebSocketRequestResponsePair = class { constructor(req, res) { this.req = req; this.res = res; } };
const src = (await fs.readFile(path.join(ROOT, "src/worker.js"), "utf8"))
  .replace(/import\s*\{\s*DurableObject\s*\}\s*from\s*["']cloudflare:workers["'];?/,
    "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }")
  .replace(/from\s*["']\.\/decks\.js["']/, `from ${JSON.stringify(url.pathToFileURL(path.join(ROOT, "src/decks.js")).href)}`);
const tmp = path.join(ROOT, "scripts", ".worker.local.mjs");
await fs.writeFile(tmp, src);
const { Room, HostRegistry, isAllowedOrigin, MAX_CONNECTIONS } = await import(url.pathToFileURL(tmp).href + `?t=${Date.now()}`);
await fs.unlink(tmp).catch(() => {});

/* ---------- Durable Object runtime emulation ---------- */
function makeCtx(roomId) {
  const sockets = new Set();
  const store = new Map();
  return {
    sockets,
    id: { toString: () => crypto.createHash("sha256").update("room:" + roomId).digest("hex") },
    acceptWebSocket(ws) { sockets.add(ws); },
    getWebSockets() { return [...sockets].filter((s) => s.open); },
    setWebSocketAutoResponse() {},
    blockConcurrencyWhile(fn) { return fn(); },
    storage: {
      async get(k) { return structuredClone(store.get(k)); },
      async put(k, v) { store.set(k, structuredClone(v)); },
      async setAlarm() {},
      async deleteAll() { store.clear(); },
    },
  };
}
// Env mirrors wrangler.toml: [vars] + the HOSTS namespace (RPC calls are direct method calls here)
const VARS = { MAX_ROOMS_PER_HOST: process.env.MAX_ROOMS_PER_HOST || "5" };
const registries = new Map();
const env = {
  ...VARS,
  HOSTS: {
    idFromName: (name) => name,
    get(name) {
      if (!registries.has(name)) registries.set(name, new HostRegistry(makeCtx("host:" + name), env));
      return registries.get(name);
    },
  },
};

// roomId -> Promise<{ room, ctx }>. The promise is stored synchronously so that
// concurrent connections always share ONE instance, like idFromName() on Cloudflare.
const rooms = new Map();
function getRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, (async () => {
      const ctx = makeCtx(id);
      const room = new Room(ctx, env);
      room.code = id; // the Worker passes this as the X-Estimo-Room header
      await new Promise((r) => setTimeout(r, 0)); // let blockConcurrencyWhile finish
      return { room, ctx };
    })());
  }
  return rooms.get(id);
}

/* ---------- minimal RFC 6455 WebSocket server ---------- */
function frame(text) {
  const data = Buffer.from(text);
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x81, len])
    : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255])
    : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
  return Buffer.concat([head, data]);
}
function wrapSocket(sock) {
  let attachment = null;
  const ws = {
    open: true,
    send(t) { if (ws.open) sock.write(frame(t)); },
    close(code = 1000) { if (!ws.open) return; ws.open = false; const b = Buffer.alloc(2); b.writeUInt16BE(code); sock.end(Buffer.concat([Buffer.from([0x88, 2]), b])); },
    serializeAttachment(v) { attachment = structuredClone(v); },
    deserializeAttachment() { return structuredClone(attachment); },
  };
  return ws;
}

async function handleUpgrade(req, sock, roomId) {
  // Same checks as the Worker entry (origin) and Room.fetch (connection cap)
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) { sock.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
  const { ctx: c } = await getRoom(roomId);
  if (c.getWebSockets().length >= MAX_CONNECTIONS) { sock.end("HTTP/1.1 429 Too Many Requests\r\n\r\n"); return; }
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const { room, ctx } = await getRoom(roomId);
  const ws = wrapSocket(sock);
  ws.serializeAttachment({ id: null, name: "", spectator: false });
  ctx.acceptWebSocket(ws);

  let buf = Buffer.alloc(0);
  let queue = Promise.resolve(); // Durable Objects process events one at a time
  const onClose = () => {
    if (!ws.open && !ctx.sockets.has(ws)) return;
    ws.open = false; ctx.sockets.delete(ws);
    queue = queue.then(() => room.webSocketClose(ws, 1000)).catch(console.error);
  };
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i % 4])); }
      buf = buf.subarray(need);
      if (op === 8) { ws.close(1000); onClose(); return; }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 1) {
        const text = payload.toString("utf8");
        if (text === "ping") { ws.send("pong"); continue; } // setWebSocketAutoResponse
        queue = queue.then(() => room.webSocketMessage(ws, text)).catch(console.error);
      }
    }
  });
  sock.on("close", onClose);
  sock.on("error", onClose);
}

/* ---------- static files + routing (mirrors wrangler.toml) ---------- */
// Apply the "/*" block of public/_headers, as Workers Static Assets does in production
const HEADERS = {};
try {
  let inBlock = false;
  for (const line of (await fs.readFile(path.join(ROOT, "public/_headers"), "utf8")).split(/\r?\n/)) {
    if (/^\S/.test(line)) inBlock = line.trim() === "/*";
    else if (inBlock && line.includes(":")) { const i = line.indexOf(":"); HEADERS[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
} catch {}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/api/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
  let file = path.join(ROOT, "public", path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html"); }
  catch { file = path.join(ROOT, "public", "index.html"); } // single-page-application fallback
  try {
    const body = await fs.readFile(file);
    if (path.basename(file) === "_headers") throw new Error("hidden");
    res.writeHead(200, { ...HEADERS, "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("Not found"); }
});
server.on("upgrade", (req, sock) => {
  const m = new URL(req.url, "http://x").pathname.match(/^\/ws\/([a-z0-9-]{3,40})$/);
  if (!m || (req.headers.upgrade || "").toLowerCase() !== "websocket") { sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
  handleUpgrade(req, sock, m[1]).catch((e) => { console.error(e); sock.destroy(); });
});
server.listen(PORT, () => console.log(`Estimo (offline dev) → http://localhost:${PORT}`));
