/** Small DOM helpers shared by every module. */

export const $ = (selector, root = document) => root.querySelector(selector);

/** Escape text for safe use inside HTML templates. Every user-provided string goes through this. */
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isTouch = () => matchMedia("(pointer: coarse)").matches;

/** Short vibration on phones (ignored elsewhere). */
export function vibrate(pattern) {
  if (navigator.vibrate && isTouch()) { try { navigator.vibrate(pattern); } catch { /* not allowed */ } }
}

/**
 * One-shot animations (card pop, reveal flip, sheet enter) must survive re-renders.
 * An element rendered mid-animation gets a negative delay equal to the time already
 * elapsed, so it continues where the replaced element left off.
 *
 * @param {number|null} startedAt  performance.now() when the animation started
 * @param {number} durationMs
 * @param {string} className       class that runs the animation
 * @returns {{cls: string, style: string}} a " class" suffix and a ` style="…"` attribute (both empty when finished)
 */
export function oneShot(startedAt, durationMs, className) {
  const age = startedAt == null ? Infinity : performance.now() - startedAt;
  return age < durationMs
    ? { cls: " " + className, style: ` style="animation-delay:-${Math.round(age)}ms"` }
    : { cls: "", style: "" };
}

/** Add a stylesheet once (fonts, lazy theme CSS). */
export function addStylesheet(href, { id, onload } = {}) {
  const key = id || href;
  const existing = document.querySelector(`link[data-key="${CSS.escape(key)}"]`);
  if (existing) { // e.g. added early by boot.js: still tell the caller when it finishes loading
    if (onload && !existing.sheet) existing.addEventListener("load", onload, { once: true });
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = href; link.dataset.key = key;
  if (id) link.id = id;
  if (onload) link.onload = onload;
  document.head.appendChild(link);
}
