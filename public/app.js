"use strict";
/* ============================================================
   Estimo client — vanilla JS, no build step.
   All user-provided strings go through esc() before rendering.
   ============================================================ */

// Web fonts are injected from script so they never block first paint
// (system fallbacks render immediately, then swap in).
function loadFont(href) {
  if (document.querySelector(`link[data-font="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.dataset.font = href;
  document.head.appendChild(l);
}
loadFont("https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap");

const LS = {
  get(k, d) { try { const v = localStorage.getItem("estimo." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("estimo." + k, JSON.stringify(v)); } catch {} },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);

const ICON = {
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  cup: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
};
const icon = (n, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const LOGO = `<svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true"><rect class="back" x="3" y="6" width="14" height="19" rx="3"/><rect class="front" x="11" y="3" width="14" height="19" rx="3"/></svg>`;

// Deck labels for the home screen (server sends the authoritative list in each room).
const HOME_DECKS = [
  ["fibonacci", "Fibonacci", "0 1 2 3 5 8 13 21 34 ? ☕"],
  ["modified", "Modified Fib.", "0 ½ 1 2 3 5 8 13 20 40 100 ? ☕"],
  ["scale10", "1 – 10", "1 2 3 4 5 6 7 8 9 10 ? ☕"],
  ["tshirt", "T-shirt", "XS S M L XL XXL ? ☕"],
  ["pow2", "Powers of 2", "1 2 4 8 16 32 64 ? ☕"],
];
const META = new Set(["?", "☕"]);

/* ---------------- identity & prefs ---------------- */
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
}
const me = {
  id: LS.get("clientId", null) || (() => { const id = uuid(); LS.set("clientId", id); return id; })(),
  get name() { return LS.get("name", ""); },
  set name(v) { LS.set("name", v); },
};

/* ---------------- themes ----------------
   system | light | dark are built in. Fun themes live in /themes/<name>.css and
   are loaded only when chosen, so the default theme downloads none of them. */
const RETRO = "retro2007";
const FUN_THEMES = {
  retro2007: { label: "Retro 2007", dark: false, font: "family=Varela+Round",
               hello: "Chào mừng trở lại năm 2007! Xem tốt nhất ở 1024×768 ;)" },
  cinema:    { label: "Cinema", dark: true, font: "family=Bebas+Neue&family=Archivo:wght@400;500;700",
               hello: "Now showing: your sprint planning" },
  samurai:   { label: "Samurai", dark: false, font: "family=Shippori+Mincho:wght@500;700&family=Yuji+Syuku",
               hello: "道 — The way of the estimate" },
  mission:   { label: "Mission Control", dark: true, font: "family=Orbitron:wght@500;700&family=Share+Tech+Mono",
               hello: "All systems go. Mission control online." },
};
// Per-theme copy swaps, keyed by the default English text. The meaning always stays.
const THEME_COPY = {
  cinema: { "Now estimating": "Now showing", "Reveal cards": "▶ Play reveal", "Save &amp; next ticket": "Next episode »",
            "Invite": "Share", "Create a new room": "Start a watch party", "Join": "Join", "Participants": "Cast",
            "History": "Previously on…", "Re-vote": "Rewatch" },
  samurai: { "Now estimating": "任務 · Current quest", "Reveal cards": "抜刀 · Reveal", "Save &amp; next ticket": "次へ · Next quest",
             "Invite": "招待 · Invite", "Create a new room": "道場を開く · Open a dojo", "Join": "入門", "Participants": "侍 · Warriors",
             "History": "巻物 · Scroll", "Re-vote": "再戦 · Again" },
  mission: { "Now estimating": "Mission objective", "Reveal cards": "Initiate reveal", "Save &amp; next ticket": "Next objective ›",
             "Invite": "Uplink", "Create a new room": "Launch new mission", "Join": "Dock", "Participants": "Crew",
             "History": "Mission log", "Re-vote": "Abort & retry" },
};
const currentTheme = () => document.documentElement.getAttribute("data-theme") || "";
function ensureThemeAssets(name) {
  const t = FUN_THEMES[name]; if (!t) return;
  if (!document.getElementById("theme-css-" + name)) {
    const l = document.createElement("link");
    l.id = "theme-css-" + name; l.rel = "stylesheet"; l.href = `/themes/${name}.css`;
    l.onload = () => refitHome(); // theme metrics change the home layout
    document.head.appendChild(l);
  }
  loadFont(`https://fonts.googleapis.com/css2?${t.font}&display=swap`);
}
function applyTheme() {
  let t = LS.get("theme", "system");
  if (!["system", "light", "dark"].includes(t) && !FUN_THEMES[t]) t = "system";
  ensureThemeAssets(t);
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
const isRetro = () => currentTheme() === RETRO;
function isDark() {
  const t = currentTheme();
  if (FUN_THEMES[t]) return FUN_THEMES[t].dark;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}
function toggleTheme() { LS.set("theme", isDark() ? "light" : "dark"); applyTheme(); render(); }
function setTheme(name) {
  LS.set("theme", FUN_THEMES[name] ? name : "system");
  withTransition(() => { applyTheme(); render(); });
  if (FUN_THEMES[name]) toast(FUN_THEMES[name].hello);
}
function toggleRetro() { setTheme(isRetro() ? "" : RETRO); }
// T(english, retroVietnamese): retro gets 9x-era Vietnamese, other fun themes use THEME_COPY.
const T = (en, vi = en) => (isRetro() ? vi : THEME_COPY[currentTheme()]?.[en] ?? en);
const visits = (() => { const n = LS.get("visits", 0) + 1; LS.set("visits", n); return n; })();
applyTheme();

/* ---------------- room codes ---------------- */
const ADJ = ["calm","brave","swift","quiet","bright","lucky","clever","gentle","bold","merry","sunny","witty","eager","fuzzy","jolly","keen","mellow","nimble","proud","tidy"];
const NOUN = ["otter","falcon","panda","tiger","koala","heron","lotus","maple","comet","river","harbor","cedar","finch","lynx","orca","pebble","quokka","sparrow","willow","yak"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const newRoomCode = () => `${pick(ADJ)}-${pick(NOUN)}-${10 + Math.floor(Math.random() * 90)}`;
const normalizeCode = (s) => String(s || "").trim().toLowerCase().replace(/^.*\/r\//, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const validCode = (s) => /^[a-z0-9-]{3,40}$/.test(s);

/* ---------------- app state ---------------- */
const ui = {
  route: "home",        // home | room
  room: null,           // room code
  homeDeck: LS.get("lastDeck", "scale10"),
  state: null,          // last server snapshot
  connected: false,
  everConnected: false,
  rtt: null,
  showInvite: false,
  fullInvite: false,
  final: null,          // chosen final estimate after reveal
  pendingDeck: null,    // deck chosen on Home for a brand-new room
  joinError: "",
  dealAt: {},          // participant id -> time their card was dealt (one-shot animation)
};

/* ---------------- routing ---------------- */
function parseRoute() {
  const m = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (m) { ui.route = "room"; ui.room = normalizeCode(decodeURIComponent(m[1])); }
  else { ui.route = "home"; ui.room = null; }
}
// Big UI changes (screens, dialogs, themes) animate with the View Transitions API.
// Realtime updates never do: they must stay instant.
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function withTransition(update) {
  if (!document.startViewTransition || reducedMotion() || isRetro()) return update();
  document.startViewTransition(update);
}
function go(path) { history.pushState(null, "", path); withTransition(onRoute); }
function onRoute() {
  parseRoute();
  if (ui.route !== "room" || ui.roomError?.room !== ui.room) ui.roomError = null;
  if (ui.route === "room" && validCode(ui.room) && me.name && !ui.roomError) connect();
  else disconnect();
  render();
}
window.addEventListener("popstate", () => withTransition(onRoute));

/* ---------------- websocket ---------------- */
let ws = null, wsRoom = null, retry = 0, retryTimer = null, pingTimer = null, pingSent = 0;

function connect() {
  if (ws && wsRoom === ui.room && ws.readyState <= 1) return;
  if (wsRoom !== ui.room) disconnect(); // switching rooms: drop old state
  clearTimeout(retryTimer);
  wsRoom = ui.room;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/${encodeURIComponent(wsRoom)}`);
  const sock = ws;
  sock.onopen = () => {
    retry = 0;
    ui.connected = true; ui.everConnected = true;
    send({ t: "join", id: me.id, name: me.name, spectator: LS.get("spectator", false), create: ui.pendingCreate === wsRoom });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (sock.readyState === 1) { pingSent = performance.now(); sock.send("ping"); } }, 15000);
    pingSent = performance.now(); sock.send("ping");
    render();
  };
  sock.onmessage = (e) => {
    if (e.data === "pong") { ui.rtt = Math.round(performance.now() - pingSent); updateLive(); return; }
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.t === "state") onState(msg);
    else if (msg.t === "error") onServerError(msg);
    else if (msg.t === "deleted") onRoomDeleted(msg);
  };
  sock.onclose = (e) => {
    if (sock !== ws) return;
    if (e.code >= 4000 && e.code < 4100) { ws = null; ui.connected = false; clearInterval(pingTimer); render(); return; } // final: no retry
    ui.connected = false; clearInterval(pingTimer);
    const delay = Math.min(8000, 500 * 2 ** retry++);
    retryTimer = setTimeout(() => { if (ui.route === "room" && wsRoom === ui.room) connect(); }, delay);
    render();
  };
}
function disconnect() {
  clearTimeout(retryTimer); clearInterval(pingTimer);
  ui.drawerOpen = false; ui.drawerLeaveAt = null;
  if (ws) { const s = ws; ws = null; try { s.close(1000); } catch {} }
  wsRoom = null; ui.state = null; ui.connected = false; ui.showInvite = false; ui.final = null;
}
function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function forget(code) { LS.set("recentRooms", LS.get("recentRooms", []).filter((r) => r.code !== code)); }
function onServerError(msg) {
  if (msg.code === "not_found") {
    ui.roomError = { room: ui.room, code: "not_found" }; forget(ui.room); disconnect(); render();
  } else if (msg.code === "room_limit") {
    ui.pendingCreate = null;
    ui.limitInfo = { max: msg.max, rooms: Array.isArray(msg.rooms) ? msg.rooms : [] };
    disconnect(); go("/");
  } else if (msg.code === "forbidden") {
    toast("Only the host can do that.");
  }
}
function onRoomDeleted(msg) {
  const code = ui.room;
  forget(code); disconnect();
  ui.roomError = { room: code, code: msg.reason === "expired" ? "expired" : "deleted" };
  render();
}

/* Optimistic voting: the card flips instantly, the message is sent in parallel,
   and the next server snapshot is the source of truth. */
function applyOptimisticVote(s, v) {
  s.mine = v;
  const me = s.participants.find((p) => p.id === s.you);
  if (me) me.voted = v !== null;
}
function vote(card) {
  const s = ui.state;
  if (!s || s.revealed || !ws || ws.readyState !== 1) return;
  const next = s.mine === card ? null : card; // clicking your card again withdraws it
  ui.pendingVote = { v: next, deck: s.deck, at: performance.now() };
  ui.pop = { v: next, at: performance.now() };
  if (next !== null && !s.mine) ui.dealAt[s.you] = performance.now();  // my own card lands on the table
  if (next !== null && navigator.vibrate && matchMedia("(pointer: coarse)").matches) { try { navigator.vibrate(8); } catch {} }
  applyOptimisticVote(s, next);
  render();                       // instant feedback
  send({ t: "vote", v: card });   // server round trip runs in the background
}

function onState(s) {
  const prev = ui.state;
  // The server only sends `decks` and `history` on first sync or when they change.
  if (!s.decks) s.decks = prev?.decks;
  if (!s.history) s.history = prev?.history || [];
  if (!s.decks) return; // not synced yet (should not happen: first state is always full)
  // Keep an optimistic vote until the server confirms it, so a broadcast caused by
  // someone else (sent before ours was processed) doesn't flicker the card back.
  const pv = ui.pendingVote;
  if (pv) {
    const confirmed = s.mine === pv.v || s.revealed || s.deck !== pv.deck;
    if (confirmed || performance.now() - pv.at > 3000) ui.pendingVote = null;
    else applyOptimisticVote(s, pv.v);
  }
  ui.state = s;
  if (ui.pendingCreate === ui.room) { ui.pendingCreate = null; ui.limitInfo = null; }
  // Brand-new room created from Home: apply the chosen deck once.
  if (ui.pendingDeck) {
    const fresh = !s.history.length && s.participants.length <= 1;
    if (fresh && s.deck !== ui.pendingDeck && s.decks[ui.pendingDeck]) send({ t: "deck", deck: ui.pendingDeck });
    ui.pendingDeck = null;
  }
  // Deal a face-down card for each participant whose vote just arrived (not on first load)
  if (prev) {
    const was = new Map(prev.participants.map((p) => [p.id, p.voted]));
    for (const p of s.participants) if (p.voted && was.has(p.id) && !was.get(p.id) && p.id !== s.you) ui.dealAt[p.id] = performance.now();
  }
  if (s.revealed && prev && !prev.revealed && navigator.vibrate && matchMedia("(pointer: coarse)").matches) { try { navigator.vibrate([10, 40, 10]); } catch {} }
  if (!s.revealed) ui.final = null;
  else if (!prev || !prev.revealed) { ui.final = suggestFinal(s); ui.flipAt = performance.now(); }
  remember(ui.room, s.deck, s.host && s.host === s.you);
  render();
}

function remember(code, deck, host) {
  if (!code) return;
  const list = LS.get("recentRooms", []).filter((r) => r.code !== code);
  const old = LS.get("recentRooms", []).find((r) => r.code === code);
  list.unshift({ code, deck: deck || old?.deck || "", host: host ?? old?.host ?? false, at: Date.now() });
  LS.set("recentRooms", list.slice(0, 5));
}

/* ---------------- stats ---------------- */
const numeric = (v) => (v === "½" ? 0.5 : /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
function median(arr) { const a = [...arr].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

function computeStats(s) {
  const cards = s.decks[s.deck].cards.filter((c) => !META.has(c));
  const votes = s.participants.filter((p) => !p.spectator && p.vote != null).map((p) => p.vote);
  const real = votes.filter((v) => cards.includes(v));
  if (!real.length) return null;
  const idx = real.map((v) => cards.indexOf(v));
  const medIdx = median(idx);
  const counts = new Map();
  real.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const dist = cards.filter((c) => counts.has(c)).map((c) => ({ v: c, n: counts.get(c) }));
  const top = Math.max(...dist.map((d) => d.n));
  const mode = dist.find((d) => d.n === top).v;
  const nums = real.map(numeric);
  const allNum = nums.every((n) => n !== null);
  const outliers = new Set(real.filter((v) => Math.abs(cards.indexOf(v) - medIdx) >= 2 && (cards.indexOf(v) === Math.min(...idx) || cards.indexOf(v) === Math.max(...idx))));
  return {
    count: real.length,
    avg: allNum ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
    median: allNum ? median(nums) : cards[Math.round(medIdx)],
    min: cards[Math.min(...idx)], max: cards[Math.max(...idx)],
    agreement: Math.round((top / real.length) * 100), mode, top,
    dist, outliers, medIdx, cards,
    unanimous: dist.length === 1,
  };
}
function suggestFinal(s) {
  const st = computeStats(s);
  if (!st) return null;
  if (st.unanimous) return st.mode;
  if (typeof st.median === "number") {
    // nearest card to the numeric median (ties go up — estimates round up)
    let best = null, bd = Infinity;
    for (const c of st.cards) { const n = numeric(c); if (n === null) continue; const d = Math.abs(n - st.median); if (d < bd || (d === bd && n > numeric(best))) { best = c; bd = d; } }
    return best;
  }
  return st.cards[Math.round(st.medIdx)];
}
const fmt = (n) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

/* ---------------- render ---------------- */
const app = $("#app");
// Phones: keep the home screen to one screen. Show fewer recent rooms per page first,
// then shorten the install tip, until nothing scrolls.
function fitHome() {
  if (!matchMedia("(max-width: 640px)").matches) return;
  const over = () => document.scrollingElement.scrollHeight > innerHeight;
  for (let per = 4; over() && per >= 1; per--) { ui.recentPer = per; app.innerHTML = viewHome(); }
  if (over()) app.querySelector(".home")?.classList.add("tight");
}
let fitTimer;
function refitHome() { if (ui.route !== "home") return; clearTimeout(fitTimer); fitTimer = setTimeout(render, 120); }
addEventListener("resize", refitHome);
document.fonts?.addEventListener?.("loadingdone", refitHome);
function render() {
  const active = document.activeElement;
  const keep = active && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd, value: active.value } : null;
  // Infinite decorative animations use animation-delay: var(--clock). A negative delay equal to
  // the time since page load puts every freshly rendered element at the same phase as the one it
  // replaces, so the radar sweep, ticker and blink never jump back to the start.
  document.documentElement.style.setProperty("--clock", `${-Math.round(performance.now())}ms`);
  // Capture how full the vote bar looks right now, mid-animation included, so the
  // re-rendered bar continues from there instead of jumping.
  const oldBar = app.querySelector(".progress [data-to]");
  ui.lastPct = oldBar ? (oldBar.getBoundingClientRect().width / oldBar.parentElement.getBoundingClientRect().width) * 100 : undefined;
  if (ui.route === "home") { ui.recentPer = null; app.innerHTML = viewHome(); fitHome(); }
  else if (!validCode(ui.room)) app.innerHTML = viewBadRoom();
  else if (ui.roomError) app.innerHTML = viewRoomError();
  else if (!me.name) app.innerHTML = viewGate();
  else app.innerHTML = viewRoom();
  if (ui.showInvite) drawQR();
  // The bar was rendered at the width the old bar was showing; now slide it to its target.
  const bar = app.querySelector(".progress [data-to]");
  if (bar && bar.style.width !== bar.dataset.to + "%") { void bar.offsetWidth; bar.style.width = bar.dataset.to + "%"; }

  if (keep) { const el = document.getElementById(keep.id); if (el) { if (el.tagName === "INPUT" && !el.readOnly && keep.value != null) el.value = keep.value; el.focus(); try { if (keep.start != null) el.setSelectionRange(keep.start, keep.end); } catch {} } }
  document.title = ui.route === "room" ? `${ui.room} · Estimo` : "Estimo — planning poker";
}

function themeBtn(size = "") {
  return `<span class="theme-btns"><button class="btn btn-icon ${size}" data-act="theme" aria-label="${isDark() ? "Switch to light mode" : "Switch to dark mode"}">${icon(isDark() ? "sun" : "moon")}</button>`
    + `<label class="sr-only" for="theme-pick">Theme</label><select id="theme-pick" class="select theme-pick" data-act="themePick" title="Fun themes">`
    + `<option value="">Default theme</option>${Object.entries(FUN_THEMES).map(([k, t]) => `<option value="${k}" ${currentTheme() === k ? "selected" : ""}>${t.label}</option>`).join("")}</select></span>`;
}
function retroTicker() {
  if (!isRetro()) return "";
  return `<div class="r-ticker" aria-hidden="true"><span>★ Mới! Estimo giờ đã có QR code — quét là vào! ★ Hỗ trợ thang 1–10, Fibonacci, T-shirt ★ Không cần đăng ký, không spam ★ Web 2.0 ready ★ Gõ ↑↑↓↓←→←→BA để quay về 2026 ★</span></div>`;
}
function retroFooter() {
  const digits = String(128734 + visits).padStart(7, "0").split("").map((d) => `<b>${d}</b>`).join("");
  const badge = (l, v, c) => `<span class="r-badge"><i>${l}</i><em style="background:${c}">${v}</em></span>`;
  return `<footer class="r-footer" aria-hidden="true">
    <div>Bạn là người truy cập thứ</div><div class="r-counter">${digits}</div>
    <div class="r-badges">${badge("W3C", "XHTML 1.0", "#1f5aa6")}${badge("CSS", "valid!", "#3f7a14")}${badge("RSS", "2.0 feed", "#b34d00")}${badge("Web", "2.0 ready", "#c2105e")}${badge("get", "Firefox 2", "#a8410b")}</div>
    <div>Xem tốt nhất với Firefox 2 hoặc IE7, độ phân giải 1024×768 · © 2007 Estimo Inc.</div>
  </footer>`;
}

function viewHome() {
  const recent = LS.get("recentRooms", []);
  const RECENT_PAGE = ui.recentPer || 5; // fitHome() lowers this on short phones
  const pages = Math.max(1, Math.ceil(recent.length / RECENT_PAGE));
  const page = ui.recentPage = Math.min(Math.max(0, ui.recentPage || 0), pages - 1);
  const deck = HOME_DECKS.find((d) => d[0] === ui.homeDeck) || HOME_DECKS[2];
  return `
  <div class="home">
    <header>
      <a class="logo" href="/" data-nav="/">${LOGO}<b>Estimo</b></a>
      ${themeBtn()}
    </header>
    ${retroTicker()}
    <main>
      <div class="wrap">
        <section class="hero">
          <p class="eyebrow">${T("Planning poker", "Web 2.0 · Không cần đăng ký!")}</p>
          <h1>${T("Estimate together, in real time.", "Ước lượng cùng nhau, nhanh như chớp!")}</h1>
          <p>Create a room, invite your team with a link or QR code, and vote together. Supports Fibonacci, modified Fibonacci, T-shirt sizes, powers of 2 and a 1–10 scale.</p>
          <div class="fan" aria-hidden="true"><div>3</div><div>5</div><div>8</div>${isRetro() ? '<span class="starburst">100% miễn phí!</span>' : ""}</div>
        </section>
        <section class="panel card">
          <form id="create-form">
            <label class="label" for="nick">Your nickname</label>
            <input class="input" id="nick" maxlength="24" autocomplete="nickname" value="${esc(ui.draftNick ?? me.name)}" placeholder="e.g. Hòa" required>
            ${me.name ? `<div class="hint saved-hint">${icon("check")}Saved on this device</div>` : `<div class="hint saved-hint">Saved on this device</div>`}
            <div class="deck-field">
              <span class="label">Voting scale</span>
              <div class="decks" role="group" aria-label="Voting scale">
                ${HOME_DECKS.map(([k, l]) => `<button type="button" class="chip" data-act="homeDeck" data-deck="${k}" aria-pressed="${k === ui.homeDeck}">${l}</button>`).join("")}
              </div>
              <div class="hint mono deck-hint">${esc(deck[2])}</div>
            </div>
            <button class="btn btn-primary btn-lg create-btn" type="submit">${T("Create a new room", "Tạo phòng ngay »")}</button>
          </form>
          <div class="divider">or join an existing one</div>
          <form id="join-form" class="join-row">
            <label class="sr-only" for="code">Room code</label>
            <input class="input" id="code" value="${esc(ui.draftCode ?? "")}" placeholder="e.g. calm-otter-42" autocapitalize="off" autocomplete="off" spellcheck="false">
            <button class="btn" type="submit" style="height:48px;border-color:var(--ink)">${T("Join", "Vào!")}</button>
          </form>
          ${ui.limitInfo ? `<div class="notice" role="alert"><strong>Room limit reached (${ui.limitInfo.max}).</strong> Delete a room to create a new one:
            <div class="notice-rooms">${ui.limitInfo.rooms.map((c) => `<a class="mono" href="/r/${esc(c)}" data-nav="/r/${esc(c)}">${esc(c)}</a>`).join("")}</div></div>` : ""}
          ${ui.joinError ? `<div class="hint" style="color:var(--bad)">${esc(ui.joinError)}</div>` : ""}
          ${viewInstall()}
          ${recent.length ? `
          <div class="recent">
            <div class="recent-head"><h2>Recent rooms</h2>${pages > 1 ? `<div class="pager" role="group" aria-label="Recent rooms pages">
              <button type="button" class="btn btn-icon btn-sm" data-act="recentPage" data-dir="-1" aria-label="Previous page" ${page === 0 ? "disabled" : ""}>‹</button>
              <span class="muted">${page + 1}/${pages}</span>
              <button type="button" class="btn btn-icon btn-sm" data-act="recentPage" data-dir="1" aria-label="Next page" ${page === pages - 1 ? "disabled" : ""}>›</button></div>` : ""}</div>
            ${recent.slice(page * RECENT_PAGE, page * RECENT_PAGE + RECENT_PAGE).map((r) => `<a href="/r/${esc(r.code)}" data-nav="/r/${esc(r.code)}"><span class="mono">${esc(r.code)}${r.host ? ' <span class="tag">Host</span>' : ""}</span><span class="muted" style="font-size:13px">${esc(ago(r.at))}${r.deck ? " · " + esc(deckLabel(r.deck)) : ""}</span></a>`).join("")}
          </div>` : ""}
        </section>
      </div>
    </main>
    ${isRetro() ? retroFooter() : `<footer><span>Rooms are deleted after 30 days of inactivity.</span><span>v1.0</span></footer>`}
  </div>`;
}
function deckLabel(k) { return (HOME_DECKS.find((d) => d[0] === k) || [k, k])[1]; }
function ago(t) {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return "Today"; if (d === 1) return "Yesterday";
  if (d < 7) return new Date(t).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function viewRoomError() {
  const e = ui.roomError;
  const title = { not_found: T("Room not found.", "Oops! Phòng này không tồn tại :("),
                  deleted: T("The host deleted this room.", "Chủ phòng đã xoá phòng này rồi :("),
                  expired: T("This room expired after 30 days without activity.", "Phòng đã hết hạn sau 30 ngày không ai ghé :(") }[e.code];
  const hint = e.code === "not_found"
    ? "Check the room code or ask the host for a new link."
    : "Create a new room from the home page.";
  return `<div class="gate"><div class="inner"><a class="logo" href="/" data-nav="/">${LOGO}<b>Estimo</b></a>
    <p class="mono muted" style="margin:56px 0 0">${esc(e.room)}</p>
    <h1 style="font-family:var(--serif);font-weight:500;margin:8px 0 12px">${title}</h1>
    <p class="muted" style="margin:0 0 28px">${hint}</p>
    <a class="btn btn-primary btn-lg" href="/" data-nav="/">Go to home</a></div></div>`;
}

function viewBadRoom() {
  return `<div class="gate"><div class="inner"><a class="logo" href="/" data-nav="/">${LOGO}<b>Estimo</b></a>
    <h1 style="font-family:var(--serif)">This room link isn’t valid.</h1>
    <p class="muted">Room codes use letters, numbers and dashes (3–40 characters).</p>
    <a class="btn btn-primary btn-lg" href="/" data-nav="/">Go to home</a></div></div>`;
}

function viewGate() {
  return `
  <div class="gate"><div class="inner">
    <a class="logo" href="/" data-nav="/">${LOGO}<b>Estimo</b></a>
    <div style="margin-top:56px">
      <span style="font-size:14px;font-weight:500;color:var(--accent-ink)">Join room</span>
      <h1>${esc(ui.room)}</h1>
    </div>
    <form id="gate-form" style="margin-top:32px;display:flex;flex-direction:column;flex:1">
      <label class="label" for="gnick" style="font-size:15px">Your nickname</label>
      <input class="input" id="gnick" maxlength="24" autocomplete="nickname" placeholder="e.g. Hòa" required autofocus style="height:52px;font-size:17px">
      <div class="hint">Saved on this device</div>
      <label class="check" style="margin-top:18px"><input type="checkbox" id="gspec" ${LS.get("spectator", false) ? "checked" : ""}>Spectator (watch without voting)</label>
      <div style="flex:1;min-height:32px"></div>
      <button class="btn btn-primary btn-lg" type="submit" style="width:100%;height:54px;font-size:17px">Join room</button>
    </form>
  </div></div>`;
}

function viewRoom() {
  const s = ui.state;
  const de = ui.drawerOpen ? oneShot(ui.drawerLeaveAt, 240, "drawer-leave") : { cls: "", style: "" };
  const di = ui.drawerOpen && !de.cls ? oneShot(ui.drawerAt, 300, "drawer-enter") : { cls: "", style: "" };
  const anim = de.cls ? de : di;
  const top = `
  <header class="topbar">
    <div class="left">
      <a class="logo" href="/" data-nav="/" aria-label="Estimo home">${LOGO}<b class="hide-sm">Estimo</b></a>
      <span class="sep hide-sm"></span>
      <span class="code">${esc(ui.room)}</span>
      <span id="live" class="live ${ui.connected ? "" : "off"}" title="${esc(liveText())}"><span class="live-text">${liveText()}</span></span>
    </div>
    <div class="right">
      <button class="btn btn-accent btn-sm" data-act="invite" aria-label="Invite">${icon("qr")}<span class="label-wide">${T("Invite", "Mời bạn bè!")}</span></button>
      ${s ? `<button class="btn btn-icon btn-sm menu-btn" data-act="toggleDrawer" aria-label="Room menu" aria-expanded="${!!ui.drawerOpen}" aria-controls="room-drawer">${icon("menu")}<span class="badge">${s.participants.length}</span></button>` : ""}
    </div>
  </header>${retroTicker()}`;
  if (!s) {
    return `<div class="room">${top}<div class="room-body"><main class="stage"><div class="stage-scroll"><div class="table"><div class="skeleton" aria-hidden="true"><div class="row"><span class="bone" style="width:60px;height:86px"></span><span class="bone" style="width:60px;height:86px"></span><span class="bone" style="width:60px;height:86px"></span></div><span class="bone" style="width:200px;height:12px;border-radius:6px"></span></div><p class="muted" role="status">${!navigator.onLine ? "You’re offline. Reconnecting when the network is back." : ui.everConnected ? T("Reconnecting…", "Oops! Mất kết nối rồi. Đang thử lại…") : T("Connecting to the room…", "Đang tải… (bằng AJAX!)")}</p></div></div></main></div></div>` + (ui.showInvite ? viewInvite() : "");
  }
  return `<div class="room${ui.drawerOpen ? " drawer-open" : ""}${anim.cls}">${top}`
    + (ui.connected ? "" : `<div class="banner">${T("Connection lost. Reconnecting — your vote is saved.", "Oops! Mất kết nối rồi. Đang thử lại… phiếu của bạn vẫn còn đó ^^ (lâu quá thì F5 nhé)")}</div>`) + `
    <div class="room-body">
      <main class="stage${s.revealed ? " revealed" : ""}">
        ${viewTopic(s)}
        <div class="stage-scroll">${viewTable(s)}${s.revealed ? viewResults(s) : ""}</div>
        <div class="dock">${s.revealed ? viewFinal(s) : viewHand(s)}</div>
      </main>
      <aside class="drawer" id="room-drawer" aria-label="Room details"${anim.style}>
        <div class="drawer-head"><h2>Room</h2><button class="btn btn-icon btn-sm" data-act="closeDrawer" aria-label="Close room menu">${icon("x")}</button></div>
        ${viewPeople(s)}
        ${viewHistory(s)}
        ${viewSettings(s)}
      </aside>
    </div>
    ${ui.drawerOpen ? `<div class="scrim" data-act="closeDrawer"${anim.style}></div>` : ""}
  </div>` + (ui.showInvite ? viewInvite() : "");
}
function openDrawer() { ui.drawerOpen = true; ui.drawerAt = performance.now(); ui.drawerLeaveAt = null; render(); }
function closeDrawer() {
  if (!ui.drawerOpen || ui.drawerLeaveAt) return;
  ui.drawerLeaveAt = performance.now(); render();
  setTimeout(() => { ui.drawerOpen = false; ui.drawerLeaveAt = null; render(); }, reducedMotion() || isRetro() ? 0 : 220);
}
const initial = (n) => (n || "?").trim().charAt(0).toUpperCase();
function liveText() { return ui.connected ? `Live${ui.rtt != null ? " · " + ui.rtt + " ms" : ""}` : "Offline"; }
function updateLive() { const el = $("#live .live-text"); if (el) el.textContent = liveText(); }

function viewTopic(s) {
  return `
  <section class="card topic">
    <div class="field">
      <label for="topic">${T("Now estimating")}</label>
      <input id="topic" maxlength="200" placeholder="Ticket key or title, e.g. AUTH-1423" value="${esc(s.topic)}" autocomplete="off">
    </div>
    ${s.revealed ? "" : `<button class="btn btn-sm" data-act="skip">Skip</button>`}
  </section>`;
}

// One-shot animations (card pop, reveal flip) must survive re-renders: an element rendered
// mid-animation starts with a negative delay equal to the time already elapsed, so it picks
// up where the replaced element left off instead of restarting or being cut short.
function oneShot(at, ms, cls) {
  const age = at == null ? Infinity : performance.now() - at;
  return age < ms ? { cls: " " + cls, style: ` style="animation-delay:-${Math.round(age)}ms"` } : { cls: "", style: "" };
}

function voters(s) { return s.participants.filter((p) => !p.spectator); }

function viewTable(s) {
  const vs = voters(s);
  const voted = vs.filter((p) => p.voted).length;
  const st = s.revealed ? computeStats(s) : null;
  const seats = vs.map((p) => {
    let cls = "pcard empty", face = "";
    if (s.revealed) {
      if (p.vote == null) { cls = "pcard up none"; face = "–"; }
      else {
        const isOut = st && st.outliers.has(p.vote) && !st.unanimous;
        cls = `pcard up${isOut ? " outlier" : META.has(p.vote) ? " off" : ""}${oneShot(ui.flipAt, 350, "flip").cls}`;
        face = p.vote === "☕" ? icon("cup") : esc(p.vote);
      }
    } else if (p.voted) cls = `pcard down${oneShot(ui.dealAt[p.id], 400, "deal").cls}`;
    return `<div class="seat ${p.id === s.you ? "mine" : ""}"><div class="${cls}"${cls.includes(" flip") ? oneShot(ui.flipAt, 350, "flip").style : cls.includes(" deal") ? oneShot(ui.dealAt[p.id], 400, "deal").style : ""} ${s.revealed ? "" : `aria-label="${p.voted ? "voted" : "not voted yet"}"`}>${face}</div><span class="name" title="${esc(p.name)}">${esc(p.name)}${p.id === s.you ? ' <span class="muted" style="font-weight:400">(you)</span>' : ""}</span></div>`;
  }).join("");

  let status;
  if (!vs.length) status = `<p class="muted">${T("No voters yet. Use Invite to share the room.", "Chưa có ai cả :( Hãy là người đầu tiên — mời đồng đội vào nhé!")}</p>`;
  else if (!s.revealed) {
    const waiting = vs.filter((p) => !p.voted).map((p) => p.name);
    const pct = Math.round((voted / vs.length) * 100);
    status = `
      <div class="status">
        <span style="color:var(--ink-2)"><strong style="color:var(--ink)">${voted} of ${vs.length}</strong> ${voted === 1 ? "has" : "have"} voted${waiting.length && waiting.length <= 3 ? ` · waiting for ${esc(waiting.join(", "))}` : ""}</span>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${vs.length}" aria-valuenow="${voted}"><div data-to="${pct}" style="width:${ui.lastPct ?? pct}%"></div></div>
        <div class="actions">
          <button class="btn btn-primary" data-act="reveal" ${voted ? "" : "disabled"}>${T("Reveal cards", "Lật bài!")}</button>
          <button class="btn" data-act="reset" ${voted ? "" : "disabled"}>Reset</button>
        </div>
      </div>`;
  } else {
    status = st && st.outliers.size && !st.unanimous
      ? `<span class="legend"><span></span>Outliers: ${esc(vs.filter((p) => st.outliers.has(p.vote)).map((p) => `${p.name} (${p.vote})`).join(", "))}</span>`
      : st && st.unanimous ? `<span class="legend" style="color:var(--good)">${icon("check")}Consensus: ${esc(st.mode)}</span>` : "";
  }
  return `<section class="table" aria-label="Table">${vs.length ? `<div class="seats">${seats}</div>` : ""}${status}</section>`;
}

function viewHand(s) {
  const mine = voters(s).find((p) => p.id === s.you);
  if (!mine) return `<section class="hand"><p class="muted">Spectator mode. Turn it off in Settings to vote.</p></section>`;
  const cards = s.decks[s.deck].cards;
  return `
  <section class="hand" aria-label="Your card">
    <span class="tip muted" style="font-size:13px">Shortcut: keys <kbd>1</kbd>–<kbd>0</kbd></span>
    <div class="cards">
      ${cards.map((c) => `<button class="vcard${META.has(c) ? " meta" : ""}${c.length > 2 ? " wide" : ""}${ui.pop?.v === c ? oneShot(ui.pop.at, 320, "pop").cls : ""}"${ui.pop?.v === c ? oneShot(ui.pop.at, 320, "pop").style : ""} data-act="vote" data-v="${esc(c)}" aria-pressed="${s.mine === c}" aria-label="${c === "☕" ? "Need a break" : c === "?" ? "Not sure" : "Vote " + esc(c)}">${c === "☕" ? icon("cup") : esc(c)}</button>`).join("")}
    </div>
  </section>`;
}

function viewResults(s) {
  const st = computeStats(s);
  return `
  ${st ? `<section class="stats">
    <div class="card kpis">
      <div class="kpi"><span>Average</span><b>${st.avg == null ? "—" : fmt(st.avg)}</b></div>
      <div class="kpi"><span>Median</span><b>${esc(typeof st.median === "number" ? fmt(st.median) : st.median)}</b></div>
      <div class="kpi"><span>Range</span><b class="sm">${esc(st.min === st.max ? st.min : `${st.min} – ${st.max}`)}</b></div>
      <div class="kpi"><span>Agreement</span><b class="sm">${st.agreement}% <span class="muted" style="font-family:var(--sans);font-size:14px">on ${esc(st.mode)}</span></b></div>
    </div>
    <div class="card dist">
      <span class="muted" style="font-size:13px">Distribution · ${st.count} vote${st.count === 1 ? "" : "s"}</span>
      ${st.dist.map((d) => `<div class="row"><span class="v">${esc(d.v)}</span><div class="bar"><div class="${d.n === st.top ? "top" : ""}" style="width:${(d.n / st.top) * 100}%"></div></div><span class="n">${d.n}</span></div>`).join("")}
    </div>
  </section>` : `<section class="card box"><p class="muted" style="margin:0">No numeric votes this round.</p></section>`}
  `;
}

function viewFinal(s) {
  const st = computeStats(s);
  const opts = st ? [...new Set([st.cards[Math.floor(st.medIdx) - 1], st.cards[Math.floor(st.medIdx)], st.cards[Math.ceil(st.medIdx)], st.cards[Math.ceil(st.medIdx) + 1], ui.final].filter(Boolean))].sort((a, b) => st.cards.indexOf(a) - st.cards.indexOf(b)) : [];
  return `
  <section class="card final">
    ${st ? `<div class="pick" role="group" aria-label="Final estimate">
      <span class="pick-label">Final</span>
      ${opts.map((o) => `<button class="opt" data-act="final" data-v="${esc(o)}" aria-pressed="${o === ui.final}">${esc(o)}</button>`).join("")}
      <span class="muted" style="font-size:13px">Suggested: ${st.unanimous ? "consensus" : "median"}</span>
    </div>` : "<span></span>"}
    <div class="actions">
      <button class="btn btn-lg" data-act="reset">${T("Re-vote")}</button>
      <button class="btn btn-primary btn-lg" data-act="next">${T("Save &amp; next ticket", "Lưu &amp; tiếp »")}</button>
    </div>
  </section>`;
}

function viewPeople(s) {
  const vs = voters(s), sp = s.participants.filter((p) => p.spectator);
  const row = (p, first) => `<li class="${first ? "spec-first" : ""}"><span class="n">${esc(p.name)}${p.id === s.you ? ' <span class="muted">(you)</span>' : ""}${p.id === s.host ? ' <span class="tag host">Host</span>' : ""}</span>${p.spectator ? '<span class="tag">Spectator</span>' : s.revealed ? `<span class="ok">${p.vote == null ? "—" : esc(p.vote)}</span>` : p.voted ? '<span class="ok">Voted</span>' : '<span class="wait">Not voted</span>'}</li>`;
  return `
  <section class="card box">
    <div class="box-head"><h2>${T("Participants")}</h2><span class="muted" style="font-size:13px">${s.participants.length} online</span></div>
    <ul class="plist">${vs.map((p) => row(p)).join("")}${sp.map((p, i) => row(p, i === 0 && vs.length)).join("")}</ul>
  </section>`;
}

function viewSettings(s) {
  const meP = s.participants.find((p) => p.id === s.you);
  return `
  <section class="card box settings">
    <div class="box-head"><h2>Settings</h2></div>
    <div class="set-row"><label for="deck">Voting scale</label>
      <select class="select" id="deck" data-act="deck">${Object.entries(s.decks).map(([k, d]) => `<option value="${k}" ${k === s.deck ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select></div>
    <div class="set-row"><span>Theme</span>${themeBtn("btn-sm")}</div>
    <div class="set-row"><span>Nickname</span>
      <button class="me" data-act="rename" aria-label="Change nickname"><span class="avatar">${esc(initial(me.name))}</span><span>${esc(me.name)}</span>${icon("pen")}</button></div>
    <label class="check set-check"><input type="checkbox" data-act="spectator" ${meP?.spectator ? "checked" : ""}>Spectator (watch without voting)</label>
    ${s.host && s.host === s.you ? `<div class="danger-zone">
      <button class="btn btn-sm btn-danger" data-act="deleteRoom">${ui.confirmDelete && Date.now() - ui.confirmDelete < 4000 ? "Click again to confirm" : "Delete room"}</button>
      <span class="muted">Deletes the room and its history for all participants.</span>
    </div>` : ""}
  </section>`;
}

function viewHistory(s) {
  const h = s.history;
  const numericTotal = h.reduce((a, r) => { const n = numeric(r.final ?? ""); return n === null ? a : a + n; }, 0);
  return `
  <section class="card box">
    <div class="box-head"><h2>${T("History")}</h2>${h.length ? `<button class="btn-link" data-act="csv">Export CSV</button>` : ""}</div>
    ${h.length ? `<ul class="hlist">${h.map((r) => `<li><span class="t" title="${esc(r.topic)}">${esc(r.topic)}</span><span class="pts">${esc(r.final ?? "—")}</span></li>`).join("")}</ul>
    <div class="total"><span class="muted">Session total</span><strong>${fmt(numericTotal)} pts · ${h.length} ticket${h.length === 1 ? "" : "s"}</strong></div>`
    : `<p class="muted" style="font-size:14px;margin:10px 0 0">${T("No tickets estimated yet.", "Chưa có gì ở đây cả :( Hãy là người đầu tiên!")}</p>`}
  </section>`;
}

function roomUrl() { return `${location.origin}/r/${ui.room}`; }
function viewInvite() {
  return `
  <div class="overlay${oneShot(ui.inviteAt, 340, "enter").cls}"${oneShot(ui.inviteAt, 340, "enter").style} data-act="closeInvite">
    <div class="dialog ${ui.fullInvite ? "full" : ""}" role="dialog" aria-modal="true" aria-labelledby="inv-title" data-stop>
      <span class="sheet-handle" aria-hidden="true"></span>
      <div class="full-hide" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><h2 id="inv-title">Invite your team</h2><span class="muted" style="font-size:14px">Scan with a phone camera or share the link.</span></div>
        <button class="btn btn-icon" style="border:none" data-act="closeInvite" aria-label="Close">${icon("x")}</button>
      </div>
      <div class="qr"><div id="qr" role="img" aria-label="QR code for ${esc(roomUrl())}"></div><span class="mark" aria-hidden="true"><i></i></span></div>
      <div class="full-only">${esc(roomUrl().replace(/^https?:\/\//, ""))}</div>
      <div class="full-hide">
        <label class="label" for="link" style="font-size:13px">Room link</label>
        <div class="join-row"><input class="input mono" id="link" readonly value="${esc(roomUrl())}" style="height:44px;font-size:13px;background:var(--bg)"><button class="btn btn-primary" data-act="copy" style="height:44px">Copy</button></div>
        <div class="hint">Or enter code <strong class="mono" style="font-weight:500;color:var(--ink)">${esc(ui.room)}</strong> on the home page.</div>
      </div>
      <div class="actions full-hide" style="border-top:1px solid var(--surface-2);padding-top:18px">
        <button class="btn" data-act="fullInvite" style="flex:1 1 160px">${icon("expand")}Show full screen</button>
        <button class="btn" data-act="png" style="flex:1 1 160px">${icon("download")}Download PNG</button>
      </div>
      ${ui.fullInvite ? `<button class="btn" data-act="fullInvite">Exit full screen</button>` : ""}
    </div>
  </div>`;
}

let qrSvgCache = { url: null, svg: "" };
function qrSvg(url) {
  if (qrSvgCache.url === url) return qrSvgCache.svg;
  if (!window.EstimoQR) return "";
  try { qrSvgCache = { url, svg: window.EstimoQR.toSvg(url) }; } catch { return ""; }
  return qrSvgCache.svg;
}
function drawQR() {
  const el = $("#qr"); if (!el) return;
  const svg = qrSvg(roomUrl());
  if (svg) el.innerHTML = svg;
  else el.innerHTML = `<p class="muted" style="line-height:1.5;width:232px;margin:0">QR code unavailable — share the link below.</p>`;
}
function downloadPng() {
  const svg = qrSvg(roomUrl()); if (!svg) return;
  const img = new Image(), size = 1024;
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, size, size);
    const m = size * 0.14; g.fillStyle = "#fff"; g.fillRect((size - m) / 2, (size - m) / 2, m, m);
    g.fillStyle = "#D97757"; const k = m * 0.72; g.fillRect((size - k) / 2, (size - k) / 2, k, k);
    const a = document.createElement("a"); a.download = `estimo-${ui.room}.png`; a.href = c.toDataURL("image/png"); a.click();
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function exportCsv() {
  const s = ui.state; if (!s) return;
  // Prefix cells that spreadsheets would evaluate as formulas (CSV injection)
  const q = (v) => { let c = String(v ?? ""); if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; return `"${c.replace(/"/g, '""')}"`; };
  const rows = [["Ticket", "Scale", "Final", "Votes", "Saved at"]].concat(
    s.history.slice().reverse().map((r) => [r.topic, s.decks[r.deck]?.label || r.deck, r.final ?? "", Object.entries(r.votes).map(([n, v]) => `${n}: ${v}`).join("; "), new Date(r.at).toISOString()])
  );
  const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `estimo-${ui.room}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden", "leave", "show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.replace("show", "leave");
    toastTimer = setTimeout(() => t.classList.add("hidden"), 200);
  }, 2200);
}

/* ---------------- events ---------------- */
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konami = 0, logoClicks = [];
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav && nav.classList.contains("logo") && ui.route === "home") {
    // Easter egg: click the logo 7 times on the home page
    e.preventDefault();
    const t = Date.now(); logoClicks = logoClicks.filter((x) => t - x < 4000); logoClicks.push(t);
    if (logoClicks.length >= 7) { logoClicks = []; toggleRetro(); }
    return;
  }
  if (nav && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ui.joinError = ""; go(nav.getAttribute("data-nav")); return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  if (el.classList.contains("overlay") && e.target.closest("[data-stop]")) return; // click inside dialog
  const act = el.dataset.act;
  switch (act) {
    case "theme": toggleTheme(); break;
    case "retro": toggleRetro(); break;
    case "homeDeck": ui.homeDeck = el.dataset.deck; LS.set("lastDeck", ui.homeDeck); render(); break;
    case "vote": vote(el.dataset.v); break;
    case "reveal": send({ t: "reveal" }); break;
    case "reset": send({ t: "reset" }); break;
    case "skip": send({ t: "next", topic: "" }); break;
    case "next": send({ t: "next", topic: "", final: ui.final }); break;
    case "final": ui.final = el.dataset.v; render(); break;
    case "recentPage": ui.recentPage = (ui.recentPage || 0) + Number(el.dataset.dir); render(); break;
    case "toggleDrawer": ui.drawerOpen && !ui.drawerLeaveAt ? closeDrawer() : openDrawer(); break;
    case "closeDrawer": closeDrawer(); break;
    case "invite": ui.showInvite = true; ui.fullInvite = false; ui.inviteAt = performance.now(); render(); break;
    case "closeInvite": withTransition(() => { ui.showInvite = false; ui.fullInvite = false; render(); }); break;
    case "fullInvite": withTransition(() => { ui.fullInvite = !ui.fullInvite; render(); }); break;
    case "png": downloadPng(); break;
    case "copy": copy(roomUrl()); break;
    case "csv": exportCsv(); break;
    case "install": installApp(); break;
    case "installLater": LS.set("installDismissed", Date.now()); render(); break;
    case "deleteRoom":
      // Two-step confirm without a blocking browser dialog
      if (ui.confirmDelete && Date.now() - ui.confirmDelete < 4000) { ui.confirmDelete = null; send({ t: "deleteRoom" }); }
      else { ui.confirmDelete = Date.now(); render(); setTimeout(() => { if (ui.confirmDelete && Date.now() - ui.confirmDelete >= 4000) { ui.confirmDelete = null; render(); } }, 4100); }
      break;
    case "rename": {
      const n = (prompt("Your nickname", me.name) || "").trim().slice(0, 24);
      if (n && n !== me.name) { me.name = n; send({ t: "rename", name: n }); render(); }
      break;
    }
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.act === "deck") send({ t: "deck", deck: el.value });
  if (el.dataset.act === "themePick") setTheme(el.value);
  if (el.dataset.act === "spectator") { LS.set("spectator", el.checked); send({ t: "spectator", on: el.checked }); }
});
let topicTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "nick") ui.draftNick = e.target.value;
  if (e.target.id === "code") ui.draftCode = e.target.value;
  if (e.target.id === "topic") { clearTimeout(topicTimer); const v = e.target.value; topicTimer = setTimeout(() => send({ t: "topic", text: v }), 350); }
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "create-form") {
    const n = $("#nick").value.trim().slice(0, 24); if (!n) return;
    const code = newRoomCode();
    me.name = n; ui.pendingDeck = ui.homeDeck; ui.pendingCreate = code; ui.limitInfo = null; go(`/r/${code}`);
  } else if (f.id === "join-form") {
    const code = normalizeCode($("#code").value);
    const n = $("#nick").value.trim().slice(0, 24);
    if (!validCode(code)) { ui.joinError = "Enter a room code like calm-otter-42."; render(); return; }
    if (n) me.name = n;
    ui.joinError = ""; go(`/r/${code}`);
  } else if (f.id === "gate-form") {
    const n = $("#gnick").value.trim().slice(0, 24); if (!n) return;
    me.name = n; LS.set("spectator", $("#gspec").checked); connect(); render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.showInvite) { ui.showInvite = false; ui.fullInvite = false; render(); return; }
  if (e.key === "Escape" && ui.drawerOpen) { closeDrawer(); return; }
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  konami = k === KONAMI[konami] ? konami + 1 : k === KONAMI[0] ? 1 : 0;
  if (konami === KONAMI.length) { konami = 0; toggleRetro(); return; }
  const s = ui.state; if (!s || s.revealed || ui.showInvite) return;
  if (/^[0-9]$/.test(e.key)) {
    const cards = s.decks[s.deck].cards;
    const want = e.key === "0" ? (cards.includes("10") ? "10" : "0") : e.key;
    if (cards.includes(want)) vote(want);
  }
});
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Link copied"); }
  catch { const i = $("#link"); if (i) { i.select(); document.execCommand("copy"); toast("Link copied"); } }
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => render());
// Back online: reconnect now instead of waiting for the next backoff step
window.addEventListener("online", () => { if (ui.route === "room" && me.name && !ui.roomError && (!ws || ws.readyState > 1)) { retry = 0; connect(); } });
window.addEventListener("offline", () => render());
// iOS Safari only applies :active styles when a touch listener exists
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && ui.route === "room" && me.name && (!ws || ws.readyState > 1)) { retry = 0; connect(); } });

/* ---------------- PWA: offline shell + install ---------------- */
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installEvent = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; if (ui.route === "home") render(); });
window.addEventListener("appinstalled", () => { installEvent = null; LS.set("installed", true); toast("Estimo installed."); render(); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
async function installApp() {
  if (!installEvent) return;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice.catch(() => ({}));
  installEvent = null;
  if (outcome === "dismissed") LS.set("installDismissed", Date.now());
  render();
}
function viewInstall() {
  if (isStandalone()) return "";
  const dismissed = Date.now() - LS.get("installDismissed", 0) < 14 * 86400000;
  if (installEvent && !dismissed) {
    return `<div class="install"><img src="/icons/icon-192.png" alt=""><div class="grow"><strong>Install Estimo</strong>Open Estimo in its own window from your home screen.</div><button class="btn btn-sm" data-act="install">Install</button></div>`;
  }
  if (isIOS() && !dismissed) {
    return `<div class="install"><img src="/icons/icon-192.png" alt=""><div class="grow"><strong>Add Estimo to your Home Screen</strong>In Safari, tap Share, then “Add to Home Screen”.</div><button class="btn btn-sm" data-act="installLater" aria-label="Hide this tip">Later</button></div>`;
  }
  return "";
}

onRoute();
