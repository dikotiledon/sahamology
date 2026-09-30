# Sahamology — Self-Hosted Deployment Runbook

This guide covers deploying Sahamology without Netlify or Supabase on four
topologies: **localhost**, **home/office LAN**, **reverse proxy**, and
**public IP / VPS**. The stack is Next.js (standalone output) + PostgreSQL 16 +
Redis 7 with BullMQ workers embedded in the Next.js server process.

---

## Phase 6 hardening

Phase 6 ships process health, weekday holiday no-ops, and fail-closed Stockbit
deadlines. Phase 4 remains capture-complete, not ship-complete. No gate is
armed. Docker `HEALTHCHECK` is live-only (`CMD node scripts/health-probe.mjs`
→ `GET /api/health?level=live`, exit polarity `r.ok`). Compose `app.restart`
is `unless-stopped`; a migrate failure on first boot can loop until the
image is healthy (`State.Health`). Probe live, then ops, from inside the
container:

```
curl -sS http://127.0.0.1:3000/api/health?level=live
curl -sS http://127.0.0.1:3000/api/health?level=ops
```

`STOCKBIT_TIMEOUT_MS` defaults to 15000. Do not set `SAHAMOLOGY_FAULT*` in
compose. Weekday IDX holidays skip the daily job before Stockbit and still
show Thursday's ranked desk on the holiday morning card.

## Phase 5 ranked desk

Phase 5 ships the ranked desk (`/desk`), the morning card, and auto-filled
journal outcomes. **Phase 4 remains capture-complete, not ship-complete.**
`SHIP_GATE=VERDICT_UNREACHABLE` still stands. No playbook profile is armed.
The desk reads stored `decision_journal` rows and never re-evaluates Adi
target math or G0–G7. AVOID rows are hidden by default; turn on
`Tampilkan AVOID` to show them. TAKE_PROFIT stays visible.

Score ENTER outcomes after five complete forward sessions exist:

```
npm run backfill:outcomes -- --dry-run
npm run backfill:outcomes
```

Unscored rows stay SQL NULL. Re-runs are gated on `outcome IS NULL`.
`WATCHLIST_FALLBACK_EMITENS` still applies when the Stockbit watchlist has
no IDX ticker (USDIDR is skipped as `non-idx`).

---

## 1. Architecture

```
Browser / Chrome extension
        │
        ▼
 Next.js server  (PM2 or Docker container)
   ├── app/** API routes (unchanged)
   ├── proxy.ts middleware (cookie auth + CRON_SECRET)
   ├── instrumentation.ts → embedded BullMQ workers
   │     ├── watchlist-analysis  (daily 11:00 UTC cron)
   │     ├── story-analysis
   │     └── price-history-backfill (concurrency 1, manual trigger)
   ├── lib/db.ts → PostgreSQL via `pg` (DATABASE_URL)
   └── lib/queue.ts → Redis via `ioredis` (REDIS_URL)
```

### Environment variables

| Variable | Required | Example |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://sahamology:pass@localhost:5432/sahamology` |
| `REDIS_URL` | yes | `redis://localhost:6379` |
| `APP_BASE_URL` | yes | `http://192.168.1.4:3000` |
| `INTERNAL_API_URL` | no | `http://127.0.0.1:3000` |
| `CRON_SECRET` | yes | shared Bearer secret for cron triggers |
| `AUTH_SECRET` | yes | HMAC secret for session cookies |
| `STOCKBIT_JWT_TOKEN` | no | manual fallback token |
| `GEMINI_API_KEY` | no | Gemini story generation |
| `LLM_PROVIDER` | no | `gemini` or `openai` |

Copy `.env.example` → `.env` and fill values for your topology.

---

## 2. Common verification commands

