/** Small pieces shared by several screens. Every view is a function (app) => HTML string. */
import { esc } from "../lib/dom.js";
import { icon, LOGO } from "../lib/icons.js";
import { FUN_THEMES } from "../services/ThemeManager.js";

export const logoLink = (label = "") =>
  `<a class="logo" href="/" data-nav="/"${label ? ` aria-label="${label}"` : ""}>${LOGO}<b>Estimo</b></a>`;

export function darkModeButton(app, size = "") {
  const dark = app.theme.isDark;
  return `<button class="btn btn-icon ${size}" data-act="toggleDark" aria-label="${dark ? "Switch to light mode" : "Switch to dark mode"}">${icon(dark ? "sun" : "moon")}</button>`;
}

/** Dark-mode toggle + theme select (used in the room's Settings section). */
export function themeControls(app, size = "") {
  const current = app.theme.current;
  const options = Object.entries(FUN_THEMES)
    .map(([key, t]) => `<option value="${key}" ${current === key ? "selected" : ""}>${t.label}</option>`).join("");
  return `<span class="theme-btns">${darkModeButton(app, size)}`
    + `<label class="sr-only" for="theme-pick">Theme</label>`
    + `<select id="theme-pick" class="select theme-pick" data-act="chooseTheme" title="Fun themes"><option value="">Default theme</option>${options}</select></span>`;
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function sheet(app, { title, body, labelId = "sheet-title" }) {
  const enter = app.oneShot(app.ui.sheet.at, 340, "enter");
  return `
  <div class="overlay${enter.cls}"${enter.style} data-act="closeSheet">
    <div class="dialog room-sheet" role="dialog" aria-modal="true" aria-labelledby="${labelId}" data-stop>
      <span class="sheet-handle" aria-hidden="true"></span>
      <h2 id="${labelId}">${esc(title)}</h2>
      ${body}
    </div>
  </div>`;
}

/* ---- Retro 2007 theme extras ---- */

export function retroTicker(app) {
  if (!app.theme.isRetro) return "";
  return `<div class="r-ticker" aria-hidden="true"><span>★ Mới! Estimo giờ đã có QR code — quét là vào! ★ Hỗ trợ thang 1–10, Fibonacci, T-shirt ★ Không cần đăng ký, không spam ★ Web 2.0 ready ★ Gõ ↑↑↓↓←→←→BA để quay về 2026 ★</span></div>`;
}

export function retroFooter(app) {
  const digits = String(128734 + app.visits).padStart(7, "0").split("").map((d) => `<b>${d}</b>`).join("");
  const badge = (left, right, color) => `<span class="r-badge"><i>${left}</i><em style="background:${color}">${right}</em></span>`;
  return `<footer class="r-footer" aria-hidden="true">
    <div>Bạn là người truy cập thứ</div><div class="r-counter">${digits}</div>
    <div class="r-badges">${badge("W3C", "XHTML 1.0", "#1f5aa6")}${badge("CSS", "valid!", "#3f7a14")}${badge("RSS", "2.0 feed", "#b34d00")}${badge("Web", "2.0 ready", "#c2105e")}${badge("get", "Firefox 2", "#a8410b")}</div>
    <div>Xem tốt nhất với Firefox 2 hoặc IE7, độ phân giải 1024×768 · © 2007 Estimo Inc.</div>
  </footer>`;
}
