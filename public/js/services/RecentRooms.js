/** Rooms this browser has visited, newest first (kept in localStorage). */
import { storage } from "../lib/storage.js";

const KEY = "recentRooms";
const MAX = 20;

export class RecentRooms {
  /** @returns {{code: string, deck: string, host: boolean, at: number}[]} */
  all() { return storage.get(KEY, []); }

  find(code) { return this.all().find((r) => r.code === code); }

  has(code) { return !!this.find(code); }

  /** Move a room to the top, keeping what we already knew about it. */
  remember(code, { deck, host } = {}) {
    if (!code) return;
    const old = this.find(code);
    const rest = this.all().filter((r) => r.code !== code);
    const entry = { code, deck: deck || old?.deck || "", host: host ?? old?.host ?? false, at: Date.now() };
    storage.set(KEY, [entry, ...rest].slice(0, MAX));
  }

  forget(code) { storage.set(KEY, this.all().filter((r) => r.code !== code)); }
}
