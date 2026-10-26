/**
 * Room screen, laid out to fit one screen:
 *   header  ·  stage (topic, table, then your cards or the final estimate)  ·  sidebar (drawer on phones)
 */
import { esc } from "../lib/dom.js";
import { icon, LOGO } from "../lib/icons.js";
import { META_CARDS } from "../domain/decks.js";
import { computeStats, finalOptions, fmt, voters } from "../domain/stats.js";
import { retroTicker } from "./common.js";
import { sidebarView } from "./sidebar.js";
import { inviteView } from "./invite.js";
import { sheetView } from "./sheets.js";

export function roomView(app) {
  const { ui } = app;
  const state = ui.state;
  const overlays = (ui.showInvite ? inviteView(app) : "") + (ui.sheet ? sheetView(app) : "");
  if (!state) return `<div class="room">${header(app)}${loading(app)}</div>${overlays}`;

  const drawer = drawerAnimation(app);
  const banner = ui.connected ? "" : `<div class="banner">${app.t("Connection lost. Reconnecting — your vote is saved.", "Oops! Mất kết nối rồi. Đang thử lại… phiếu của bạn vẫn còn đó ^^ (lâu quá thì F5 nhé)")}</div>`;
  return `<div class="room${ui.drawerOpen ? " drawer-open" : ""}${drawer.cls}">${header(app)}${banner}
    <div class="room-body">
      <main class="stage${state.revealed ? " revealed" : ""}">
        ${topicBar(app, state)}
        <div class="stage-scroll">${table(app, state)}${state.revealed ? results(state) : ""}</div>
        <div class="dock">${state.revealed ? finalEstimate(app, state) : hand(app, state)}</div>
      </main>
      <aside class="drawer" id="room-drawer" aria-label="Room details"${drawer.style}>
        <div class="drawer-head"><h2>Room</h2><button class="btn btn-icon btn-sm" data-act="closeDrawer" aria-label="Close room menu">${icon("x")}</button></div>
        ${sidebarView(app, state)}
      </aside>
    </div>
    ${ui.drawerOpen ? `<div class="scrim" data-act="closeDrawer"${drawer.style}></div>` : ""}
  </div>${overlays}`;
}

/** Slide-in / slide-out of the drawer, continued across re-renders. */
function drawerAnimation(app) {
  const { ui } = app;
  if (!ui.drawerOpen) return { cls: "", style: "" };
  const leaving = app.oneShot(ui.drawerLeaveAt, 240, "drawer-leave");
  return leaving.cls ? leaving : app.oneShot(ui.drawerAt, 300, "drawer-enter");
}

function header(app) {
  const { ui } = app;
  const menu = ui.state
    ? `<button class="btn btn-icon btn-sm menu-btn" data-act="toggleDrawer" aria-label="Room menu" aria-expanded="${!!ui.drawerOpen}" aria-controls="room-drawer">${icon("menu")}<span class="badge">${ui.state.participants.length}</span></button>`
    : "";
  return `
  <header class="topbar">
    <div class="left">
      <a class="logo" href="/" data-nav="/" aria-label="Estimo home">${LOGO}<b class="hide-sm">Estimo</b></a>
      <span class="sep hide-sm"></span>
      <span class="code">${esc(ui.room)}</span>
    </div>
    <div class="right">
      <button class="btn btn-accent btn-sm" data-act="openInvite" aria-label="Invite">${icon("qr")}<span class="label-wide">${app.t("Invite", "Mời bạn bè!")}</span></button>
      ${menu}
    </div>
  </header>${retroTicker(app)}`;
}