```bash
npm run typecheck     # tsc --noEmit
npm test              # full lib/**/*.test.ts suite (160 tests on phase-1-tape-filter)
npm run lint          # eslint flat config
npm run migrate       # apply supabase/*.sql via DATABASE_URL
npm run backfill:history -- --start 2020-01-02 --symbols BBRI,TLKM   # populate price_history (CLI fallback)
npm run baseline:backtest -- --horizon 5                              # Adi-only expectancy baseline
npm run walkforward:g4                                               # Phase 1 vs Phase 0 card, purged 80/20 OOS
npm run walkforward:p2                                               # Phase 2 vs Phase 1 card, 7-condition ship gate
```

### Continuous integration

`.github/workflows/ci.yml` runs `npm run typecheck`, `npm test`, `npm run lint`,
`npm run migrate`, and `npm run build` on every push and pull request (Postgres
16 service container). The workflow file is committed; **a green run on GitHub
is not claimed in this documentation.**

### Enqueue price-history backfill (HTTP, session-gated)

The BullMQ route is not in `PUBLIC_PATHS`, so it requires the same session
cookie as the rest of the UI (login first, then use the cookie jar):

```bash
# queued — requires a valid session cookie (open the app and sign in)
curl -X POST http://localhost:3000/api/price-history/backfill \
  -H 'Content-Type: application/json' \
  -d '{}'
# optional body: {"fromDate":"2019-01-01","toDate":"2026-01-01","symbols":["BBRI","TLKM"]}
```

The CLI `npm run backfill:history -- --start 2019-01-01 --symbols BBRI,TLKM`
remains as a no-session fallback.

### AUTH_SECRET in development

`AUTH_SECRET=dev-secret` is accepted only in development (`NODE_ENV !==
'production'`). Production fails fast on that value — the `WEAK_SECRETS`
deny-list includes `dev-secret` — so a production compose with the dev example
value will refuse to start.

The three data CLI scripts (`backfill:history`, `baseline:backtest`,
`walkforward:g4`) require a reachable `DATABASE_URL` and a valid Stockbit JWT
(`STOCKBIT_JWT_TOKEN`). The baseline script only makes sense after at least one
watchlist analysis has run and price history has been backfilled.

`walkforward:p2` is a reporter, not a CI gate: it always prints a verdict on
its last line and `npm test` never greps it. If the database is unreachable it
exits 1 and prints **no** `SHIP_GATE` token at all — an environment error is not
a verdict.

### Phase 4 macro regime notes

Phase 4 adds **G7**, a macro-regime hold. **It ships default-off, unvalidated,
and — as of this release — incapable of firing.** `PLAYBOOK_G7_PROFILE` is
`off` by default; `visible` reports a CAUTION without touching the stance, and
`veto` is the only profile that may act. An unset or unrecognised value
degrades to `off`.

**The honest sample reality, stated first:** the empirical study that defines
G7's thresholds ran against 2,243 captured macro bars and 13 successful signals
across 3 dates, and **every clause fell below the 30-observation floor**. So
`npm run macro:correlation` publishes the z-score distribution, refuses to
publish a threshold, and prints `ARMED_CLAUSES=0/3`. `npm run walkforward:p4`
consequently reports `SHIP_GATE=VERDICT_UNREACHABLE`, not `FAIL`. Treat G7 as
instrumentation that is honestly reporting "not measured yet", not as a feature
that works. Do not arm `veto` on the expectation that it is conservative — it
is currently inert, and it will stop being inert the moment a bound is measured,
which is exactly when you should re-read this paragraph.

- **An unarmed clause cannot fire.** This is the load-bearing property. Bounds
  are `null` until the study measures them, so a half-measured phase reports
  `NOT_EVALUATED` rather than defaulting to something like "2 sigma" that would
  arm all three clauses on nothing.
- **G7 is one notch, and the ordering enforces it.** A CAUTION downgrades
  `ENTER` to `WAIT`. It never creates an `ENTER`, never softens a `WAIT`, and
  never reaches `AVOID`. The armed branch is the final `else if` in the stance
  ladder, which is what makes this structural; `scripts/check-g7-single-notch.mjs`
  fails the build if that ordering is changed.
