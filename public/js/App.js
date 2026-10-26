/**
 * Estimo client application.
 *
 * One App instance owns the UI state (`this.ui`), renders the current screen into #app,
 * and reacts to user actions (`data-act` attributes in the HTML) and server messages.
 *
 *   Views     js/views/*.js     pure functions (app) => HTML string
 *   Services  js/services/*.js  WebSocket connection, REST API, themes, recent rooms, PWA
 *   Domain    js/domain/*.js    room codes, decks, vote statistics (no DOM)
 */
import { $, oneShot, reducedMotion, vibrate } from "./lib/dom.js";
import { storage, me } from "./lib/storage.js";
import { DEFAULT_HOME_DECK } from "./domain/decks.js";
import { newRoomCode, normalizeCode, isValidCode } from "./domain/roomCode.js";
import { suggestFinal } from "./domain/stats.js";
import { ThemeManager, RETRO } from "./services/ThemeManager.js";
import { RoomConnection } from "./services/RoomConnection.js";
import { RecentRooms } from "./services/RecentRooms.js";
import { InstallPrompt } from "./services/InstallPrompt.js";
import * as api from "./services/api.js";
import { toast } from "./ui/toast.js";
import { drawQr, downloadQrPng } from "./ui/qr.js";
import { exportHistoryCsv } from "./ui/csv.js";
import { TapFeedback } from "./ui/TapFeedback.js";
import { homeView } from "./views/home.js";
import { roomView } from "./views/room.js";
import { gateView, roomErrorView, badRoomView } from "./views/gate.js";

