/** Invite dialog: QR code, room link, full-screen mode for a meeting-room screen. */
import { esc } from "../lib/dom.js";
import { icon } from "../lib/icons.js";

export function inviteView(app) {
  const { ui } = app;
  const url = app.roomUrl;
  const enter = app.oneShot(ui.inviteAt, 340, "enter");
  return `
  <div class="overlay${enter.cls}"${enter.style} data-act="closeInvite">
    <div class="dialog ${ui.fullInvite ? "full" : ""}" role="dialog" aria-modal="true" aria-labelledby="inv-title" data-stop>
      <span class="sheet-handle" aria-hidden="true"></span>
      <div class="full-hide" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><h2 id="inv-title">Invite your team</h2><span class="muted" style="font-size:14px">Scan with a phone camera or share the link.</span></div>
        <button class="btn btn-icon" style="border:none" data-act="closeInvite" aria-label="Close">${icon("x")}</button>
      </div>
      <div class="qr"><div id="qr" role="img" aria-label="QR code for ${esc(url)}"></div><span class="mark" aria-hidden="true"><i></i></span></div>
      <div class="full-only">${esc(url.replace(/^https?:\/\//, ""))}</div>
      <div class="full-hide">
        <label class="label" for="link" style="font-size:13px">Room link</label>
        <div class="join-row"><input class="input" id="link" readonly value="${esc(url)}" style="height:44px;font-size:13px;background:var(--bg)"><button class="btn btn-primary" data-act="copyLink" style="height:44px">Copy</button></div>
        <div class="hint">Or enter code <strong class="room-code" style="font-weight:600;color:var(--ink)">${esc(ui.room)}</strong> on the home page.</div>
      </div>
      <div class="actions full-hide" style="border-top:1px solid var(--surface-2);padding-top:18px">
        <button class="btn" data-act="toggleFullInvite" style="flex:1 1 160px">${icon("expand")}Show full screen</button>
        <button class="btn" data-act="downloadQr" style="flex:1 1 160px">${icon("download")}Download PNG</button>
      </div>
      ${ui.fullInvite ? `<button class="btn" data-act="toggleFullInvite">Exit full screen</button>` : ""}
    </div>
  </div>`;
}
