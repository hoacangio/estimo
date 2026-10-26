/** Bottom sheets: Settings (theme) and "Delete room?" / "Remove from recent rooms?". */
import { esc } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { FUN_THEMES } from "../services/ThemeManager.js";
import { sheet } from "./common.js";

export const sheetView = (app) => (app.ui.sheet.kind === "settings" ? settingsSheet(app) : roomSheet(app));

function settingsSheet(app) {
  const selected = app.theme.funTheme;
  const options = [["", "Default"], ...Object.entries(FUN_THEMES).map(([key, t]) => [key, t.label])];
  return sheet(app, {
    title: "Settings",
    body: `
      <div class="set-row"><span>Dark mode</span><button class="btn btn-sm" data-act="toggleDark" ${selected ? "disabled" : ""}>${app.theme.isDark ? "On" : "Off"}</button></div>
      <div class="theme-list" role="radiogroup" aria-label="Theme">
        <span class="label">Theme</span>
        ${options.map(([key, label]) => `<button class="theme-opt" role="radio" aria-checked="${selected === key}" data-act="chooseTheme" data-theme="${key}">${esc(label)}${selected === key ? icon("check") : ""}</button>`).join("")}
      </div>
      <button class="btn btn-lg" data-act="closeSheet">Done</button>`,
  });
}

/** Hosts delete the room for everyone; anyone else only removes it from this device. */
function roomSheet(app) {
  const { code, host, busy, error } = app.ui.sheet;
  return sheet(app, {
    title: host ? "Delete room?" : "Remove from recent rooms?",
    body: `
      <p class="sheet-code">${esc(code)}</p>
      <p class="muted">${host ? "The room and its ticket history are deleted for everyone in it. This can’t be undone." : "Only removes it from this device. The room itself is not deleted."}</p>
      ${error ? `<p class="sheet-error" role="alert">${esc(error)}</p>` : ""}
      <div class="sheet-actions">
        <button class="btn btn-lg" data-act="closeSheet" ${busy ? "disabled" : ""}>Cancel</button>
        <button class="btn btn-lg ${host ? "btn-danger-solid" : "btn-primary"}" data-act="confirmDeleteRoom" ${busy ? "disabled" : ""}>${busy ? "Deleting…" : host ? "Delete room" : "Remove"}</button>
      </div>`,
  });
}