function loading(app) {
  const T = app.t;
  const message = !navigator.onLine ? "You’re offline. Reconnecting when the network is back."
    : app.ui.everConnected ? T("Reconnecting…", "Oops! Mất kết nối rồi. Đang thử lại…")
    : T("Connecting to the room…", "Đang tải… (bằng AJAX!)");
  const card = '<span class="bone" style="width:60px;height:86px"></span>';
  return `<div class="room-body"><main class="stage"><div class="stage-scroll"><div class="table">
    <div class="skeleton" aria-hidden="true"><div class="row">${card}${card}${card}</div><span class="bone" style="width:200px;height:12px;border-radius:6px"></span></div>
    <p class="muted" role="status">${message}</p></div></div></main></div>`;
}

function topicBar(app, state) {
  return `
  <section class="card topic">
    <div class="field">
      <label for="topic">${app.t("Now estimating")}</label>
      <input id="topic" maxlength="200" placeholder="Ticket key or title, e.g. AUTH-1423" value="${esc(state.topic)}" autocomplete="off">
    </div>
    ${state.revealed ? "" : `<button class="btn btn-sm" data-act="skipTicket">Skip</button>`}
  </section>`;
}

/* ---------------- the table: everyone's card + vote progress ---------------- */

function table(app, state) {
  const people = voters(state);
  const seats = people.length ? `<div class="seats">${people.map((p) => seat(app, state, p)).join("")}</div>` : "";
  return `<section class="table" aria-label="Table">${seats}${tableStatus(app, state, people)}</section>`;
}

function seat(app, state, person) {
  const { ui } = app;
  let cls = "pcard empty", face = "", anim = { cls: "", style: "" };
  if (state.revealed) {
    if (person.vote == null) { cls = "pcard up none"; face = "–"; }
    else {
      const stats = computeStats(state);
      const outlier = stats && stats.outliers.has(person.vote) && !stats.unanimous;
      anim = app.oneShot(ui.flipAt, 350, "flip");
      cls = `pcard up${outlier ? " outlier" : META_CARDS.has(person.vote) ? " off" : ""}`;
      face = person.vote === "☕" ? icon("cup") : esc(person.vote);
    }
  } else if (person.voted) {
    cls = "pcard down";
    anim = app.oneShot(ui.dealAt[person.id], 400, "deal");
  }
  const label = state.revealed ? "" : ` aria-label="${person.voted ? "voted" : "not voted yet"}"`;
  const you = person.id === state.you ? ' <span class="muted" style="font-weight:400">(you)</span>' : "";
  return `<div class="seat ${person.id === state.you ? "mine" : ""}"><div class="${cls}${anim.cls}"${anim.style}${label}>${face}</div><span class="name" title="${esc(person.name)}">${esc(person.name)}${you}</span></div>`;
}

function tableStatus(app, state, people) {
  const T = app.t;
  if (!people.length) return `<p class="muted">${T("No voters yet. Use Invite to share the room.", "Chưa có ai cả :( Hãy là người đầu tiên — mời đồng đội vào nhé!")}</p>`;

  if (state.revealed) {
    const st = computeStats(state);
    if (st && st.outliers.size && !st.unanimous) {
      const names = people.filter((p) => st.outliers.has(p.vote)).map((p) => `${p.name} (${p.vote})`).join(", ");
      return `<span class="legend"><span></span>Outliers: ${esc(names)}</span>`;
    }
    return st?.unanimous ? `<span class="legend" style="color:var(--good)">${icon("check")}Consensus: ${esc(st.mode)}</span>` : "";
  }

  const voted = people.filter((p) => p.voted).length;
  const waiting = people.filter((p) => !p.voted).map((p) => p.name);
  const percent = Math.round((voted / people.length) * 100);
  // The bar starts at the width the previous render showed; App.render() then animates it to `percent`.
  return `
  <div class="status">
    <span style="color:var(--ink-2)"><strong style="color:var(--ink)">${voted} of ${people.length}</strong> ${voted === 1 ? "has" : "have"} voted${waiting.length && waiting.length <= 3 ? ` · waiting for ${esc(waiting.join(", "))}` : ""}</span>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${people.length}" aria-valuenow="${voted}"><div data-to="${percent}" style="width:${app.ui.lastPct ?? percent}%"></div></div>
    <div class="actions">
      <button class="btn btn-primary" data-act="reveal" ${voted ? "" : "disabled"}>${T("Reveal cards", "Lật bài!")}</button>
      <button class="btn" data-act="reset" ${voted ? "" : "disabled"}>Reset</button>
    </div>
  </div>`;
}

