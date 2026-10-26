/** localStorage wrapper (keys are prefixed with "estimo."; failures fall back to defaults). */
export const storage = {
  get(key, fallback) {
    try { const v = localStorage.getItem("estimo." + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("estimo." + key, JSON.stringify(value)); } catch { /* private mode / quota */ }
  },
};

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

/**
 * The person using this browser. `id` is a secret that never leaves this device except
 * to our own server (which only stores a hash of it); `name` is the nickname.
 */
export const me = {
  id: storage.get("clientId", null) || (() => { const id = uuid(); storage.set("clientId", id); return id; })(),
  get name() { return storage.get("name", ""); },
  set name(value) { storage.set("name", value); },
};
