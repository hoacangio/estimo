/**
 * Voting scales as shown on the home page. Inside a room the server sends the
 * authoritative list (src/decks.js), so this is only for labels and previews.
 */
export const HOME_DECKS = [
  { key: "fibonacci", label: "Fibonacci", preview: "0 1 2 3 5 8 13 21 34 ? ☕" },
  { key: "modified", label: "Modified Fib.", preview: "0 ½ 1 2 3 5 8 13 20 40 100 ? ☕" },
  { key: "scale10", label: "1 – 10", preview: "1 2 3 4 5 6 7 8 9 10 ? ☕" },
  { key: "tshirt", label: "T-shirt", preview: "XS S M L XL XXL ? ☕" },
  { key: "pow2", label: "Powers of 2", preview: "1 2 4 8 16 32 64 ? ☕" },
];
export const DEFAULT_HOME_DECK = "scale10";

/** Cards that are not estimates ("not sure", "need a break"). */
export const META_CARDS = new Set(["?", "☕"]);

export const deckLabel = (key) => HOME_DECKS.find((d) => d.key === key)?.label ?? key;