- **Missing data fails open.** No snapshot, too few bars, a failed capture, or
  an unknown sector all yield `NOT_EVALUATED` and G7 passes — the same reasoning
  as G5, and the opposite of G4. A vendor outage must not delete valid trades.
  In a walk-forward the same absence makes the row *unscored* rather than
  scored as neutral, because macro state is what selects for adverse days and
  dropping unscored rows would bias the comparison in the flattering direction.
- **USD/IDR is a JISDOR proxy, not JISDOR.** The series is Stockbit's market
  spot rate for US Dollar / Rupiah. Bank Indonesia's JISDOR is a volume-weighted
  interbank benchmark computed at end of day and is published under no ticker on
  this feed. The system names the leg `USDIDR` and never claims it is JISDOR.
- **`macro_incomplete` is its own flag.** It is independent of
  `capture_incomplete` (micro) and `fundamentals_incomplete` (G5): the three
  captures fail separately, and conflating them would silently drop signals from
  the Phase 4 denominator for an unrelated reason.
- **Migrations 026/027.** `macro_snapshot` holds raw bars and no computed
  verdict, so a future recalibration re-scores history without a backfill.
  `stock_queries.macro_incomplete` is a nullable boolean; migration 027 contains
  no `UPDATE` against existing rows.
- **The reporter never fetches macro data.** It reads only stored bars at or
  before the signal date. A replay that re-fetched today's macro history would
  grade a past decision with present-day prices.

### Phase 3 fundamental veto notes

Phase 3 adds **G5**, a fundamental health veto. **It ships default-off and
unvalidated.** `PLAYBOOK_G5_PROFILE` is `off` by default; set it to `visible`
to see the score without arming the veto, or `veto` to arm it. An unset or
unrecognised value degrades to `off`, so a typo in the deployment can never arm
a veto by accident.

**The honest sample reality:** the first ~14 months of `stock_queries` rows
have no fundamental columns, and the OOS signal sample G5 needs is still
growing from zero. `npm run walkforward:p3` therefore reports
`SHIP_GATE=VERDICT_UNREACHABLE`, not `FAIL` — the gate is not adjudicable yet.
Do not read that as encouragement any more than you would read `FAIL`.

- **Financial issuers are excluded, and that matters more than the thresholds.**
  A bank with liabilities/equity of 5.14 (BBCA) or 13.52 (BBTN) is healthy, not
  distressed; deposit liabilities are its business model. G5 detects a
  financial issuer by the presence of a bank-exclusive regulatory metric
  (NPL, capital adequacy, loan-to-deposit, NIM) and skips the non-bank solvency
  tests for it. Half the live watchlist is banks, so skipping this does not
  refine the rubric — it is the difference between a working gate and one that
  discards half its own candidates by construction.
- **Missing data fails open.** No snapshot, an undated snapshot, or a failed
  capture all yield `NOT_EVALUATED`, and G5 passes. This is deliberate: a
  vendor outage must not block a technically valid setup. The trade-off is that
  a broken capture is invisible in the verdict, which is why such signals stay
  *unscored* for the Phase 3 comparison rather than being scored as healthy.
- **`fundamentals_incomplete` is not `capture_incomplete`.** They are separate
  columns because the captures fail independently. `tsx
  scripts/repair-captures.ts --fundamentals` refetches only KeyStats and never
  touches the micro columns or the stance; `--micro` is the Phase 2 repair.
- **Point-in-time is the capture date, because the feed has no other.** The
  KeyStats endpoint returns a current flat snapshot with no fiscal period and
  no publication timestamp, so the only thing that makes a reading provably
  knowable at decision time is when it was captured. Replay reads the persisted
  snapshot and never re-fetches, since re-fetching would grade a past decision
  with present-day data.

### Phase 2 persistence & micro notes

Phase 2 deepens **G1** with three micro inputs — acc/dist, same-bandar
persistence, and single-broker flow. **It ships default-off.**
`PLAYBOOK_G1_PROFILE` defaults to `phase-1`, so a live install behaves exactly
as it did in Phase 1 until the ship gate passes. Set
`PLAYBOOK_G1_PROFILE=phase-2` only for parallel backtests, or to flip live
after the gate clears.

