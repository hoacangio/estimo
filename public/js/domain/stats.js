/** Vote statistics after a reveal. Pure functions: easy to test, no DOM. */
import { META_CARDS } from "./decks.js";

/** Numeric value of a card, or null for cards like "XL" or "?". */
export const numeric = (card) => (card === "½" ? 0.5 : /^\d+(\.\d+)?$/.test(card) ? Number(card) : null);

/** Format a number for display: integers as-is, otherwise one decimal. */
export const fmt = (n) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

function median(values) {
  const a = [...values].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Participants who vote (spectators excluded). */
export const voters = (state) => state.participants.filter((p) => !p.spectator);

/**
 * @returns null when nobody picked a real estimate, otherwise
 *   { count, avg, median, min, max, agreement, mode, top, dist, outliers, medIdx, cards, unanimous }
 */
export function computeStats(state) {
  const cards = state.decks[state.deck].cards.filter((c) => !META_CARDS.has(c));
  const votes = voters(state).filter((p) => p.vote != null).map((p) => p.vote);
  const real = votes.filter((v) => cards.includes(v));
  if (!real.length) return null;

  const positions = real.map((v) => cards.indexOf(v));
  const medIdx = median(positions);
  const lowest = Math.min(...positions), highest = Math.max(...positions);

  const counts = new Map();
  for (const v of real) counts.set(v, (counts.get(v) || 0) + 1);
  const dist = cards.filter((c) => counts.has(c)).map((c) => ({ v: c, n: counts.get(c) }));
  const top = Math.max(...dist.map((d) => d.n));
  const mode = dist.find((d) => d.n === top).v;

  const nums = real.map(numeric);
  const allNumeric = nums.every((n) => n !== null);

  // An outlier is an extreme vote at least two cards away from the median
  const outliers = new Set(real.filter((v) => {
    const i = cards.indexOf(v);
    return Math.abs(i - medIdx) >= 2 && (i === lowest || i === highest);
  }));

  return {
    count: real.length,
    avg: allNumeric ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
    median: allNumeric ? median(nums) : cards[Math.round(medIdx)],
    min: cards[lowest], max: cards[highest],
    agreement: Math.round((top / real.length) * 100), mode, top,
    dist, outliers, medIdx, cards,
    unanimous: dist.length === 1,
  };
}

/** The card to pre-select as the final estimate: consensus, else the card nearest the median (ties round up). */
export function suggestFinal(state) {
  const st = computeStats(state);
  if (!st) return null;
  if (st.unanimous) return st.mode;
  if (typeof st.median !== "number") return st.cards[Math.round(st.medIdx)];
  let best = null, bestDistance = Infinity;
  for (const card of st.cards) {
    const n = numeric(card);
    if (n === null) continue;
    const d = Math.abs(n - st.median);
    if (d < bestDistance || (d === bestDistance && n > numeric(best))) { best = card; bestDistance = d; }
  }
  return best;
}

/** Up to four cards around the median, plus the current pick, in deck order. */
export function finalOptions(st, current) {
  const around = [Math.floor(st.medIdx) - 1, Math.floor(st.medIdx), Math.ceil(st.medIdx), Math.ceil(st.medIdx) + 1].map((i) => st.cards[i]);
  return [...new Set([...around, current].filter(Boolean))].sort((a, b) => st.cards.indexOf(a) - st.cards.indexOf(b));
}
