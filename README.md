# Estimo

Realtime planning poker for agile teams. Create a room, share the link or QR code, vote, reveal — no sign-up, no install.

Runs entirely on **Cloudflare Workers + Durable Objects** and fits comfortably in the **free plan** for internal use.

## Features

- Rooms by link, short room code (e.g. `TIGER-472`, case-insensitive) or **QR code** (generated in the browser, no external service)
- Voting scales: **Fibonacci**, **Modified Fibonacci**, **1–10**, **T-shirt**, **Powers of 2** (plus `?` and ☕)
- Votes stay hidden on the server until reveal — clients never receive other people's values early
- Results: average, median, range, agreement, distribution, outlier highlight, suggested final estimate
- Ticket history per room with CSV export
- Spectator mode for PO / Scrum Master
- Nickname and a stable client id saved in `localStorage`, so a reload or reconnect keeps your vote
- Keyboard shortcuts `1`–`0`, dark mode
- **One-screen home on phones:** just the form, join box and recent rooms (paged, rows adapt to the screen height)
- **One-screen room:** topic, table and your cards always fit the viewport without scrolling; participants, history and settings live in a sidebar (a slide-in drawer on phones and tablets)
- **Hosts:** whoever creates a room is its host; only the host can delete it — from the room's sidebar or straight from the home page (bottom-sheet confirm, no need to join); everyone in the room is notified and every list refreshes
- **Room limit per host:** 5 by default — the home page checks the count and blocks **Create** at the limit (the server enforces it too). Change `MAX_ROOMS_PER_HOST` in `wrangler.toml` and redeploy
- Recent rooms (last 20, 5 per page): delete the ones you host, or remove others from this device
- **Installable app (PWA):** add to the home screen on Android, iOS and desktop; opens full screen and launches from cache even offline
- **App-like feel:** press feedback on every control (replayed after re-render, so quick taps show it too), card pop, screen transitions (View Transitions), bottom sheets on phones, reveal flip, smooth progress, skeleton loading; all motion respects `prefers-reduced-motion`
- **Brand:** Marigold amber `#F5A524` on warm neutrals; icons are generated from the tokens with `python3 scripts/make-icons.py`
- **Seasonal themes that switch on by themselves:** each exists only from 3 weeks before its day: Women's Day (15 Feb – 8 Mar), Tết (21 days before mùng 1 → mùng 7; Vietnamese dates through 2036 in `public/js/domain/seasons.js`), Halloween (10–31 Oct), Christmas (4–26 Dec). Outside that period they are not applied or offered. A greeting strip and a one-time toast appear; choosing *Default* skips that occasion, and ⚙ Settings has an on/off switch
- **Fun themes** (home → ⚙ Settings, or the room's sidebar), lazy-loaded so the default theme pays nothing (Retro 2007 also via the Konami code ↑↑↓↓←→←→BA)

## Architecture

```
Browser ──HTTPS──▶ Static Assets (edge cache)      public/
        ──WSS────▶ Edge Worker /ws/:room ──▶ Room Durable Object (one per room)
                                                ├─ WebSocket Hibernation API
                                                └─ SQLite storage (state + history)
```

| Path | What it is |
| --- | --- |
| `src/worker.js` | Edge router, REST API, `Room` Durable Object (state, validation, per-socket broadcast) and `HostRegistry` (rooms per host) |
| `src/decks.js` | Single source of truth for voting scales — add a deck here and every client gets it |
| `public/index.html` | Page shell: links the stylesheets and loads `js/main.js` (no build step) |
| `public/css/01-…09-*.css` | Styles, in cascade order: tokens → base → screens → motion → layout → default look |
| `public/themes/*.css` | Fun themes, downloaded only when chosen |
| `public/qr.js` | Dependency-free QR encoder (byte mode, level M, versions 1–10) |
| `scripts/local-server.mjs` | Offline dev server that runs the real `Room` class without wrangler or npm |

### Client code (`public/js`, ES modules)

```
main.js                 entry: new App(#app).start()
App.js                  App class: UI state, routing, server messages, render(), user actions
lib/                    dom helpers (esc, oneShot…), icons, localStorage + identity
domain/                 pure logic, no DOM: room codes, decks, vote statistics, seasons
services/
  RoomConnection.js     WebSocket with reconnect/backoff and heartbeat
  api.js                REST calls (hosted rooms, delete room)
  ThemeManager.js       light/dark + lazy fun themes, per-theme wording
  RecentRooms.js        rooms visited on this device
  InstallPrompt.js      PWA install prompt / iOS tip, service worker registration
ui/                     toast, QR drawing/PNG, CSV export, tap feedback
views/                  functions (app) => HTML: home, room, sidebar, sheets, invite, gate
```

How a user action flows: a view renders `data-act="vote"` → `App` looks up `actions.vote` → updates `app.ui` and/or sends a message through `RoomConnection` → the server's `state` message arrives → `App.render()` redraws with the views.

### REST API

| Endpoint | Body | Result |
| --- | --- | --- |
| `GET /api/health` | — | `{ ok: true }` |
| `POST /api/host/rooms` | `{ id }` | Rooms hosted by this browser and the limit: `{ ok, rooms, max }` |
| `POST /api/rooms/:code/delete` | `{ id }` | Host deletes the room; `403` for anyone else |

`id` is the browser's secret client id, sent in a JSON body (never the URL). Requests must be same-origin and `application/json`.

### WebSocket protocol

Client → server messages (`{ "t": ... }`): `join`, `rename`, `spectator`, `vote`, `reveal`, `reset`, `next`, `topic`, `deck`, `emote`.
Server → client: a full `state` snapshot after each change. `participants[].vote` is only present once `revealed` is `true`; your own vote comes back as `mine`.

## Run locally

```bash
npm install
npx wrangler dev          # real Workers runtime at http://localhost:8787
```

No npm access? The offline server needs only Node 18+:

```bash
node scripts/local-server.mjs   # http://localhost:8787
```

## Deploy (free)

1. Create a free Cloudflare account — no card required.
2. `npx wrangler login`
3. `npx wrangler deploy`

Your app is live at `https://estimo.<your-subdomain>.workers.dev`. Optionally attach a company domain under **Workers → Settings → Domains & Routes**.

### Continuous deployment

`.github/workflows/ci.yml` checks every push and pull request, and deploys `main` when these repository secrets exist:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → template **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right sidebar |

## Free-plan capacity

Durable Objects on the Workers Free plan allow 100,000 requests and 100,000 SQLite rows written per day (incoming WebSocket messages count 20:1). A typical 8-person, 20-ticket session uses about 35 requests and 300 row writes, so roughly 300 sessions a day fit before any limit is reached. See [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing).

## Security testing

```bash
node scripts/local-server.mjs 8787 &
node test/security.test.mjs http://localhost:8787     # 17 protocol-level attack tests (also run in CI)
python3 test/browser_security.py http://localhost:8787 # XSS, CSV injection, clickjacking, CSP
node test/perf/load.mjs http://localhost:8787          # latency, fan-out, concurrent rooms
```

## Privacy & security

- No accounts, no cookies, no tracking. Only the nickname you type is stored.
- Room data lives in your Cloudflare account and is deleted after 30 days without activity.
- Rooms must be created from the home page; visiting an unknown room URL does not create one.
- The room limit is per browser (there are no accounts). For a hard per-person limit, put the app behind Cloudflare Access and key hosts by the Access email.
- Anyone with a room link can join. To restrict access to your company, put the Worker behind **Cloudflare Access** (free up to 50 users).

## Extending

- **New voting scale:** add an entry to `src/decks.js`.
- **New action:** add a `case` in `Room.webSocketMessage` (server), a button with `data-act="myAction"` in a view, and `myAction` in `App.actions` (client).
- **New screen piece:** add a function in `public/js/views/` and call it from the screen's view.
- **REST endpoints:** `/api/*` already routes to the Worker (`run_worker_first` in `wrangler.toml`).

## License

MIT