- **Capture is the real work.** Stockbit publishes no historical acc/dist or
  broker-flow data, so the first ~14 months of `stock_queries` rows simply have
  no micro columns. The daily watchlist job fills them from the `marketdetectors`
  response it already fetched (zero extra HTTP calls, so the 4/s limiter is
  untouched) plus one broker-flow call for the top accumulator.
- **Degraded captures are repairable.** A 429 or timeout writes
  `capture_incomplete = true` instead of a silent `null`, and
  `tsx scripts/repair-captures.ts` refetches only the missing micro data —
  never re-prices, never re-decides the stance. Such rows stay unscored for the
  Phase 2 comparison until repaired, so a transient network fault does not
  permanently poison a signal.
- **The three coverage rates share one denominator.** `E` is the OOS eligible
  signal set, fixed *before* any gate runs, so coverage cannot be flattered by
  a denominator chosen after seeing the result.
- **`SHIP_GATE=VERDICT_UNREACHABLE` is a normal, expected result.** The ship
  gate needs ≥30 OOS Phase 2 ENTERs *and* ≥50 OOS Phase 1 ENTERs (the 0.60
  no-collapse guard forces the baseline to clear `30 / 0.60 = 50`). At 8
  emitens that is roughly 300 unique eligible dates, about 14 months. Until
  then the reporter says it cannot judge — it never reports `FAIL` for a sample
  it is not yet large enough to measure.

### Phase 1 tape filter notes

- **Backfill chunking**: `backfill:history` and the BullMQ
  `price-history-backfill` worker split any multi-year range into ≤365-day
  windows before calling Stockbit. `--start` means what it says — it is no
  longer silently clamped.
- **21-bar floor**: the G4 tape filter needs ≥21 completed `price_history`
  sessions for an emiten. Fewer → G4 fails closed as `WAIT` (`Tape tidak cukup`).
- **G3 stop**: when tape ATR is available the invalidation is
  `rataRataBandar − 1.0×ATR` tick-rounded toward entry on IDX fraksi; otherwise
  the Phase 0 interim `min(arb, bandar×0.97)` applies.
- **Walk-forward ship gate** (`npm run walkforward:g4`): read-only against the
  DB. It scores three systems — (0) Adi-only with interim stop, (1) Phase 0
  card (G0–G3, G4 skipped), (2) Phase 1 card (G0–G4, ATR stop) — on the same
  N=5 first-touch scorer, splits signals chronologically 80/20 with a 5-session
  purge gap, and prints `SHIP_GATE=PASS` only if system (2) beats system (1)
  on the OOS fold in both expectancy and profit factor with **≥30 OOS ENTER
  trades**. Below that floor the gate fails (`SHIP_GATE=FAIL` with
  `sampleFloorMet: false` and the measured OOS ENTER count in
  `artifacts/g4-walkforward.json`); G4 must then not be merged as a hard gate.
  The script always exits 0; the last line is the gate verdict.

---

## 3. Topology 1 — Localhost (development)

```bash
# 1. Start databases (Docker)
docker compose up -d db redis

# 2. Run migrations
DATABASE_URL=postgresql://sahamology:sahamology@localhost:5432/sahamology npm run migrate

# 3. Start the app (dev server with workers)
REDIS_URL=redis://localhost:6379 \
DATABASE_URL=postgresql://sahamology:sahamology@localhost:5432/sahamology \
CRON_SECRET=dev-secret \
AUTH_SECRET=dev-secret \
npm run dev
```

**Verify it works**
1. Open `http://localhost:3000`.
2. `curl -s http://localhost:3000/api/token-status` returns JSON.
3. Configure the Chrome extension:
   - Copy `stockbit-token-extension/background.js.example` → `background.js`
   - Copy `stockbit-token-extension/manifest.json.example` → `manifest.json`
   - Leave `DEFAULT_APP_API_URL` at `http://localhost:3000/api/update-token`
   - Load unpacked in `chrome://extensions`.

---

## 4. Topology 2 — Home/office LAN

The server must bind to `0.0.0.0` (already set in `package.json` start and
`Dockerfile`), and cookies must not be `Secure` over plain HTTP.

