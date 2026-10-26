/** Room sidebar (a drawer on phones): participants, ticket history, settings. */
import { esc } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { me } from "../lib/storage.js";
import { numeric, fmt, voters } from "../domain/stats.js";
import { themeControls } from "./common.js";

export const sidebarView = (app, state) => participants(app, state) + history(app, state) + settings(app, state);

function participants(app, state) {
  const players = voters(state);
  const spectators = state.participants.filter((p) => p.spectator);
  const status = (p) => {
    if (p.spectator) return '<span class="tag">Spectator</span>';
    if (state.revealed) return `<span class="ok">${p.vote == null ? "—" : esc(p.vote)}</span>`;
    return p.voted ? '<span class="ok">Voted</span>' : '<span class="wait">Not voted</span>';
  };
  const row = (p, firstSpectator = false) => `<li class="${firstSpectator ? "spec-first" : ""}"><span class="n">${esc(p.name)}${p.id === state.you ? ' <span class="muted">(you)</span>' : ""}${p.id === state.host ? ' <span class="tag host">Host</span>' : ""}</span>${status(p)}</li>`;
  return `
  <section class="card box">
    <div class="box-head"><h2>${app.t("Participants")}</h2><span class="muted" style="font-size:13px">${state.participants.length} online</span></div>
    <ul class="plist">${players.map((p) => row(p)).join("")}${spectators.map((p, i) => row(p, i === 0 && players.length > 0)).join("")}</ul>
  </section>`;
}

function history(app, state) {
  const T = app.t;
  const items = state.history;
  if (!items.length) {
    return `<section class="card box"><div class="box-head"><h2>${T("History")}</h2></div>
      <p class="muted" style="font-size:14px;margin:10px 0 0">${T("No tickets estimated yet.", "Chưa có gì ở đây cả :( Hãy là người đầu tiên!")}</p></section>`;
  }
  const total = items.reduce((sum, r) => sum + (numeric(r.final ?? "") ?? 0), 0);
  return `
  <section class="card box">
    <div class="box-head"><h2>${T("History")}</h2><button class="btn-link" data-act="exportCsv">Export CSV</button></div>
    <ul class="hlist">${items.map((r) => `<li><span class="t" title="${esc(r.topic)}">${esc(r.topic)}</span><span class="pts">${esc(r.final ?? "—")}</span></li>`).join("")}</ul>
    <div class="total"><span class="muted">Session total</span><strong>${fmt(total)} pts · ${items.length} ticket${items.length === 1 ? "" : "s"}</strong></div>
  </section>`;
}

function settings(app, state) {
  const mine = state.participants.find((p) => p.id === state.you);
  const isHost = state.host && state.host === state.you;
  const initial = (me.name || "?").trim().charAt(0).toUpperCase();
  return `
  <section class="card box settings">
    <div class="box-head"><h2>Settings</h2></div>
    <div class="set-row"><label for="deck">Voting scale</label>
      <select class="select" id="deck" data-act="changeDeck">${Object.entries(state.decks).map(([key, d]) => `<option value="${key}" ${key === state.deck ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select></div>
    <div class="set-row"><span>Theme</span>${themeControls(app, "btn-sm")}</div>
    <div class="set-row"><span>Nickname</span>
      <button class="me" data-act="rename" aria-label="Change nickname"><span class="avatar">${esc(initial)}</span><span>${esc(me.name)}</span>${icon("pen")}</button></div>
    <label class="check set-check"><input type="checkbox" data-act="toggleSpectator" ${mine?.spectator ? "checked" : ""}>Spectator (watch without voting)</label>
    ${isHost ? `<div class="danger-zone">
      <button class="btn btn-sm btn-danger" data-act="askDeleteCurrentRoom">${icon("trash")}Delete room</button>
      <span class="muted">Deletes the room and its history for all participants.</span>
    </div>` : ""}
  </section>`;
}
