/** Room codes: short and easy to read out (TIGER-472). Shown in capitals, stored lowercase. */

const WORDS = ["otter", "falcon", "panda", "tiger", "koala", "heron", "lotus", "maple", "comet", "river",
  "cedar", "finch", "lynx", "orca", "yak", "bison", "cobra", "eagle", "gecko", "hawk", "ibis", "lemur",
  "llama", "moose", "newt", "owl", "puma", "raven", "robin", "seal", "shark", "swan", "tapir", "viper",
  "wolf", "zebra", "delta", "pixel", "rocket", "mango"];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const newRoomCode = () => `${pick(WORDS)}-${100 + Math.floor(Math.random() * 900)}`;

/** Accept a code or a pasted room link, in any case, and return the canonical code. */
export const normalizeCode = (input) => String(input || "").trim().toLowerCase()
  .replace(/^.*\/r\//, "")
  .replace(/[^a-z0-9-]/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "");

/** Same rule as the server (src/worker.js ROOM_RE). */
export const isValidCode = (code) => /^[a-z0-9-]{3,40}$/.test(code);
