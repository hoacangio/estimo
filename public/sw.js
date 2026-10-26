/* Estimo service worker.
 *
 * Strategy: network-first for our own files, falling back to the cache.
 * - Online, every request goes to the network as before, so a deploy is
 *   picked up immediately (no stale app.js after CI ships a new version).
 * - Offline or on a flaky network, the app shell still opens from the cache
 *   and shows its "reconnecting" state instead of the browser's error page.
 * Realtime traffic (/ws/*) and the API (/api/*) are never touched.
 */
const CACHE = "estimo-shell-v2";
const SHELL = [
  "/", "/app.js", "/qr.js", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png",
];
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // fonts etc.: browser default
  if (url.pathname.startsWith("/ws/") || url.pathname.startsWith("/api/")) return;

  // Every page route (/, /r/:room) is the same single-page shell.
  const key = req.mode === "navigate" ? "/" : url.pathname;
  event.respondWith(networkFirst(req, key));
});

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
