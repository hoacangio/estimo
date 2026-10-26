/** Screens shown instead of a room: join gate (no nickname yet), room errors, invalid links. */
import { esc } from "../lib/dom.js";
import { storage } from "../lib/storage.js";
import { logoLink } from "./common.js";

export function gateView(app) {
  return `
  <div class="gate"><div class="inner">
    ${logoLink()}
    <div style="margin-top:56px">
      <span style="font-size:14px;font-weight:500;color:var(--accent-ink)">Join room</span>
      <h1 class="room-code">${esc(app.ui.room)}</h1>
    </div>
    <form id="gate-form" style="margin-top:32px;display:flex;flex-direction:column;flex:1">
      <label class="label" for="gnick" style="font-size:15px">Your nickname</label>
      <input class="input" id="gnick" maxlength="24" autocomplete="nickname" placeholder="e.g. Hòa" required autofocus style="height:52px;font-size:17px">
      <div class="hint">Saved on this device</div>
      <label class="check" style="margin-top:18px"><input type="checkbox" id="gspec" ${storage.get("spectator", false) ? "checked" : ""}>Spectator (watch without voting)</label>
      <div style="flex:1;min-height:32px"></div>
      <button class="btn btn-primary btn-lg" type="submit" style="width:100%;height:54px;font-size:17px">Join room</button>
    </form>
  </div></div>`;
}

export function roomErrorView(app) {
  const { room, code } = app.ui.roomError;
  const T = app.t;
  const title = {
    not_found: T("Room not found.", "Oops! Phòng này không tồn tại :("),
    deleted: T("The host deleted this room.", "Chủ phòng đã xoá phòng này rồi :("),
    expired: T("This room expired after 30 days without activity.", "Phòng đã hết hạn sau 30 ngày không ai ghé :("),
  }[code];
  const hint = code === "not_found" ? "Check the room code or ask the host for a new link." : "Create a new room from the home page.";
  return `<div class="gate"><div class="inner">${logoLink()}
    <p class="muted room-code" style="margin:56px 0 0">${esc(room)}</p>
    <h1 style="font-family:var(--serif);font-weight:500;margin:8px 0 12px">${title}</h1>
    <p class="muted" style="margin:0 0 28px">${hint}</p>
    <a class="btn btn-primary btn-lg" href="/" data-nav="/">Go to home</a></div></div>`;
}

export function badRoomView() {
  return `<div class="gate"><div class="inner">${logoLink()}
    <h1 style="font-family:var(--serif)">This room link isn’t valid.</h1>
    <p class="muted">Room codes use letters, numbers and dashes (3–40 characters).</p>
    <a class="btn btn-primary btn-lg" href="/" data-nav="/">Go to home</a></div></div>`;
}
