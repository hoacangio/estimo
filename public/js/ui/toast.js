/** A short message at the bottom of the screen. */
import { $ } from "../lib/dom.js";

const VISIBLE_MS = 2200;
let timer;

export function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden", "leave", "show");
  void el.offsetWidth; // restart the enter animation
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.replace("show", "leave");
    timer = setTimeout(() => el.classList.add("hidden"), 200);
  }, VISIBLE_MS);
}
