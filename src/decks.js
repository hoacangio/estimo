// Single source of truth for voting scales.
// Add a new deck here and it shows up in every client automatically.
export const DECKS = {
  fibonacci: {
    label: "Fibonacci",
    cards: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "?", "☕"],
  },
  modified: {
    label: "Modified Fibonacci",
    cards: ["0", "½", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"],
  },
  scale10: {
    label: "Scale 1 – 10",
    cards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?", "☕"],
  },
  tshirt: {
    label: "T-shirt",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?", "☕"],
  },
  pow2: {
    label: "Powers of 2",
    cards: ["1", "2", "4", "8", "16", "32", "64", "?", "☕"],
  },
};

export const DEFAULT_DECK = "fibonacci";