/* ---------------- dock: your cards (voting) or the final estimate (revealed) ---------------- */

function hand(app, state) {
  const mine = voters(state).find((p) => p.id === state.you);
  if (!mine) return `<section class="hand"><p class="muted">Spectator mode. Turn it off in Settings to vote.</p></section>`;
  const { pop } = app.ui;
  const card = (c) => {
    const anim = pop?.v === c ? app.oneShot(pop.at, 320, "pop") : { cls: "", style: "" };
    const label = c === "☕" ? "Need a break" : c === "?" ? "Not sure" : "Vote " + esc(c);
    return `<button class="vcard${META_CARDS.has(c) ? " meta" : ""}${c.length > 2 ? " wide" : ""}${anim.cls}"${anim.style} data-act="vote" data-v="${esc(c)}" aria-pressed="${state.mine === c}" aria-label="${label}">${c === "☕" ? icon("cup") : esc(c)}</button>`;
  };
  return `
  <section class="hand" aria-label="Your card">
    <span class="tip muted" style="font-size:13px">Shortcut: keys <kbd>1</kbd>–<kbd>0</kbd></span>
    <div class="cards">${state.decks[state.deck].cards.map(card).join("")}</div>
  </section>`;
}

function results(state) {
  const st = computeStats(state);
  if (!st) return `<section class="card box"><p class="muted" style="margin:0">No numeric votes this round.</p></section>`;
  const kpi = (label, value, small = false) => `<div class="kpi"><span>${label}</span><b${small ? ' class="sm"' : ""}>${value}</b></div>`;
  const bars = st.dist.map((d) => `<div class="row"><span class="v">${esc(d.v)}</span><div class="bar"><div class="${d.n === st.top ? "top" : ""}" style="width:${(d.n / st.top) * 100}%"></div></div><span class="n">${d.n}</span></div>`).join("");
  return `
  <section class="stats">
    <div class="card kpis">
      ${kpi("Average", st.avg == null ? "—" : fmt(st.avg))}
      ${kpi("Median", esc(typeof st.median === "number" ? fmt(st.median) : st.median))}
      ${kpi("Range", esc(st.min === st.max ? st.min : `${st.min} – ${st.max}`), true)}
      ${kpi("Agreement", `${st.agreement}% <span class="muted" style="font-family:var(--sans);font-size:14px">on ${esc(st.mode)}</span>`, true)}
    </div>
    <div class="card dist">
      <span class="muted" style="font-size:13px">Distribution · ${st.count} vote${st.count === 1 ? "" : "s"}</span>
      ${bars}
    </div>
  </section>`;
}

function finalEstimate(app, state) {
  const st = computeStats(state);
  const T = app.t;
  const picker = st ? `<div class="pick" role="group" aria-label="Final estimate">
      <span class="pick-label">Final</span>
      ${finalOptions(st, app.ui.final).map((o) => `<button class="opt" data-act="chooseFinal" data-v="${esc(o)}" aria-pressed="${o === app.ui.final}">${esc(o)}</button>`).join("")}
      <span class="muted" style="font-size:13px">Suggested: ${st.unanimous ? "consensus" : "median"}</span>
    </div>` : "<span></span>";
  return `
  <section class="card final">
    ${picker}
    <div class="actions">
      <button class="btn btn-lg" data-act="reset">${T("Re-vote")}</button>
      <button class="btn btn-primary btn-lg" data-act="saveAndNext">${T("Save &amp; next ticket", "Lưu &amp; tiếp »")}</button>
    </div>
  </section>`;
}