```bash
# On the LAN server (e.g. 192.168.1.4)
APP_BASE_URL=http://192.168.1.4:3000 \
CRON_SECRET=lan-secret \
AUTH_SECRET=lan-auth-secret \
docker compose up -d --build
```

Or with PM2:

```bash
npm ci
npm run build
DATABASE_URL=postgresql://sahamology:pass@localhost:5432/sahamology \
REDIS_URL=redis://localhost:6379 \
APP_BASE_URL=http://192.168.1.4:3000 \
CRON_SECRET=lan-secret \
AUTH_SECRET=lan-auth-secret \
pm2 start ecosystem.config.js
```

**Verify it works**
1. From another machine: `curl -s http://192.168.1.4:3000` returns HTML.
2. Cookie check: `curl -sI http://192.168.1.4:3000/api/auth/check-password | grep -i set-cookie`
   must NOT contain `Secure` (because the request is plain HTTP).
3. Extension: set `chrome.storage.local.set({ appApiUrl: "http://192.168.1.4:3000/api/update-token" })`
   and add `http://192.168.1.4:3000/*` to `host_permissions` in `manifest.json`.

---

## 5. Topology 3 — Behind a reverse proxy

Nginx, Caddy, Traefik, or Cloudflare Tunnel terminate TLS and forward to the
app. Set `COOKIE_SECURE=true` (or let `X-Forwarded-Proto: https` drive it).

### Nginx example

```nginx
server {
    listen 443 ssl;
    server_name stocks.example.com;

    ssl_certificate     /etc/letsencrypt/live/stocks.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stocks.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### Cloudflare Tunnel

```bash
cloudflared tunnel create sahamology
cloudflared tunnel route dns sahamology stocks.example.com
cloudflared tunnel run --url http://localhost:3000 sahamology
```

### App environment

```bash
APP_BASE_URL=https://stocks.example.com \
COOKIE_SECURE=true \
docker compose up -d --build
```

**Verify it works**
1. `curl -sI https://stocks.example.com/api/auth/check-password | grep -i set-cookie`
   shows `Secure`.
2. Extension: `appApiUrl = "https://stocks.example.com/api/update-token"`.

---

## 6. Topology 4 — Public IP / VPS

```bash
# Ubuntu 22.04/24.04 example
apt update && apt install -y nginx postgresql-16 redis-server
npm ci && npm run build

DATABASE_URL=postgresql://sahamology:strong@127.0.0.1:5432/sahamology \
REDIS_URL=redis://127.0.0.1:6379 \
APP_BASE_URL=http://<PUBLIC_IP>:3000 \
CRON_SECRET=strong-secret \
AUTH_SECRET=strong-auth-secret \
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

**Verify it works**
1. `curl -s http://<PUBLIC_IP>:3000/api/token-status` returns JSON.
2. Trigger a manual watchlist run:
   `curl -s -X POST http://<PUBLIC_IP>:3000/api/analyze-watchlist -H "Authorization: Bearer strong-secret"`
   returns `{"success":true,"message":"Watchlist analysis enqueued",...}`.
3. Check job logs: `curl -s http://<PUBLIC_IP>:3000/api/job-logs?limit=1`.

---

## 7. Daily schedule

The BullMQ repeatable job fires daily at **11:00 UTC (18:00 WIB)**. It is
created automatically by `instrumentation.ts` at server start. Manual trigger
and retry are available at `/api/analyze-watchlist` and `/api/job-retry`.

---

## 8. Backup & restore

```bash
# Backup
docker exec sahamology-db pg_dump -U sahamology -d sahamology -Fc > sahamology.dump

# Restore
docker exec -i sahamology-db pg_restore -U sahamology -d sahamology --clean < sahamology.dump
```

---

## 9. Rollback

Netlify/Supabase-specific files are gone, but the old data layer's public
interface is preserved. To roll back, restore the previous `lib/supabase.ts`
implementation and the `netlify/` directory from version control; no `app/**`
changes are required because all routes call the same helper signatures.
