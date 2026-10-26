/** Home screen: nickname, voting scale, create / join, recent rooms. */
import { esc } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { me } from "../lib/storage.js";
import { HOME_DECKS, deckLabel } from "../domain/decks.js";
import { logoLink, darkModeButton, retroTicker, retroFooter, seasonStrip } from "./common.js";
import { sheetView } from "./sheets.js";

export function homeView(app) {
  const { ui } = app;
  const T = app.t;
  const deck = HOME_DECKS.find((d) => d.key === ui.homeDeck) ?? HOME_DECKS[2];
  return `
  <div class="home${ui.homeTight ? " tight" : ""}">
    <header>
      ${logoLink()}
      <span class="theme-btns">${darkModeButton(app)}<button class="btn btn-icon" data-act="openSettings" aria-label="Settings">${icon("gear")}</button></span>
    </header>
    ${seasonStrip(app)}${retroTicker(app)}
    <main>
      <div class="wrap">
        <section class="hero">
          <p class="eyebrow">${T("Planning poker", "Web 2.0 · Không cần đăng ký!")}</p>
          <h1>${T("Estimate together, in real time.", "Ước lượng cùng nhau, nhanh như chớp!")}</h1>
          <p>Create a room, invite your team with a link or QR code, and vote together. Supports Fibonacci, modified Fibonacci, T-shirt sizes, powers of 2 and a 1–10 scale.</p>
          <div class="fan" aria-hidden="true"><div>3</div><div>5</div><div>8</div>${app.theme.isRetro ? '<span class="starburst">100% miễn phí!</span>' : ""}</div>
        </section>
        <section class="panel card">
          ${createForm(app, deck)}
          <label class="label join-label" for="code">Join a room</label>
          <form id="join-form" class="join-row">
            <input class="input" id="code" value="${esc(ui.draftCode ?? "")}" placeholder="e.g. TIGER-472" autocapitalize="off" autocomplete="off" spellcheck="false">
            <button class="btn" type="submit" style="height:48px;border-color:var(--ink)">${T("Join", "Vào!")}</button>
          </form>
          ${limitNotice(app)}
          ${ui.joinError ? `<div class="hint" style="color:var(--bad)">${esc(ui.joinError)}</div>` : ""}
          ${installTip(app)}
          ${recentRooms(app)}
        </section>
      </div>
    </main>
    ${app.theme.isRetro ? retroFooter(app) : `<footer><span>Rooms are deleted after 30 days of inactivity.</span><span>v1.0</span></footer>`}
  </div>${ui.sheet ? sheetView(app) : ""}`;
}

function createForm(app, deck) {
  const { ui } = app;
  const atLimit = !!ui.limitInfo;
  return `
  <form id="create-form">
    <label class="label" for="nick">Your nickname</label>
    <input class="input" id="nick" maxlength="24" autocomplete="nickname" value="${esc(ui.draftNick ?? me.name)}" placeholder="e.g. Hòa" required>
    <div class="hint saved-hint">${me.name ? icon("check") : ""}Saved on this device</div>
    <div class="deck-field">
      <span class="label">Voting scale</span>
      <div class="decks" role="group" aria-label="Voting scale">
        ${HOME_DECKS.map((d) => `<button type="button" class="chip" data-act="chooseHomeDeck" data-deck="${d.key}" aria-pressed="${d.key === ui.homeDeck}">${d.label}</button>`).join("")}
      </div>
      <div class="hint mono deck-hint">${esc(deck.preview)}</div>
    </div>
    <button class="btn btn-primary btn-lg create-btn" type="submit" ${atLimit ? 'disabled aria-describedby="limit-note"' : ""}>${atLimit ? `Room limit reached (${ui.limitInfo.max})` : app.t("Create a new room", "Tạo phòng ngay »")}</button>
  </form>`;
}

/** Shown when this browser already hosts the maximum number of rooms. */
function limitNotice(app) {
  const info = app.ui.limitInfo;
  if (!info) return "";
  // Rooms already in "Recent rooms" have their own delete button there; list only the others.
  const elsewhere = info.rooms.filter((code) => !app.recent.has(code));
  return `<div class="notice" id="limit-note" role="status"><strong>You host ${info.max} of ${info.max} rooms.</strong> Delete one to create a new room${elsewhere.length ? ":" : " (trash icon in Recent rooms)."}
    <div class="notice-rooms">${elsewhere.map((code) => `<span class="nr"><a href="/r/${esc(code)}" data-nav="/r/${esc(code)}">${esc(code)}</a><button type="button" class="nr-del" data-act="askDeleteRoom" data-code="${esc(code)}" data-host="1" aria-label="Delete ${esc(code)}">${icon("trash")}</button></span>`).join("")}</div></div>`;
}

function installTip(app) {
  switch (app.install.mode) {
    case "install":
      return `<div class="install"><img src="/icons/icon-192.png" alt=""><div class="grow"><strong>Install Estimo</strong>Open Estimo in its own window from your home screen.</div><button class="btn btn-sm" data-act="install">Install</button></div>`;
    case "ios":
      return `<div class="install"><img src="/icons/icon-192.png" alt=""><div class="grow"><strong>Add Estimo to your Home Screen</strong>In Safari, tap Share, then “Add to Home Screen”.</div><button class="btn btn-sm" data-act="snoozeInstall" aria-label="Hide this tip">Later</button></div>`;
    default:
      return "";
  }
}

function recentRooms(app) {
  const rooms = app.recent.all();
  if (!rooms.length) return "";
  const { page, pages, items } = app.recentPage(rooms);
  const pager = pages > 1 ? `<div class="pager" role="group" aria-label="Recent rooms pages">
      <button type="button" class="btn btn-icon btn-sm" data-act="recentPage" data-dir="-1" aria-label="Previous page" ${page === 0 ? "disabled" : ""}>‹</button>
      <span class="muted">${page + 1}/${pages}</span>
      <button type="button" class="btn btn-icon btn-sm" data-act="recentPage" data-dir="1" aria-label="Next page" ${page === pages - 1 ? "disabled" : ""}>›</button></div>` : "";
  return `
  <div class="recent">
    <div class="recent-head"><h2>Recent rooms</h2>${pager}</div>
    ${items.map(recentRow).join("")}
  </div>`;
}

const ago = (time) => {
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(time).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const recentRow = (room) => `<div class="recent-row">
  <a href="/r/${esc(room.code)}" data-nav="/r/${esc(room.code)}"><span class="rc">${esc(room.code)}${room.host ? ' <span class="tag">Host</span>' : ""}</span><span class="muted" style="font-size:13px">${esc(ago(room.at))}${room.deck ? " · " + esc(deckLabel(room.deck)) : ""}</span></a>
  <button type="button" class="btn btn-icon btn-sm row-act" data-act="askDeleteRoom" data-code="${esc(room.code)}" aria-label="${room.host ? "Delete" : "Remove"} ${esc(room.code)}">${icon(room.host ? "trash" : "x")}</button>
</div>`;
