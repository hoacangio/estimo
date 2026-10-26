/** "Install Estimo" (PWA) prompt: Chrome's install event, or a tip for iOS Safari. */
import { storage } from "../lib/storage.js";

const SNOOZE_MS = 14 * 86400000;

export class InstallPrompt {
  /** @param {() => void} onChange  re-render when the prompt becomes (un)available */
  constructor(onChange) {
    this.event = null;
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.event = e; onChange(); });
    window.addEventListener("appinstalled", () => { this.event = null; storage.set("installed", true); onChange("installed"); });
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
    }
  }

  get isStandalone() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
  get isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  get snoozed() { return Date.now() - storage.get("installDismissed", 0) < SNOOZE_MS; }

  /** "install" (Chrome/Edge/Android), "ios" (show Safari instructions) or "" (nothing to show). */
  get mode() {
    if (this.isStandalone || this.snoozed) return "";
    if (this.event) return "install";
    return this.isIOS ? "ios" : "";
  }

  async install() {
    if (!this.event) return;
    this.event.prompt();
    const { outcome } = await this.event.userChoice.catch(() => ({}));
    this.event = null;
    if (outcome === "dismissed") this.snooze();
  }

  snooze() { storage.set("installDismissed", Date.now()); }
}