const PHONE = "(max-width: 640px)";
const RECENT_PER_PAGE = 5;
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export class App {
  constructor(root) {
    this.root = root;
    this.ui = {
      route: "home",          // "home" | "room"
      room: null,             // current room code
      state: null,            // last snapshot from the server (null until synced)
      connected: false,
      everConnected: false,
      homeDeck: storage.get("lastDeck", DEFAULT_HOME_DECK),
      draftNick: null,        // home form drafts survive re-renders
      draftCode: null,
      joinError: "",
      limitInfo: null,        // { max, rooms } when this browser hosts the maximum number of rooms
      pendingCreate: null,    // room code we are creating (sent as join { create: true })
      pendingDeck: null,      // deck picked on Home, applied once the new room exists
      pendingVote: null,      // optimistic vote waiting for the server to confirm it
      final: null,            // final estimate picked after reveal
      roomError: null,        // { room, code: "not_found" | "deleted" | "expired" }
      sheet: null,            // bottom sheet: { kind: "settings" } or { code, host, busy, error }
      showInvite: false,
      fullInvite: false,
      drawerOpen: false,
      // animation start times (see oneShot in lib/dom.js)
      pop: null, flipAt: null, inviteAt: null, drawerAt: null, drawerLeaveAt: null, dealAt: {},
      lastPct: undefined,     // vote bar width before a re-render, so it animates instead of jumping
      // home layout fitting on phones
      recentStart: 0, recentPer: null, recentShown: RECENT_PER_PAGE, homeTight: false, fitKey: null,
    };

    this.t = (en, retroVi) => this.theme.text(en, retroVi);   // views call app.t("English", "Retro VI")
    this.oneShot = oneShot;
    this.visits = storage.get("visits", 0) + 1;
    storage.set("visits", this.visits);

    this.theme = new ThemeManager({ onAssetsLoaded: () => this.refitHome() });
    this.recent = new RecentRooms();
    this.install = new InstallPrompt((event) => {
      if (event === "installed") toast("Estimo installed.");
      this.render();
    });
    this.tapFeedback = new TapFeedback(() => !this.theme.isRetro && !reducedMotion());
    this.connection = new RoomConnection({
      onOpen: () => this.#join(),
      onMessage: (msg) => this.#onServerMessage(msg),
      onStatus: (connected) => {
        this.ui.connected = connected;
        if (connected) this.ui.everConnected = true;
        this.render();
      },
    });
    this.konamiStep = 0;
    this.logoClicks = [];
    this.fitTimer = null;
  }

  start() {
    this.theme.apply();
    this.#bindEvents();
    this.onRoute();
    const greeting = this.theme.seasonGreeting(); // e.g. "Happy Halloween!" once per season
    if (greeting) setTimeout(() => toast(greeting), 600);
  }

  get roomUrl() { return `${location.origin}/r/${this.ui.room}`; }

  /* ================================================================
     Navigation
     ================================================================ */

  /** Screens, dialogs and theme changes animate with the View Transitions API (never realtime updates). */
  withTransition(update) {
    if (!document.startViewTransition || reducedMotion() || this.theme.isRetro) return update();
    document.startViewTransition(update);
  }

  go(path) {
    history.pushState(null, "", path);
    this.withTransition(() => this.onRoute());
  }

  onRoute() {
    const { ui } = this;
    const match = location.pathname.match(/^\/r\/([^/]+)\/?$/);
    ui.route = match ? "room" : "home";
    ui.room = match ? normalizeCode(decodeURIComponent(match[1])) : null;
    if (ui.route !== "room" || ui.roomError?.room !== ui.room) ui.roomError = null;

    if (ui.route === "room" && isValidCode(ui.room) && me.name && !ui.roomError) this.connect();
    else this.leaveRoom();

    if (ui.route !== "room") ui.sheet = null;
    if (ui.route === "home") this.loadHostedRooms();
    this.render();
  }

  /* ================================================================
     Room connection & server messages
     ================================================================ */

  connect() {
    if (this.connection.room !== this.ui.room) this.#resetRoomState();
    this.connection.connect(this.ui.room);
  }

  leaveRoom() {
    this.connection.disconnect();
    this.#resetRoomState();
  }

  send(message) { this.connection.send(message); }

  #resetRoomState() {
    Object.assign(this.ui, { state: null, connected: false, showInvite: false, final: null, drawerOpen: false, drawerLeaveAt: null });
  }

  #join() {
    const { ui } = this;
    this.send({ t: "join", id: me.id, name: me.name, spectator: storage.get("spectator", false), create: ui.pendingCreate === ui.room });
  }

  #onServerMessage(msg) {
    if (msg.t === "state") this.#onState(msg);
    else if (msg.t === "error") this.#onServerError(msg);
    else if (msg.t === "deleted") this.#onRoomDeleted(msg);
  }

  #onState(next) {
    const { ui } = this;
    const prev = ui.state;
    // `decks` and `history` are only sent on the first sync or when they change.
    next.decks ??= prev?.decks;
    next.history ??= prev?.history ?? [];
    if (!next.decks) return;

    // Keep an optimistic vote until the server confirms it, so a broadcast caused by
    // someone else (sent before ours was processed) doesn't flicker the card back.
    const pending = ui.pendingVote;
    if (pending) {
      const confirmed = next.mine === pending.v || next.revealed || next.deck !== pending.deck;
      if (confirmed || performance.now() - pending.at > 3000) ui.pendingVote = null;
      else applyOptimisticVote(next, pending.v);
    }
    ui.state = next;

    if (ui.pendingCreate === ui.room) { ui.pendingCreate = null; ui.limitInfo = null; }
    if (ui.pendingDeck) { // brand-new room created from Home: apply the chosen deck once
      const fresh = !next.history.length && next.participants.length <= 1;
      if (fresh && next.deck !== ui.pendingDeck && next.decks[ui.pendingDeck]) this.send({ t: "deck", deck: ui.pendingDeck });
      ui.pendingDeck = null;
    }
    if (prev) { // deal a face-down card for each participant whose vote just arrived
      const hadVoted = new Map(prev.participants.map((p) => [p.id, p.voted]));
      for (const p of next.participants) {
        if (p.voted && hadVoted.has(p.id) && !hadVoted.get(p.id) && p.id !== next.you) ui.dealAt[p.id] = performance.now();
      }
    }
    const justRevealed = next.revealed && (!prev || !prev.revealed);
    if (justRevealed && prev) vibrate([10, 40, 10]);
    if (!next.revealed) ui.final = null;
    else if (justRevealed) { ui.final = suggestFinal(next); ui.flipAt = performance.now(); }

    this.recent.remember(ui.room, { deck: next.deck, host: !!next.host && next.host === next.you });
    this.render();
  }

  #onServerError(msg) {
    const { ui } = this;
    switch (msg.code) {
      case "not_found":
        ui.roomError = { room: ui.room, code: "not_found" };
        this.recent.forget(ui.room);
        this.leaveRoom();
        this.render();
        break;
      case "room_limit":
        ui.pendingCreate = null;
        ui.limitInfo = { max: msg.max, rooms: Array.isArray(msg.rooms) ? msg.rooms : [] };
        this.leaveRoom();
        this.go("/");
        break;
      case "exists": { // our random code belongs to someone else's room: pick another one
        if (ui.pendingCreate !== ui.room) return;
        const code = newRoomCode();
        ui.pendingCreate = code;
        this.leaveRoom();
        history.replaceState(null, "", `/r/${code}`);
        this.onRoute();
        break;
      }
      case "forbidden":
        toast("Only the host can do that.");
        break;
    }
  }

  #onRoomDeleted(msg) {
    const { ui } = this;
    const code = ui.room;
    this.#forgetDeletedRoom(code);
    this.leaveRoom();
    if (ui.deletingSelf === code) return; // we deleted it ourselves: confirmDeleteRoom() takes us home
    ui.roomError = { room: code, code: msg.reason === "expired" ? "expired" : "deleted" };
    this.render();
  }

  /* ================================================================
     Voting
     ================================================================ */

  /** Optimistic: the card changes instantly and the message is sent in parallel. */
  vote(card) {
    const { ui } = this;
    const state = ui.state;
    if (!state || state.revealed || !this.connection.isOpen) return;
    const next = state.mine === card ? null : card; // tapping your card again withdraws it
    const now = performance.now();
    ui.pendingVote = { v: next, deck: state.deck, at: now };
    ui.pop = { v: next, at: now };
    if (next !== null && !state.mine) ui.dealAt[state.you] = now;
    if (next !== null) vibrate(8);
    applyOptimisticVote(state, next);
    this.render();
    this.send({ t: "vote", v: card });
  }

  /* ================================================================
     Hosted rooms & deletion
     ================================================================ */

  /** Ask the server how many rooms this browser hosts, so Create is blocked up front at the limit. */
  async loadHostedRooms() {
    const data = await api.fetchHostedRooms(me.id);
    if (!data?.ok || !Array.isArray(data.rooms)) return; // offline: the server still enforces the limit
    const before = JSON.stringify(this.ui.limitInfo);
    this.ui.limitInfo = data.rooms.length >= data.max ? { max: data.max, rooms: data.rooms } : null;
    if (this.ui.route === "home" && JSON.stringify(this.ui.limitInfo) !== before) this.render();
  }

  openRoomSheet(code, isHost) {
    this.ui.sheet = { code, host: isHost || !!this.recent.find(code)?.host, at: performance.now() };
    this.render();
    $(".room-sheet [data-act=confirmDeleteRoom]")?.focus();
  }

  closeSheet() {
    if (this.ui.sheet?.busy) return;
    this.withTransition(() => { this.ui.sheet = null; this.render(); });
  }

  async confirmDeleteRoom() {
    const { ui } = this;
    const sheet = ui.sheet;
    if (!sheet || sheet.busy) return;
    if (!sheet.host) { // not ours: just drop it from this device
      this.recent.forget(sheet.code);
      ui.sheet = null;
      this.render();
      toast("Removed from recent rooms.");
      return;
    }

    sheet.busy = true; sheet.error = "";
    this.render();
    const inThisRoom = ui.route === "room" && ui.room === sheet.code;
    if (inThisRoom) ui.deletingSelf = sheet.code;
    const result = await api.deleteRoom(sheet.code, me.id);
    if (ui.sheet !== sheet) return;

    if (result?.ok) {
      const freedSlot = this.#forgetDeletedRoom(sheet.code);
      ui.sheet = null; ui.deletingSelf = null;
      this.loadHostedRooms(); // resync with the server's list
      if (inThisRoom) { this.leaveRoom(); this.go("/"); } else this.render();
      toast(freedSlot ? "Room deleted. You can create a new room now." : "Room deleted.");
    } else {
      if (inThisRoom) ui.deletingSelf = null;
      sheet.busy = false;
      sheet.error = result?.code === "forbidden" ? "Only the host’s device can delete this room." : "Couldn’t delete the room. Check your connection and try again.";
      this.render();
    }
  }

  /** Remove a deleted room from every list. Returns true when that frees a slot below the limit. */
  #forgetDeletedRoom(code) {
    const { ui } = this;
    this.recent.forget(code);
    if (!ui.limitInfo) return false;
    ui.limitInfo.rooms = ui.limitInfo.rooms.filter((c) => c !== code);
    if (ui.limitInfo.rooms.length >= ui.limitInfo.max) return false;
    ui.limitInfo = null;
    return true;
  }

  /* ================================================================
     Drawer (room sidebar on phones)
     ================================================================ */

  openDrawer() {
    Object.assign(this.ui, { drawerOpen: true, drawerAt: performance.now(), drawerLeaveAt: null });
    this.render();
  }

  closeDrawer() {
    const { ui } = this;
    if (!ui.drawerOpen || ui.drawerLeaveAt) return;
    ui.drawerLeaveAt = performance.now();
    this.render();
    const slideOutMs = reducedMotion() || this.theme.isRetro ? 0 : 220;
    setTimeout(() => { ui.drawerOpen = false; ui.drawerLeaveAt = null; this.render(); }, slideOutMs);
  }

  /* ================================================================
     Rendering
     ================================================================ */

  render() {
    const { ui, root } = this;
    const focused = document.activeElement;
    const keepFocus = focused?.id ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd, value: focused.value } : null;

    // Looping theme animations use animation-delay: var(--clock). A negative delay equal to the
    // time since page load keeps re-rendered elements in phase (the radar sweep never restarts).
    document.documentElement.style.setProperty("--clock", `${-Math.round(performance.now())}ms`);
    // Remember how full the vote bar looks right now, so the new bar continues from there.
    const oldBar = root.querySelector(".progress [data-to]");
    ui.lastPct = oldBar ? (oldBar.getBoundingClientRect().width / oldBar.parentElement.getBoundingClientRect().width) * 100 : undefined;

    if (ui.route === "home") { root.innerHTML = homeView(this); this.#fitHomeToScreen(); }
    else if (!isValidCode(ui.room)) root.innerHTML = badRoomView(this);
    else if (ui.roomError) root.innerHTML = roomErrorView(this);
    else if (!me.name) root.innerHTML = gateView(this);
    else root.innerHTML = roomView(this);

    if (ui.showInvite) drawQr($("#qr"), this.roomUrl);
    const bar = root.querySelector(".progress [data-to]");
    if (bar && bar.style.width !== bar.dataset.to + "%") { void bar.offsetWidth; bar.style.width = bar.dataset.to + "%"; }
    this.tapFeedback.replay(root);
    if (keepFocus) restoreFocus(keepFocus);
    document.title = ui.route === "room" ? `${String(ui.room).toUpperCase()} · Estimo` : "Estimo — planning poker";
  }

  /** Paging for "Recent rooms". The position is the index of the first room shown, so it stays
   *  correct when the number of rows per page changes (see #fitHomeToScreen). */
  recentPage(rooms) {
    const { ui } = this;
    const perPage = ui.recentPer || RECENT_PER_PAGE;
    const start = Math.min(Math.max(0, ui.recentStart), Math.max(0, rooms.length - 1));
    const page = Math.floor(start / perPage);
    ui.recentShown = perPage;
    return { page, pages: Math.max(1, Math.ceil(rooms.length / perPage)), items: rooms.slice(page * perPage, (page + 1) * perPage) };
  }

  turnRecentPage(direction) {
    const { ui } = this;
    const count = this.recent.all().length, last = Math.max(0, count - 1);
    const page = Math.floor(Math.min(ui.recentStart, last) / ui.recentShown) + direction;
    ui.recentStart = Math.min(Math.max(0, page * ui.recentShown), last);
    this.render();
  }

  /**
   * Phones: the home screen must fit without scrolling. Rows per page are measured once per
   * layout (screen size, theme, limit notice, install tip) on a full first page, so every
   * page has the same size; if even one row does not fit, the "tight" layout is used.
   */
  #fitHomeToScreen() {
    const { ui, root } = this;
    const phone = matchMedia(PHONE).matches;
    const layoutKey = phone && [innerWidth, innerHeight, this.theme.current, this.theme.isDark,
      JSON.stringify(ui.limitInfo), this.recent.all().length, !!root.querySelector(".install")].join("|");
    if (ui.fitKey === layoutKey) return;
    Object.assign(ui, { fitKey: layoutKey, recentPer: null, homeTight: false });
    if (!phone) { root.innerHTML = homeView(this); return; }

    // Measure the content, not the document: on Android Chrome 100vh excludes the URL bar.
    const overflows = () => {
      const main = root.querySelector(".home main"), wrap = main?.querySelector(".wrap");
      if (!wrap) return false;
      const needed = wrap.getBoundingClientRect().bottom + scrollY + parseFloat(getComputedStyle(main).paddingBottom || 0);
      return needed > (window.visualViewport?.height || innerHeight) + 0.5;
    };
    const start = ui.recentStart;
    ui.recentStart = 0;
    root.innerHTML = homeView(this);
    for (let rows = RECENT_PER_PAGE - 1; overflows() && rows >= 1; rows--) { ui.recentPer = rows; root.innerHTML = homeView(this); }
    if (overflows()) ui.homeTight = true;
    ui.recentStart = start;
    root.innerHTML = homeView(this);
  }

  refitHome() {
    if (this.ui.route !== "home") return;
    this.ui.fitKey = null;
    clearTimeout(this.fitTimer);
    this.fitTimer = setTimeout(() => this.render(), 120);
  }

  /* ================================================================
     User actions — every data-act="name" in the views maps to actions.name(element)
     ================================================================ */

  actions = {
    // home
    chooseHomeDeck: (el) => { this.ui.homeDeck = el.dataset.deck; storage.set("lastDeck", this.ui.homeDeck); this.render(); },
    recentPage: (el) => this.turnRecentPage(Number(el.dataset.dir)),
    askDeleteRoom: (el) => this.openRoomSheet(el.dataset.code, el.dataset.host === "1"),
    confirmDeleteRoom: () => this.confirmDeleteRoom(),
    closeSheet: () => this.closeSheet(),
    install: async () => { await this.install.install(); this.render(); },
    snoozeInstall: () => { this.install.snooze(); this.render(); },

    // appearance
    toggleDark: () => { this.theme.toggleDark(); this.render(); },
    openSettings: () => { this.ui.sheet = { kind: "settings", at: performance.now() }; this.render(); },
    chooseTheme: (el) => {
      const greeting = this.theme.choose(el.dataset.theme);
      this.ui.fitKey = null;
      this.render();
      if (greeting) toast(greeting);
    },

    // room
    vote: (el) => this.vote(el.dataset.v),
    reveal: () => this.send({ t: "reveal" }),
    reset: () => this.send({ t: "reset" }),
    skipTicket: () => this.send({ t: "next", topic: "" }),
    saveAndNext: () => this.send({ t: "next", topic: "", final: this.ui.final }),
    chooseFinal: (el) => { this.ui.final = el.dataset.v; this.render(); },
    toggleDrawer: () => (this.ui.drawerOpen && !this.ui.drawerLeaveAt ? this.closeDrawer() : this.openDrawer()),
    closeDrawer: () => this.closeDrawer(),
    askDeleteCurrentRoom: () => { this.ui.drawerOpen = false; this.ui.drawerLeaveAt = null; this.openRoomSheet(this.ui.room, true); },
    exportCsv: () => this.ui.state && exportHistoryCsv(this.ui.state, this.ui.room),
    rename: () => {
      const name = (prompt("Your nickname", me.name) || "").trim().slice(0, 24);
      if (name && name !== me.name) { me.name = name; this.send({ t: "rename", name }); this.render(); }
    },

    // invite
    openInvite: () => { Object.assign(this.ui, { showInvite: true, fullInvite: false, inviteAt: performance.now() }); this.render(); },
    closeInvite: () => this.withTransition(() => { this.ui.showInvite = false; this.ui.fullInvite = false; this.render(); }),
    toggleFullInvite: () => this.withTransition(() => { this.ui.fullInvite = !this.ui.fullInvite; this.render(); }),
    downloadQr: () => downloadQrPng(this.roomUrl, `estimo-${this.ui.room}.png`),
    copyLink: () => this.#copyLink(),
  };

  /** <select> / checkbox changes */
  changes = {
    changeDeck: (el) => this.send({ t: "deck", deck: el.value }),
    chooseTheme: (el) => { const greeting = this.theme.choose(el.value); this.withTransition(() => this.render()); if (greeting) toast(greeting); },
    toggleSpectator: (el) => { storage.set("spectator", el.checked); this.send({ t: "spectator", on: el.checked }); },
    toggleSeasonal: (el) => { this.theme.seasonalAuto = el.checked; this.ui.fitKey = null; this.withTransition(() => this.render()); },
  };

  /** Form submissions */
  forms = {
    "create-form": () => {
      const { ui } = this;
      if (ui.limitInfo) return; // blocked at the limit (the server enforces it too)
      const name = $("#nick").value.trim().slice(0, 24);
      if (!name) return;
      const code = newRoomCode();
      me.name = name;
      Object.assign(ui, { pendingDeck: ui.homeDeck, pendingCreate: code, limitInfo: null });
      this.go(`/r/${code}`);
    },
    "join-form": () => {
      const code = normalizeCode($("#code").value);
      const name = $("#nick").value.trim().slice(0, 24);
      if (!isValidCode(code)) { this.ui.joinError = "Enter a room code like TIGER-472."; this.render(); return; }
      if (name) me.name = name;
      this.ui.joinError = "";
      this.go(`/r/${code}`);
    },
    "gate-form": () => {
      const name = $("#gnick").value.trim().slice(0, 24);
      if (!name) return;
      me.name = name;
      storage.set("spectator", $("#gspec").checked);
      this.connect();
      this.render();
    },
  };

  async #copyLink() {
    try { await navigator.clipboard.writeText(this.roomUrl); }
    catch { const input = $("#link"); if (!input) return; input.select(); document.execCommand("copy"); }
    toast("Link copied");
  }

  /* ================================================================
     DOM events
     ================================================================ */

  #bindEvents() {
    document.addEventListener("click", (e) => this.#onClick(e));
    document.addEventListener("change", (e) => this.changes[e.target.dataset.act]?.(e.target));
    document.addEventListener("submit", (e) => { e.preventDefault(); this.forms[e.target.id]?.(); });
    document.addEventListener("input", (e) => this.#onInput(e));
    document.addEventListener("keydown", (e) => this.#onKey(e));
    window.addEventListener("popstate", () => this.withTransition(() => this.onRoute()));
    window.addEventListener("resize", () => this.refitHome());
    document.fonts?.addEventListener?.("loadingdone", () => this.refitHome());
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => this.render());

    // Back online / tab visible again: reconnect now instead of waiting for the next backoff step
    const reconnect = () => { if (this.ui.route === "room" && me.name && !this.ui.roomError) this.connection.reconnectNow(); };
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      reconnect();
      // a tab left open overnight picks up a season that started (or ended) meanwhile
      const before = this.theme.current;
      this.theme.apply();
      if (this.theme.current !== before) { this.ui.fitKey = null; this.render(); }
    });
    window.addEventListener("offline", () => this.render());
  }

  #onClick(e) {
    const link = e.target.closest("[data-nav]");
    if (link && link.classList.contains("logo") && this.ui.route === "home") {
      e.preventDefault();
      this.#logoEasterEgg();
      return;
    }
    if (link && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      this.ui.joinError = "";
      this.go(link.getAttribute("data-nav"));
      return;
    }
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT" || el.type === "checkbox") return; // handled by "change"
    if (el.classList.contains("overlay") && e.target.closest("[data-stop]")) return; // click inside a dialog
    this.actions[el.dataset.act]?.(el, e);
  }

  #onInput(e) {
    const { id, value } = e.target;
    if (id === "nick") this.ui.draftNick = value;
    if (id === "code") this.ui.draftCode = value;
    if (id === "topic") { // send the ticket title once typing pauses
      clearTimeout(this.topicTimer);
      this.topicTimer = setTimeout(() => this.send({ t: "topic", text: value }), 350);
    }
  }

  #onKey(e) {
    const { ui } = this;
    if (e.key === "Escape") {
      if (ui.sheet) return this.closeSheet();
      if (ui.showInvite) { ui.showInvite = false; ui.fullInvite = false; return this.render(); }
      if (ui.drawerOpen) return this.closeDrawer();
    }
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.konamiStep = key === KONAMI[this.konamiStep] ? this.konamiStep + 1 : key === KONAMI[0] ? 1 : 0;
    if (this.konamiStep === KONAMI.length) { this.konamiStep = 0; return this.#toggleRetro(); }

    // Number keys vote (0 = 10 on the 1–10 scale)
    const state = ui.state;
    if (!state || state.revealed || ui.showInvite || !/^[0-9]$/.test(e.key)) return;
    const cards = state.decks[state.deck].cards;
    const card = e.key === "0" ? (cards.includes("10") ? "10" : "0") : e.key;
    if (cards.includes(card)) this.vote(card);
  }

  /** Easter egg: click the logo 7 times on the home page for the Retro theme. */
  #logoEasterEgg() {
    const now = Date.now();
    this.logoClicks = [...this.logoClicks.filter((t) => now - t < 4000), now];
    if (this.logoClicks.length >= 7) { this.logoClicks = []; this.#toggleRetro(); }
  }

  #toggleRetro() {
    const greeting = this.theme.choose(this.theme.isRetro ? "" : RETRO);
    this.withTransition(() => this.render());
    if (greeting) toast(greeting);
  }
}

/* ---------------- helpers ---------------- */

/** Show my vote in a snapshot before the server has confirmed it. */
function applyOptimisticVote(state, card) {
  state.mine = card;
  const mine = state.participants.find((p) => p.id === state.you);
  if (mine) mine.voted = card !== null;
}

function restoreFocus({ id, start, end, value }) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === "INPUT" && !el.readOnly && value != null) el.value = value;
  el.focus();
  try { if (start != null) el.setSelectionRange(start, end); } catch { /* not a text input */ }
}
