/**
 * One realtime connection to a room (WebSocket), with automatic reconnects.
 *
 * Messages from the server are delivered through callbacks:
 *   onOpen()             socket open; the caller sends "join"
 *   onMessage(msg)       parsed JSON message ({ t: "state" | "error" | "deleted", ... })
 *   onStatus(connected)  connection went up or down
 * Close codes 4000–4099 are final (room deleted, not found, limit…): no reconnect.
 */
const OPEN = 1; // WebSocket.OPEN (readyState values: 0 connecting, 1 open, 2 closing, 3 closed)
const PING_EVERY_MS = 15000;
const MAX_BACKOFF_MS = 8000;

export class RoomConnection {
  constructor({ onOpen, onMessage, onStatus }) {
    Object.assign(this, { onOpen, onMessage, onStatus });
    this.socket = null;
    this.room = null;      // room we want to be connected to
    this.retries = 0;
    this.retryTimer = null;
    this.pingTimer = null;
  }

  get isOpen() { return this.socket?.readyState === OPEN; }
  /** True while a socket exists that is connecting or open. */
  get isActive() { return !!this.socket && this.socket.readyState <= OPEN; }

  connect(room) {
    if (this.isActive && this.room === room) return;
    if (this.room !== room) this.disconnect();
    clearTimeout(this.retryTimer);
    this.room = room;

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/ws/${encodeURIComponent(room)}`);
    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
      this.#startPing(socket);
      this.onStatus?.(true);
      this.onOpen?.();
    };
    socket.onmessage = (event) => {
      if (event.data === "pong") return; // heartbeat answered by the server runtime
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      this.onMessage?.(msg);
    };
    socket.onclose = (event) => {
      if (socket !== this.socket) return; // an old socket we already replaced
      clearInterval(this.pingTimer);
      const final = event.code >= 4000 && event.code < 4100;
      if (final) this.socket = null;
      else this.#scheduleReconnect();
      this.onStatus?.(false);
    };
  }

  /** Reconnect right away (back online, tab visible again) instead of waiting for the backoff. */
  reconnectNow() {
    if (!this.room || this.isActive) return;
    this.retries = 0;
    this.connect(this.room);
  }

  disconnect() {
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const socket = this.socket;
    this.socket = null;
    this.room = null;
    if (socket) { try { socket.close(1000); } catch { /* already closed */ } }
  }

  send(message) {
    if (this.isOpen) this.socket.send(JSON.stringify(message));
  }

  #startPing(socket) {
    clearInterval(this.pingTimer);
    const ping = () => { if (socket.readyState === OPEN) socket.send("ping"); };
    this.pingTimer = setInterval(ping, PING_EVERY_MS);
    ping();
  }

  #scheduleReconnect() {
    const room = this.room;
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => { if (this.room === room) this.connect(room); }, delay);
  }
}
