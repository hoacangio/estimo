# Estimo

Realtime planning poker for agile teams. Create a room, share the link or QR code, vote, reveal — no sign-up, no install.

Runs entirely on **Cloudflare Workers + Durable Objects** and fits comfortably in the **free plan** for internal use.

## Features

- Rooms by link, room code or **QR code** (generated in the browser, no external service)
- Voting scales: **Fibonacci**, **Modified Fibonacci**, **1–10**, **T-shirt**, **Powers of 2** (plus `?` and ☕)
- Votes stay hidden on the server until reveal — clients never receive other people's values early
- Results: average, median, range, agreement, distribution, outlier highlight, suggested final estimate
- Ticket history per room with CSV export
- Spectator mode for PO / Scrum Master
- Nickname and a stable client id saved in `localStorage`, so a reload or reconnect keeps your vote
- Keyboard shortcuts `1`–`0`, dark mode, mobile layout
- **Hosts:** whoever creates a room is its host; only the host can delete it (everyone in the room is notified)
- **Room limit per host:** 5 by default — change `MAX_ROOMS_PER_HOST` in `wrangler.toml` and redeploy
- **Installable app (PWA):** add to the home screen on Android, iOS and desktop; opens full screen and launches from cache even offline
- **Fun themes**, lazy-loaded so the default theme pays nothing (Retro 2007 also via the Konami code ↑↑↓↓←→←→BA)

## Architecture

```
Browser ──HTTPS──▶ Static Assets (edge cache)      public/
        ──WSS────▶ Edge Worker /ws/:room ──▶ Room Durable Object (one per room)
                                                ├─ WebSocket Hibernation API
                                                └─ SQLite storage (state + history)
```

| Path | What it is |
| --- | --- |
| `src/worker.js` | Edge router + `Room` Durable Object (state, validation, per-socket broadcast) |
| `HostRegistry` (in `src/worker.js`) | One Durable Object per host, counts the rooms a host owns |
| `src/decks.js` | Single source of truth for voting scales — add a deck here and every client gets it |
| `public/index.html` | The whole UI: vanilla JS, no build step |
| `public/qr.js` | Dependency-free QR encoder (byte mode, level M, versions 1–10) |
| `scripts/local-server.mjs` | Offline dev server that runs the real `Room` class without wrangler or npm |

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
- **New action:** add a `case` in `Room.webSocketMessage` and a handler in `public/index.html`.
- **REST endpoints:** `/api/*` already routes to the Worker (`run_worker_first` in `wrangler.toml`).

## License

MIT
