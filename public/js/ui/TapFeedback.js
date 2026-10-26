/**
 * Visible press feedback on quick taps.
 * A tap re-renders the screen before the CSS :active press can show, so we remember
 * which control was pressed and let the matching control in the new DOM replay a short
 * press-release animation (continued, not restarted, across further re-renders).
 */
const ATTRS = ["data-act", "data-v", "data-code", "data-deck", "data-theme", "data-dir", "data-nav", "id"];
const MAX_WAIT_MS = 700;   // ignore renders that happen long after the tap
const ANIMATION_MS = 260;

export class TapFeedback {
  /** @param {() => boolean} enabled  e.g. off for the Retro theme and reduced motion */
  constructor(enabled) {
    this.enabled = enabled;
    this.tap = null;
    // iOS Safari only applies :active styles when a touch listener exists
    document.addEventListener("touchstart", () => {}, { passive: true });
    document.addEventListener("pointerdown", (e) => this.#record(e), { capture: true, passive: true });
  }

  #record(event) {
    if (!this.enabled()) return;
    const el = event.target.closest("button, a.btn, .recent a, .logo");
    if (!el || el.disabled) return;
    const selector = el.tagName.toLowerCase()
      + ATTRS.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join("");
    this.tap = { selector, at: performance.now(), start: null };
  }

  /** Call after every render. */
  replay(root) {
    const tap = this.tap;
    if (!tap) return;
    const now = performance.now();
    if (now - tap.at > MAX_WAIT_MS || (tap.start && now - tap.start > ANIMATION_MS)) { this.tap = null; return; }
    const el = root.querySelector(tap.selector);
    if (!el) return;
    tap.start ??= now;
    el.classList.add("tapped");
    el.style.animationDelay = `${-Math.round(now - tap.start)}ms`;
  }
}
