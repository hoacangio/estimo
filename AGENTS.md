# AGENTS.md — Estimo handover for AI coding agents

> Audience: AI coding agents (and the engineers supervising them) taking over Estimo inside NAB.
> Read this file completely before changing anything. It is the single source of truth for
> context, conventions, how to verify your work, and the planned migration to AWS.

| | |
| --- | --- |
| Product | **Estimo** — realtime planning poker for agile teams (rooms, voting, reveal, stats, history) |
| Owner | Nguyễn Thái Hòa (Engineering Manager). Prefers replies in Vietnamese for discussion, English in code and docs |
| Repository | `hoacangio/estimo` (GitHub, public, MIT) |
| Current hosting | Cloudflare Workers + Durable Objects (free plan): `https://estimo.hoanguyen333.workers.dev` |
| Why migrate | The NAB network blocks `*.workers.dev`, and work data (ticket keys/titles) should stay inside NAB infrastructure |
| Target | AWS inside NAB (see [§8 AWS migration plan](#8-aws-migration-plan)) |
| Status | Feature-complete v1, production on Cloudflare, CI green |

---

## 1. Ground rules (read first)

1. **No build step.** The client is plain ES modules + CSS served as static files. Do not introduce bundlers, frameworks (React, etc.) or npm runtime dependencies without the owner's approval. The server has zero runtime dependencies too.
2. **Escape every user-provided string** with `esc()` (`public/js/lib/dom.js`) before putting it into an HTML template. Views build HTML strings; there is no framework doing this for you.
3. **Keep the CSP working** (`public/_headers`): no inline scripts, no third-party scripts, `connect-src 'self'`. Only Google Fonts stylesheets/fonts are allowed from outside.
4. **One-screen rule.** The room page and the home page must fit the viewport with no page scroll on phones (390×844, 375×667, 360×640) and desktops. Long content scrolls *inside* `.stage-scroll` or the sidebar. Run the fit tests after any layout change.
5. **The server is the source of truth and the security boundary.** Never send other people's vote values before reveal; never broadcast the secret client id (see §5).
6. **Themes are scoped.** Every rule in `public/themes/<name>.css` starts with `[data-theme="<name>"]` (tokens on `:root[data-theme="<name>"]`). Default-theme-only rules live in `public/css/09-default-look.css`.
7. **No trademarks or logos** in themes or copy. Themes are "inspired by" an era/genre (e.g. *Cinema*, *Mission Control*, *Classic 2000*, *Luna 2001*), never named after a company or product.
8. **No tracking, no cookies, no accounts.** Only the nickname, a random client id and UI preferences are stored, in `localStorage`.
9. **Verify before you claim.** Run the suites in §6. Commit messages explain *why*; keep changes small and focused.

---

## 2. What the product does (user-visible behaviour)

- **Home** (`/`): nickname (saved on device), voting scale (Fibonacci, Modified Fibonacci, 1–10, T-shirt, Powers of 2 — each with `?` and `☕`), *Create a new room*, *Join a room* by code or pasted link, *Recent rooms* (last 20, paged; rows per page adapt so the page never scrolls on phones), install tip (PWA). Header: dark-mode toggle + ⚙ Settings bottom sheet (theme list).
- **Room** (`/r/<code>`): header (logo, room code, Invite, ☰ with participant count) · topic bar (ticket key/title, Skip) · table (everyone's card face-down while voting, flipped on reveal; progress bar; Reveal / Reset) · dock (your cards while voting; final-estimate picker + Re-vote / Save & next after reveal). Sidebar (desktop) / drawer (≤1023 px): Participants, History (CSV export), Settings (voting scale, theme, nickname, spectator, host-only Delete room).
- **Results**: average, median, range, agreement %, distribution, outliers (≥2 cards from the median and at an extreme), suggested final (consensus, else nearest card to the median, ties round up).
- **Invite**: QR code (own encoder, `public/qr.js`), copy link, full-screen QR for meeting-room screens, PNG download.
- **Room codes**: `WORD-123` (40 words × 900 numbers), shown in capitals, stored lowercase, case-insensitive input. Old long codes (`nimble-tiger-99`) still work.
- **Hosts and limits**: the creator is the host. Only the host can delete a room (from the sidebar, or from Home without joining). Max **5 rooms per host** (`MAX_ROOMS_PER_HOST`); Home blocks *Create* at the limit and lists rooms to delete.
- **Rooms expire** after 30 days without activity.
- **Optimistic voting**: your card changes instantly; the server snapshot confirms.
- **Keyboard**: `1`–`9`, `0` (= 10 on the 1–10 scale) to vote; `Esc` closes dialogs/drawer.
- **PWA**: installable, offline shell (network-first service worker), iOS "Add to Home Screen" tip.
- **Themes**: Default (light/dark, brand colour *Marigold* `#F5A524`), fun themes (Retro 2007, Cinema, Samurai, Mission Control, Classic 2000, Luna 2001) and **seasonal themes that switch on automatically** only during their window — Women's Day (15 Feb–8 Mar), Tết (21 days before mùng 1 → mùng 7; table through 2036), Programmers' Day (3 weeks before day 256), Halloween (10–31 Oct), Christmas (4–26 Dec). Choosing *Default* during an occasion skips that occasion. There is intentionally **no on/off switch** for seasonal themes.
- **Motion** (not in Retro 2007, off with `prefers-reduced-motion`): press feedback on every control (replayed after re-render so quick taps show it), card pop, reveal flip, View Transitions between screens, bottom sheets/drawer slides, skeleton loading.
- Easter eggs: Konami code or 7 clicks on the Home logo → Retro 2007.

---

## 3. Repository map

```
src/worker.js            Edge entry + REST API (handleApi) + Room Durable Object + HostRegistry Durable Object
src/decks.js             Voting scales (single source of truth; the client receives them from the server)
wrangler.toml            Cloudflare config (assets, DO bindings/migrations, MAX_ROOMS_PER_HOST)
public/index.html        Page shell: CSS links in cascade order, boot.js, module entry
public/_headers          Security headers (CSP, HSTS, …) — Cloudflare format
public/sw.js             Service worker (network-first, precache list must match public/js + public/css)
public/manifest.webmanifest, public/icons/   PWA metadata and icons (regenerate: python3 scripts/make-icons.py)
public/qr.js             Dependency-free QR encoder (byte mode, level M, v1–10)
public/css/01…09-*.css   Styles, in cascade order: tokens → base → home → room → dialogs → phone → motion → room layout → default look
public/themes/*.css      Lazy-loaded themes (fun + seasonal)
public/js/
  main.js                new App(#app).start()
  boot.js                Classic script: applies the last active theme before first paint
  App.js                 App class: UI state (this.ui), routing, server messages, render(), action maps
  lib/                   dom.js (esc, oneShot, addStylesheet…), icons.js, storage.js (localStorage + `me` identity)
  domain/                Pure logic: roomCode.js, decks.js, stats.js, seasons.js
  services/              RoomConnection (WebSocket + backoff + heartbeat), api.js (REST), ThemeManager,
                         RecentRooms, InstallPrompt (+ service worker registration)
  ui/                    toast, qr (draw/PNG), csv export, TapFeedback
  views/                 (app) => HTML string: home, room, sidebar, sheets, invite, gate, common
scripts/local-server.mjs Offline dev server: runs the REAL Room/HostRegistry classes on Node with an
                         in-memory emulation of the Durable Object runtime (no npm, no wrangler)
scripts/make-icons.py    PWA icons from brand tokens (Pillow)
test/security.test.mjs   21 protocol-level security tests (also in CI)
test/browser_security.py 5 browser tests (XSS, CSV injection, clickjacking, CSP)
test/perf/               load.mjs (latency, fan-out, concurrent rooms), client_perf.py
test/ui/                 Playwright UI regression suite (run_all.sh) + bots.mjs (seats extra voters)
.github/workflows/ci.yml check (syntax, smoke, security) → deploy (wrangler-action, wrangler v4)
```

**How a user action flows (client):** a view renders `data-act="vote"` → `App.#onClick` looks up `App.actions.vote(el)` (selects/checkboxes → `App.changes`, forms → `App.forms`) → updates `app.ui` and/or `RoomConnection.send()` → the server's `state` message → `App.render()` re-renders the current screen from the views. To add an action: add the server `case` (if needed), a `data-act` in a view, and a method in `App.actions`.

**Animation continuity:** re-renders replace DOM (innerHTML). One-shot animations use `oneShot(startedAt, ms, cls)` (negative `animation-delay`); looping theme animations use `animation-delay: var(--clock)`. Keep these patterns or animations will restart on every server update.

---

## 4. Protocol

### WebSocket `/ws/:room` (one JSON object per message)

Client → server (`{ "t": … }`): `join {id, name, spectator, create}`, `rename {name}`, `spectator {on}`, `vote {v}` (same value again = withdraw), `reveal`, `reset`, `next {topic, final}`, `topic {text}`, `deck {deck}`, `clearHistory`, `emote {e}`, `deleteRoom` (host only). Plain-text `ping` → `pong` heartbeat every 15 s.

Server → client:
- `state` — full snapshot after every change: `topic, deck, revealed, host (pid), maxRooms, participants[{id: pid, name, spectator, voted, vote?}], you (your pid), mine (your vote)`; `decks` and `history` only on first sync or when changed (the client merges). `participants[].vote` is present **only after reveal**.
- `error {code}` — `not_found`, `room_limit {max, rooms}`, `exists`, `forbidden`.
- `deleted {reason: "deleted" | "expired"}`.

Close codes 4000–4099 are final (client does not reconnect): `4000` deleted/expired, `4003` room limit, `4004` not found, `4009` code taken by another host (client retries create with a new code). `1008` = rate limit.

### REST

| Endpoint | Body | Result |
| --- | --- | --- |
| `GET /api/health` | — | `{ ok: true }` |
| `POST /api/host/rooms` | `{ id }` | `{ ok, rooms: string[], max }` for this browser |
| `POST /api/rooms/:code/delete` | `{ id }` | `200 {ok}` host only; `403` otherwise |

Rules: same-origin only (`Origin` check), `Content-Type: application/json` (415 otherwise), body ≤ 200 chars (413), `id` must be a UUID.

---

## 5. Security model (keep these properties in any port)

- **Identity**: each browser generates a secret UUID `clientId` (localStorage). It is sent only to our server. Broadcast id = `pid = SHA-256(roomSalt + ":" + clientId)` (first 8 bytes, per room). Host key = `SHA-256("host:" + clientId)` (never broadcast). Knowing someone's `pid` does not let you act as them.
- **Vote secrecy**: per-socket views; values hidden until reveal; `mine` only for the owner.
- **Explicit creation**: unknown room + `create !== true` → `not_found`; create on an existing room owned by another host → `exists` (no silent join).
- **Input validation**: room `^[a-z0-9-]{3,40}$`; names/topics stripped of control chars and length-capped; deck/card values whitelisted; own-property checks (`Object.hasOwn`) so `__proto__`/`constructor` never resolve; messages ≤ 2,000 chars; history ≤ 30 entries.
- **Abuse limits**: token bucket per socket (burst 20, 5/s, close 1008 after 40 drops); ≤ 100 sockets per room (429); Origin check on WebSocket upgrade and API (CSWSH/CSRF).
- **Browser**: strict CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS; CSV export escapes formula prefixes (`= + - @`).
- Run `test/security.test.mjs` (21 tests) against any new environment before go-live.

---

## 6. Run and verify

```bash
node scripts/local-server.mjs 8799 &                 # offline dev server (Node 18+; 22 recommended)
node test/security.test.mjs http://localhost:8799     # expect 21/21
python3 test/browser_security.py http://localhost:8799 # expect 5/5
node test/perf/load.mjs http://localhost:8799 --quick  # latency / fan-out
ESTIMO_URL=http://localhost:8799 test/ui/run_all.sh   # UI regression (Playwright for Python + Chromium)
```

UI suite coverage: end-to-end flow (create, join, QR decode, vote, reveal, stats, history, reconnect), one-screen fit for every theme and screen size, recent-rooms paging, room deletion + limit, card sizes with 4/13/21 voters, seasonal date windows (uses Playwright clock), tap feedback/transitions, press and pop animations. Screenshots go to `test/ui/shots/` (git-ignored).

Notes: tests that use the real date may see the current seasonal theme (e.g. Halloween in late October) — that is expected. `test/security.test.mjs` can flake once right after a heavy UI run; re-run before investigating.

CI (`.github/workflows/ci.yml`): syntax check of every module, smoke test on the offline server, security suite; deploy job runs only on `main` with Cloudflare secrets present.

---

## 7. Product decisions (do not undo without asking the owner)

- Plain, practical default look; avoid "AI-generated" styling (no serif display font, no big soft shadows, no pill-everything, no promotional copy like "no app needed").
- Brand: Marigold `#F5A524` on warm neutrals; dark text on the amber (`--on-accent`).
- Room code font = normal UI font (not monospace), shown in capitals.
- No network/latency indicator; only a banner when the connection drops.
- Seasonal themes: automatic, no switch; only offered within their window.
- App-like motion stays (press feedback, transitions, card pop); the "card dealt onto the table" animation is intentionally off.
- Theme copy may change wording per theme (`THEME_COPY` in `ThemeManager.js`) but never meaning. Retro 2007 uses 2007-era Vietnamese copy.

---

## 8. AWS migration plan

### 8.1 Goal and constraints

Run Estimo on NAB's AWS so it is reachable on the NAB network, data stays inside NAB, and it can sit behind NAB SSO. The client is **already host-agnostic** (same-origin `/ws/*` and `/api/*`), so only the server runtime and hosting change. The URL paths, protocol and security properties in §4–§5 must stay identical; `test/security.test.mjs` is the acceptance test.

### 8.2 Cloudflare → AWS mapping

| Today (Cloudflare) | AWS option A — container (recommended first) | AWS option B — serverless |
| --- | --- | --- |
| Static assets + `_headers` | Same Node service serves `public/` with the headers, or S3 + CloudFront (response headers policy) | S3 + CloudFront |
| Worker router `/ws`, `/api` | Node HTTP server (port the `fetch` handler / `handleApi`) | API Gateway WebSocket API + HTTP API → Lambda |
| `Room` Durable Object (one actor per room, in-memory sockets, serialized events) | In-process room actors — reuse the `Room` class via a Node runtime adapter (as in `scripts/local-server.mjs`) | Lambda per message; room state in DynamoDB with conditional writes; fan-out with `postToConnection` per socket |
| DO storage (SQLite) + 30-day alarm | DynamoDB table `rooms` (pk = room, TTL attribute) or SQLite on EFS | DynamoDB `rooms` (TTL) + `connections` table |
| `HostRegistry` DO | DynamoDB `hosts` (pk = hostKey, room set; conditional add for the limit) | same |
| WebSocket Hibernation / auto ping-pong | Plain `ws`-style server; keep `ping`/`pong` | API GW handles idle; 10 min idle / 2 h max connection — client reconnect already exists |
| `MAX_ROOMS_PER_HOST` var | Env var / SSM Parameter | Env var / SSM |
| wrangler-action deploy | GitHub Actions/NAB pipeline → ECR → ECS (Terraform) | SAM/CDK/Terraform |

**Recommendation:** start with **Option A, one ECS Fargate task** (or App Runner / NAB EKS) behind an **internal ALB**. A single instance comfortably serves internal usage (hundreds of rooms) and keeps the actor model, so almost no logic changes. Scale-out later (§8.5) only if needed.

### 8.3 Code changes for Option A

1. **Extract a runtime adapter.** `Room`/`HostRegistry` use a small part of the Durable Object API: `ctx.storage.get/put/deleteAll/setAlarm`, `ctx.getWebSockets()`, `ctx.acceptWebSocket(ws)`, `ws.serializeAttachment/deserializeAttachment`, `ctx.blockConcurrencyWhile`, `ctx.id`, `env.HOSTS.get(idFromName(key)).reserve/release/list`. `scripts/local-server.mjs` already emulates all of this in memory — promote it to `src/node/runtime.js` with:
   - a persistent storage backend (DynamoDB or SQLite file) instead of the in-memory `Map`;
   - alarms via a timer + a startup sweep (or DynamoDB TTL + lazy expiry on load);
   - one promise-chained queue per room so events stay serialized (the dev server already does this).
2. **Split `src/worker.js`** into `src/room.js`, `src/hostRegistry.js`, `src/api.js` (pure, runtime-agnostic) + `src/cloudflare.js` (Worker entry) + `src/node/server.js` (HTTP + WebSocket upgrade + static files + `_headers` parsing). Keep Cloudflare deployable during the transition.
3. **WebSocket server**: implement RFC 6455 framing as in the dev server, or add `ws` as the only dependency (needs approval per §1).
4. **Health/readiness** endpoints for the ALB (`/api/health` exists).
5. **Fonts**: if NAB blocks Google Fonts, self-host the font files under `public/fonts/` and tighten the CSP to `'self'`.
6. **Dockerfile** (Node 22 alpine, non-root user, `node src/node/server.js`), `.dockerignore`.

### 8.4 Infrastructure (Terraform)

- ECR repository; ECS cluster + Fargate service (desired count 1, min healthy 0 / max 100 % so deploys don't run two room hosts at once — or use the scale-out design first).
- **Internal ALB** (NAB network only): HTTPS listener (ACM cert for an internal hostname, e.g. `estimo.<internal-domain>`), target group health check `/api/health`, **idle timeout ≥ 120 s** (client pings every 15 s), WebSockets work through ALB natively.
- **SSO (optional, recommended)**: ALB `authenticate-oidc` action with NAB's IdP (Entra ID/Okta). Then the host identity could become the SSO subject instead of the browser secret (per-person room limits; see README "Privacy & security").
- DynamoDB tables `rooms` (TTL), `hosts`; IAM task role limited to those tables; KMS encryption at rest.
- CloudWatch logs/metrics/alarms (task health, 5xx, WebSocket connection count); AWS WAF on the ALB if required by policy.
- Secrets/params in SSM (`MAX_ROOMS_PER_HOST`).

### 8.5 Scaling beyond one task (later)

Rooms are stateful actors, so multiple tasks need either **room affinity** (route all sockets of a room to the same task — e.g. a lightweight router that hashes the room code to a task, or ECS service discovery + consistent hashing) or **shared state + pub/sub** (ElastiCache Redis: room state, presence with heartbeat TTL, a channel per room; each task re-renders per-socket views on every published change; atomic updates via Lua). Option B (API Gateway + Lambda + DynamoDB) is the fully managed alternative but is a rewrite of the broadcast path.

### 8.6 Migration steps (checklist)

1. Confirm with NAB: AWS account/landing zone, internal domain + certificate, IdP for SSO, data classification for ticket titles, log retention, approved base images, CI/CD platform.
2. Refactor server into runtime-agnostic modules + Node runtime (§8.3); keep Cloudflare build green.
3. Add Dockerfile; run locally; run `test/security.test.mjs`, `test/browser_security.py`, `test/ui/run_all.sh`, `test/perf/load.mjs` against the container.
4. Terraform the stack (§8.4) in a dev account; deploy; repeat the suites against the internal URL.
5. Pilot with one or two squads; watch metrics; then announce the internal URL.
6. Rooms on Cloudflare are not migrated (they expire after 30 days anyway). Optionally keep the Cloudflare deployment for users outside NAB, or switch it off.

### 8.7 Risks and open questions

- Single task = brief downtime on deploy (clients auto-reconnect; votes in progress may be lost unless state is persisted on every change — it is, via storage `put`).
- Corporate proxies may strip WebSocket upgrades on some networks — test from a NAB laptop early.
- If SSO is added, decide whether the room limit becomes per person (recommended) and whether names come from the IdP.
- Seasonal Tết dates are a table through 2036 (`public/js/domain/seasons.js`); extend before then.

---

## 9. Known gaps / backlog

- UI tests run on Chromium only (Firefox/WebKit engines were not available in the build sandbox). CSS avoids features with weak support (no container queries, no `aspect-ratio` for card sizes), but a cross-browser pass on real Safari/Firefox is still to do.
- `test/ui` scripts are pragmatic Playwright scripts, not a test framework; consider moving them to `pytest` with assertions.
- Recent rooms live per browser; there is no server-side "my rooms" view except for hosted rooms.
- No i18n beyond theme copy; UI language is English.

## 10. Conventions

- Commit messages: imperative subject, body explains why; small focused commits on `main` (CI deploys `main`).
- Code style: 2-space indent, double quotes, semicolons, `const` by default, small pure functions in `domain/`, classes for stateful services, views as functions returning HTML strings with a short header comment per file.
- Bump the service-worker cache name (`CACHE` in `public/sw.js`) and update its precache list whenever files under `public/js` or `public/css` are added/renamed.
