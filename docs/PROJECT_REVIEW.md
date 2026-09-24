# Sahamology / Sahamology — End-to-End Project Review

Reviewed from local source on branch `main` at commit `25554fb63055d5c0ebb74a3564ae548b3937ef1c` (`docs: add v0.4.3 changelog entry for AI Story anti-stuck fix`, 2026-09-06 19:17:45 +0700). Remote: `https://github.com/dikotiledon/sahamology`.

This is a reading of the repository. No build, migration, or live API call was run. Counts, formulas, and route behavior below were taken from the files named next to them. Where the code disagrees with itself, both sides are recorded and left unresolved.

There is no `PROJECT_TERMS.md`. There is no reviewed terminology profile. Names in this document describe what the code does today. They are not a decision that those names are canonical.

---

## 1. What the application is

Sahamology is a personal, read-only calculator for Indonesia Stock Exchange (IDX) share-price targets. It does not place orders and it does not hold a trading PIN. The method is credited to Adi Sucipto (`https://www.instagram.com/adisuciipto/`). License is MIT, Copyright (c) 2026 Bhakti Utama (`README.md`).

The product name inside the app is **Sahamology**. The folder and this fork are **sahamology**.

| Surface | Value | Where |
|---|---|---|
| Folder | `/mnt/d/code/sahamology` | local checkout |
| Git remote | `github.com/dikotiledon/sahamology` | `git remote` |
| Upstream named in docs | `github.com/dikotiledon/sahamology` | `README.md`, `docs/Home.md`, navbar GitHub icon |
| npm package | `sahamology` `0.1.0` private | `package.json` |
| Page title | `Sahamology` | `app/layout.tsx` metadata |
| Navbar title | `Sahamology Calculator` | `app/components/Navbar.tsx` |
| Session cookie | `sahamology_session` | `lib/auth.ts`, `proxy.ts` |

Pages:

- `/` — calculator plus watchlist sidebar. Accepts `?symbol=` (`app/page.tsx`).
- `/history` — saved runs.
- `/summary` — per-emiten hit rates.

---

## 2. Stack

| Piece | Version / fact | Where |
|---|---|---|
| Next.js | `16.1.1`, App Router | `package.json` |
| React / React DOM | `19.2.3` | `package.json` |
| TypeScript | `^5`, strict, target ES2017 | `package.json`, `tsconfig.json` |
| Tailwind | `^4` via `@tailwindcss/postcss` | `package.json`, `postcss.config.mjs` |
| Host | Netlify, `@netlify/plugin-nextjs` | `netlify.toml` |
| Database | Supabase, `@supabase/supabase-js` `^2.89.0` | `lib/supabase.ts` |
| AI | `@google/genai` `^1.35.0`, default model `gemini-3-flash-preview` | story background function, `.env.local.example` |
| Charts | `recharts` `^3.6.0` | `package.json` |
| PDF | `jspdf` `^4.0.0`, `jspdf-autotable` `^5.0.7` | `lib/pdfExport.ts` |
| Image export | `html-to-image` `^1.11.13` | `package.json` |
| Icons | `lucide-react` `^0.562.0` | `package.json` |

`next.config.ts` is empty. Scripts: `dev` (`next dev`), `migrate` (`node scripts/run-migrations.js`), `build` (`next build`), `start` (`next start`).

Netlify build is `npm run migrate && npm run build`, publish directory `.next`. Functions live in `netlify/functions`. The scheduled function `analyze-watchlist` is declared twice with the same cron `0 11 * * *`: once in `netlify.toml` and once as `export const config` in `netlify/functions/analyze-watchlist.ts`.

Declared but not imported anywhere in application source:

- `html2canvas` `^1.4.1` (README says the project moved to `html-to-image`)
- `playwright` `^1.57.0`
- `playwright-extra` `^4.3.6`
- `puppeteer-extra-plugin-stealth` `^2.11.2`
- `mime` `^4.1.0`
- `tsx` `^4.21.0` (devDependency)

---

## 3. Environment

From `.env.local.example` plus code that reads more:

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL. Required by `lib/supabase.ts`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Required by `lib/supabase.ts`. |
| `SUPABASE_URL` / `SUPABASE_KEY` | Migration script fallbacks. Default to the `NEXT_PUBLIC_*` pair. `scripts/run-migrations.js`. |
| `STOCKBIT_JWT_TOKEN` | Fallback Stockbit bearer token when the `session` row is missing. |
| `CRON_SECRET` | Optional bearer check on `POST /api/analyze-watchlist` and inside `proxy.ts`. |
| `GEMINI_API_KEY` | Google AI Studio key for story generation. |
| `GEMINI_STORY_MODEL` | Default `gemini-3-flash-preview`. |
| `GEMINI_STORY_THINKING_LEVEL` | `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`. Default `HIGH`. |
| `AUTH_SECRET` | HMAC key for `sahamology_session`. If unset, `lib/auth.ts` uses the literal `dev_secret_please_change_in_production`. |
| `URL` | Netlify site URL. Scheduled and manual functions use it to call the background function, unless the value contains `localhost`, in which case they use the request host. |
| `NODE_ENV` | Session cookie `secure` flag is true only when this is `production`. |

---

## 4. How a target is calculated

Source: `lib/calculations.ts`. All of `totalPapan`, `rataRataBidOfer`, `a`, `p`, `targetRealistis1`, and `targetMax` are `Math.round`ed before they are returned. `fraksi` is not rounded.

Fraksi (tick size) from the current price `harga`:

| Price | Fraksi |
|---|---|
| `< 200` | 1 |
| `200`–`499` | 2 |
| `500`–`1999` | 5 |
| `2000`–`4999` | 10 |
| `>= 5000` | 25 |

The boundary tests are `<` on the upper end, so 200 is fraksi 2, 500 is fraksi 5, 2000 is fraksi 10, and 5000 is fraksi 25.

```
totalPapan       = (ara - arb) / fraksi
rataRataBidOfer  = (totalBid + totalOffer) / totalPapan
a                = rataRataBandar * 0.05
p                = barangBandar / rataRataBidOfer
targetRealistis1 = rataRataBandar + a + ((p / 2) * fraksi)
targetMax        = rataRataBandar + a + (p * fraksi)
```

Division by zero is not guarded. If `ara == arb`, or both bid and offer totals are 0, the result is `Infinity` or `NaN` and then `Math.round` of that.

Callers pass `totalBid / 100` and `totalOffer / 100`. `parseLot` in `lib/stockbit.ts` only strips commas. The `/ 100` is a separate unit conversion (shares to lots) applied by the route and by both watchlist jobs, not by `calculateTargets`.

### Where ARA and ARB actually come from

`OrderbookData` in `lib/types.ts` has `ara.value` and `arb.value`. No route reads them.

Every live calculation sets:

- `offerTeratas` = max price on the current offer book, or `high` if the offer book is empty, or `0`
- `bidTerbawah` = min price on the current bid book, or `0` if the bid book is empty

Those two numbers are passed to `calculateTargets` as `ara` and `arb`, and stored in `stock_queries.ara` / `stock_queries.arb`.

This happens in all three places that calculate:

- `app/api/stock/route.ts` (the calculator)
- `app/api/analyze-watchlist/route.ts` (the unused HTTP analyzer; see section 6)
- `netlify/functions/analyze-watchlist-background.ts` (the scheduled job)

So "ARA" and "ARB" in the database are the top of the live offer book and the bottom of the live bid book, not the exchange auto-reject limits. `totalPapan` is the number of ticks between those two book prices. A thin book makes `totalPapan` small, `rataRataBidOfer` large, and `p` small, which pulls both targets toward `rataRataBandar + a`.

For a calculator query whose `toDate` is not today, `POST /api/stock` replaces price, ara, arb, and both totals from `getStockPriceByDate` when a row exists. That row was itself saved from a previous live book, so the substitution persists.

### Bandar

`getTopBroker` (`lib/stockbit.ts`) takes `brokers_buy[0]` after sorting is already done by Stockbit. It reads:

- `bandar` = `netbs_broker_code`
- `barangBandar` = `Math.round(Number(blot))`
- `rataRataBandar` = `Math.round(Number(netbs_buy_avg_price))`

If `brokers_buy` is missing or empty, it returns `null`. The calculator then tries the latest saved row for that emiten. The watchlist jobs record an error for that emiten and continue.

### Names for the same target

| Layer | Identifier |
|---|---|
| Function return | `targetRealistis1` |
| TypeScript `CalculatedData` | `targetRealistis1` |
| Database column | `target_realistis` |
| History fallback JSON | `target_realistis` (snake_case, and the sibling field is `rata_rata_bandar`, not `rataRataBandar`) |
| Live JSON | `targetRealistis1` |
| UI | "Target Realistis", "Target R1", "Target 1" |
| Hit-rate field | `hitR1`, `hitRateR1` |

`a` and `p` have no longer names in code. UI copy treats `a` as the 5% bandar margin and `p` as how many boards the bandar's lots can absorb.

Spelling: code says `totalOffer` and also `rataRataBidOfer` / `rata_rata_bid_ofer`. "Ofer" is the spelling in the schema and the calculator. "Offer" is the spelling on the order book.

---

## 5. Brokers

`lib/brokers.ts` `BROKERS` has 92 entries, counted from `type:` fields:

| `BrokerType` | Count |
|---|---|
| `Smartmoney` | 45 |
| `Retail` | 17 |
| `Whale` | 15 |
| `Mix` | 14 |
| `Unknown` | 1 (the key `DR`) |
| **Total keys** | **92** |

`getBrokerInfo` returns `{ code, name: "Unknown Broker", type: "Unknown" }` for any code not in the map. The `DR` row is a mapped unknown, separate from that fallback.

`lib/broker-flow-transform.ts` maps `Smartmoney` to the flow status `Bandar`. The flow card then labels status `Bandar` as "Smart Money". So one broker can be `Smartmoney` in the dictionary, `Bandar` in the flow payload, and "Smart Money" on screen. Whale, Retail, and Mix pass through under those words.

Stockbit running-trade charts accept at most 7 broker codes. `pickTopBrokerCodes` defaults `topN` to 10, and the route caps the request at 7.

Flow periods are `1D | 7D | 14D | 21D`. The window end is "yesterday" computed as a fixed UTC+7 offset, not a timezone database, and not the weekend-aware `getDefaultDate`.

---

## 6. Request paths

### Calculator — `POST /api/stock`

Body: `{ emiten, fromDate, toDate }`. All three required.

1. Fetches market detector, orderbook, and emiten info in parallel. Emiten info failure becomes `sector = undefined` and does not fail the request.
2. If there is no top broker, returns the latest `stock_queries` row for that emiten, with `isFromHistory` set when the saved dates differ. That fallback object uses snake_case (`rata_rata_bandar`, `rata_rata_bid_ofer`, `target_realistis`, `target_max`). A live success uses camelCase. `brokerSummary` is `null` on the fallback.
3. If there is still no row: 404, message `Data broker tidak tersedia untuk periode ini (Market belum buka atau saham tidak aktif)`.
4. Live path builds `marketData` from the order book as described in section 4. Non-today queries overlay a saved price row when one exists.
5. Saves only when `fromDate === toDate`. The save is not awaited; failure is logged. The payload does **not** set `status`. The column default is whatever migration `006` left. History and hit rate both filter `.eq('status', 'success')` (`lib/supabase.ts` lines 304, 323, 340, 358, 676). A calculator-only save can therefore be missing from History and Summary.

### Watchlist jobs — three entry points, two data sources

```
cron 0 11 * * *
    analyze-watchlist.ts
        POST /.netlify/functions/analyze-watchlist-background
            fetchWatchlist()                         # Stockbit default list, live

navbar Retry
    POST /api/job-retry          { jobName }         # only 'analyze-watchlist' is accepted
        POST /.netlify/functions/analyze-watchlist-manual
            POST /.netlify/functions/analyze-watchlist-background
                fetchWatchlist()                     # same live default list

POST /api/analyze-watchlist      (nothing in the UI calls this)
    cached default group, else first cached group
    if that cache is empty: fetchWatchlist()
    optional Authorization: Bearer $CRON_SECRET
```

The scheduled function and the manual function are the same shape. Both ignore `CRON_SECRET`. Both call the background function and return 200 with the background status. A comment in `/api/job-retry` says the scheduled function returns 500 when called over HTTP, which is why Retry goes through `analyze-watchlist-manual`.

`analyze-watchlist-manual.ts` imports `Config` and never uses it. The scheduled file does use `Config` for `schedule: "0 11 * * *"`.

The background function (`analyze-watchlist-background.ts`):

- Creates a `background_job_logs` row named `analyze-watchlist`.
- Uses today's UTC date (`toISOString().split('T')[0]`), not `getDefaultDate`. A Saturday run still uses Saturday.
- Saves with `status: 'success'`.
- Then looks back 7 days via `fetchHistoricalSummary`, takes `historicalData[0]`, and writes that close and high onto the latest successful row **before today** through `updatePreviousDayRealPrice`. The function name says "previous day". The window is 7 days and the chosen bar is the first element, not "yesterday" by calendar.
- Job status is `failed` only when every emiten errors. Mixed success is `completed` with `error_count` set and `error_message` like `N items failed`.
- Token-looking errors (message contains `401`, `unauthorized`, `token`, or `authentication`) are relabeled for the log. Other errors are stored as the raw message.

`POST /api/analyze-watchlist` duplicates that loop, including the offer/bid substitution and the 7-day price write, but it prefers the cached watchlist and it checks `CRON_SECRET` when the variable is set. It does not write `background_job_logs`.

### AI story

`POST /api/analyze-story` inserts an `agent_stories` row at `pending` and triggers `analyze-story-background`. `GET` lists stories for an emiten.

The background function picks a provider from `LLM_PROVIDER`. Unset or `gemini` streams `gemini-3-flash-preview` (or `GEMINI_STORY_MODEL`) with Google Search enabled and thinking level `GEMINI_STORY_THINKING_LEVEL`. `openai` posts one JSON chat completion to `{LLM_BASE_URL}/chat/completions` and does not run Google Search. Both paths extract the first `{...}` block and store:

- `matriks_story`
- `swot_analysis`
- `checklist_katalis`
- `keystat_signal`
- `strategi_trading`
- `kesimpulan`

It does not write `sources`. Column `agent_stories.sources` exists (migration `011`) and `SourceCitation` exists on the type. Completed rows leave it null.

The prompt tells the model not to mention a specific share price. The same JSON schema asks for `target_entry`, `take_profit`, and `stop_loss`.

Client polling (`app/components/Calculator.tsx`):

- Interval 5 seconds.
- Stops after 36 attempts (`MAX_POLL_ATTEMPTS`), about 3 minutes, or on a terminal status.
- Opening an emiten that already has `pending` or `processing` only resumes GET. It does not POST a new story.
- "Coba Lagi" on `AgentStoryCard` is the user-initiated POST.

Story statuses: `pending`, `processing`, `completed`, `error`. The card shows the model and thinking level when present. A version dropdown appears only when more than one story exists. A story that just became `completed` becomes the selected version.

Navbar Retry does not retry `analyze-story`. It only accepts `analyze-watchlist`.

### Other routes

| Route | Methods | What it does |
|---|---|---|
| `/api/auth/check-password` | GET | If `password_enabled` is not `'true'`, issues a session with `verified: false`. |
| `/api/auth/verify-password` | POST | SHA-256 of the password, compared to `profile.password_hash`. On match, session `verified: true`. |
| `/api/auth/set-password` | POST | Enable requires length >= 4. Stores unsalted SHA-256. Disable clears the hash. Always clears the session cookie. |
| `/api/profile` | GET, PUT | GET one key. PUT writes any key to `profile`. No allow-list. |
| `/api/update-token` | POST, OPTIONS | Chrome extension body `{ token, expires_at }`. CORS `*`. Upserts `session` key `stockbit_token`. |
| `/api/update-token/[token]` | GET | Same upsert, token in the URL path. |
| `/api/token-status` | GET | Returns `TokenStatus`, including the `token` field. |
| `/api/watchlist/groups` | GET | Cache, or `?sync=true` to refetch Stockbit groups. Empty cache auto-syncs. |
| `/api/watchlist` | GET, DELETE | Items for `groupId`. `?sync=true` refetches. Merges `emiten_flags`. DELETE needs `watchlistId` and `companyId`. |
| `/api/watchlist-history` | GET | Filters: `emiten`, `sector`, `fromDate`, `toDate`, `status`, `limit` (default 50), `offset`, `sortBy`, `sortOrder`. |
| `/api/summary` | GET | `limit` must be 3, 5, 10, 20, or 50. Anything else becomes 5. |
| `/api/sectors` | GET | Stockbit sector list. In-memory cache 24h inside `lib/stockbit.ts`. |
| `/api/keystats` | GET | `?emiten=` required. Uppercased. |
| `/api/broker-flow` | GET | Running-trade chart, max 7 brokers, periods 1D/7D/14D/21D. |
| `/api/emiten/flag` | GET, POST | Flag must be `OK`, `NG`, or `Neutral`. Emiten is uppercased. |
| `/api/job-logs` | GET | `jobName`, `status`, `limit` (default 20), `offset`, `latest=true`. |
| `/api/job-retry` | POST | Body `{ jobName }`. Only `analyze-watchlist`. |

Default analysis date in the calculator (`lib/utils.tsx` `getDefaultDate`) moves Saturday back 1 day and Sunday back 2 days, to Friday. It does not know IDX holidays. Background jobs do not use this helper. They use UTC today.

Emiten flag fetch in `InputForm` runs only when the symbol length is exactly 4. In-flight flag requests are deduped per symbol.

---

## 7. Auth

`lib/auth.ts` builds an HMAC-SHA256 token, header and payload base64 (not base64url), signature base64url. Payload is `{ authenticated: true, verified, exp }` with `exp` 24 hours from `Date.now()` in milliseconds. Cookie `sahamology_session` is `httpOnly`, `sameSite: 'lax'`, `path: /`, `maxAge` 86400 seconds. `secure` follows `NODE_ENV === 'production'`.

Password storage is SHA-256 with no salt (`app/api/auth/set-password/route.ts` and the matching verify route). Minimum length 4. Changing or disabling the password clears the cookie.

`proxy.ts` exports `proxy` and a `config.matcher` of `/api/:path*`. It is not named `middleware.ts`, and nothing imports it. Next.js 16.1.1 still loads a file with this shape: `npx next build` prints `ƒ Proxy (Middleware)`. A cookie check inside `proxy()` therefore runs. With the file as it sits:

- A request without a valid cookie is rejected with 401.
- Public exceptions are verify, check, and set-password.
- A valid HMAC is enough. The proxy never reads `verified`. The guest cookie from `check-password` (`verified: false`) passes it.
- `CRON_SECRET` as `Authorization: Bearer …` also passes it, for any `/api` path.

`AUTH_SECRET` falls back to `dev_secret_please_change_in_production`.

`GET /api/update-token/[token]` puts the Stockbit bearer token in the path, so it can land in access logs, browser history, and referrers. The extension example (`stockbit-token-extension/background.js.example`) uses POST with a JSON body, not this GET. The extension syncs only when the token string changed and the JWT payload has `exp`. It sends `expires_at` as that `exp` in seconds.

`GET /api/token-status` returns the token string to the browser. The navbar indicator polls it every 30 seconds. A transition from invalid to valid dispatches `window` event `token-refreshed`.

`PUT /api/profile` can overwrite `password_hash` and `password_enabled` because it accepts any key.

---

## 8. Database

Migrations `supabase/000_init.sql` through `017_add_ai_model_column.sql` run in filename order via `scripts/run-migrations.js`. The runner records `schema_migrations(id, migration_name, executed_at, checksum, execution_time_ms)` and executes SQL through `exec_migration_sql(sql_query TEXT)` (`SECURITY DEFINER`).

### `session` (001, 010)

`id`, `key` unique, `value`, `created_at`, `updated_at`, `expires_at`, `last_used_at`, `is_valid`. The Stockbit token is the row `key = 'stockbit_token'`.

### `stock_queries` (002, 006, 007, 008, 012)

One row per emiten per `from_date` (`uq_stock_queries_date_emiten`). Columns: `emiten`, `sector`, `from_date`, `to_date`, `bandar`, `barang_bandar`, `rata_rata_bandar`, `harga`, `real_harga`, `max_harga`, `ara`, `arb`, `fraksi`, `total_bid`, `total_offer`, `total_papan`, `rata_rata_bid_ofer`, `a`, `p`, `target_realistis`, `target_max`, `status` default `'success'`, `error_message`, timestamps.

Hit rate (`getEmitenSummaryStats`): a later `max_harga` at or above `target_realistis` is Hit R1. At or above `target_max` is Hit Max. Rate is hits over evaluated days. The PDF also marks a dot from `real_harga` against the target. Those are two different comparisons (`max_harga` vs `real_harga`).

### `agent_stories` (003, 009, 011, 017)

`emiten`, `status` (`pending` / `processing` / `completed` / `error`), `matriks_story`, `swot_analysis`, `checklist_katalis`, `strategi_trading`, `kesimpulan`, `keystat_signal`, `sources`, `model`, `thinking_level`, `error_message`.

### `background_job_logs` (004)

`job_name`, `status` (`running` / `completed` / `failed`), `started_at`, `completed_at`, `success_count`, `error_count`, `total_items`, `log_entries` jsonb, `error_message`, `metadata` jsonb.

### `emiten_flags` (005)

`emiten` primary key. `flag` check `OK`, `NG`, `Neutral`.

### `profile` (013, 016)

Key/value. Seeded: `history_row_count = '5'`, `password_enabled = 'false'`, `password_hash = ''`.

### Watchlist cache (014, then 015 replaces the shape)

- `watchlist_groups`: `watchlist_id` unique, `name`, `description`, `is_default`, `is_favorite`, `emoji`, `category_type`, `total_items`, `synced_at`.
- `emiten_cache`: `symbol` primary key, `name`, `sector`, `last_price`, `percent`, `synced_at`.
- `watchlist_items`: `watchlist_group_id` cascade, `symbol` cascade, `stockbit_item_id`, `company_id`, unique `(watchlist_group_id, symbol)`.

Migration 014 created an earlier cache. 015 normalizes it. A database that skipped 015 still has the old shape. The app code uses the 015 tables.

---

## 9. Interface details

- Theme: `localStorage.theme === 'light'` adds `light-theme` on `document.body` before paint (`app/layout.tsx`). Anything else is dark.
- Navbar links: Calculator (`/`), History (`/history`), Summary (`/summary`). GitHub icon opens `https://github.com/dikotiledon/sahamology`.
- Status cluster, left to right: Stockbit fetching spinner, job status, token status, theme, password. Job and token each poll every 30 seconds and share one in-flight promise so two mounts do not double-fetch.
- Watchlist sidebar cache age: under 24 hours prints `N jam lalu`, then whole days. Refresh calls `?sync=true` on groups and on the selected group's items. Delete calls `DELETE /api/watchlist?watchlistId=&companyId=`.
- Flags render as a blue check (`OK`) or an orange cross (`NG`). `Neutral` and null are the absence of those icons.
- History can export PDF (`lib/pdfExport.ts`: all rows, or grouped by emiten) and uses `html-to-image` for image export.
- `PasswordGate` is the client wall. It is not a server wall. See section 7.
- Broker flow chart colors include a fixed map (for example `YP`) plus a golden-ratio hue walk for the rest (`EmitenSummaryCard.tsx`).

---

## 10. Chrome extension

`stockbit-token-extension/` ships examples only: `manifest.json.example`, `background.js.example`. Manifest is MV3. The service worker listens to `chrome.webRequest.onBeforeSendHeaders` for `https://*.stockbit.com/*`, reads `Authorization: Bearer …`, requires a JWT payload with `exp`, and POSTs `{ token, expires_at }` to `APP_API_URL`. The example URL is `https://YOUR_APP_DOMAIN.netlify.app/api/update-token`. It remembers the last synced token in memory and skips duplicates.

---

## 11. Docs, changelog, wiki

`docs/` today, before this file:

| File | Wiki name after sync |
|---|---|
| `Home.md` | `Home.md` |
| `WIKI_DEPLOY_CLOUD.md` | `Deploy-Cloud.md` |
| `WIKI_DEPLOY_LOCAL.md` | `Deploy-Local.md` |
| `CHECKPOINT.md` | `Checkpoint.md` |
| `WIKI_RESET_PASSWORD.md` | `Reset-Password.md` |

`.github/workflows/sync-wiki.yml` copies that fixed list into the GitHub wiki on pushes to `main` that touch `docs/**`. This review is not in that list, so it stays in the repo `docs/` folder and is not published to the wiki unless the workflow is edited.

`README.md` keeps the three newest versions. Older notes move to `CHANGELOG.md`. The rule lives in `.claude/skills/update-changelog/SKILL.md`. Head version in the README at this commit is v0.4.3 (AI Story poll stops after about 3 minutes).

Wiki prose and the navbar still point at `github.com/dikotiledon/sahamology`. This checkout's `origin` is `github.com/dikotiledon/sahamology`.

---

## 12. File map

```
app/
  layout.tsx, page.tsx, globals.css
  history/page.tsx
  summary/page.tsx
  api/                       see section 6
  components/                calculator, story, broker cards, history, sidebar, navbar
lib/
  calculations.ts            fraksi and targets
  stockbit.ts                Exodus client, token, caches
  supabase.ts                all table access
  brokers.ts                 92 broker codes
  broker-flow-transform.ts   running trade -> flow, Smartmoney -> Bandar
  auth.ts                    HMAC session
  types.ts                   shared interfaces
  pdfExport.ts
  utils.tsx                  getDefaultDate, link renderer
netlify/functions/
  analyze-watchlist.ts                 cron trigger
  analyze-watchlist-manual.ts          retry trigger
  analyze-watchlist-background.ts      the job
  analyze-story-background.ts          Gemini job
supabase/000_… through 017_….sql
scripts/run-migrations.js
stockbit-token-extension/              examples only
docs/                                  this file and the wiki sources
proxy.ts                               not wired
test-api.mjs                           manual Stockbit probe, contains a token fragment
```

Stockbit host used by `lib/stockbit.ts`: `https://exodus.stockbit.com`. Paths include market detector, order book, emiten info, key stats, sectors, watchlist, and running-trade chart.

---

## 13. Conflicts left open

These are product choices. The code currently does the first option in each pair. Nothing in this review changes that.

1. **Brand.** UI, package, cookie, and docs say Sahamology. The folder, remote, and this fork say sahamology. Navbar and wiki still link to `dikotiledon/sahamology`.
2. **Actor.** Calculation and `stock_queries.bandar` say Bandar. The broker dictionary says `Smartmoney`. The flow payload says `Bandar`. The flow card says "Smart Money".
3. **Target name.** One number is `targetRealistis1`, `target_realistis`, "Target Realistis", "Target R1", and "Target 1".
4. **ARA / ARB.** The type has exchange `ara` / `arb`. Every calculator uses the live offer top and bid bottom and stores those in the `ara` / `arb` columns. Scheduled rows and manual rows are therefore not comparable to a run that used statutory auto-reject prices, because no run uses those prices.
5. **Which watchlist.** Cron and Retry analyze Stockbit's live default list. `POST /api/analyze-watchlist` analyzes the cached default group. The UI does not call that route.
6. **Which hit.** Summary uses `max_harga`. The PDF dot uses `real_harga`. Both are filled from `historicalData[0]` in a 7-day lookback, not from a named previous session.
7. **Calculator rows vs history.** Watchlist saves set `status: 'success'`. `saveStockQuery` does not. History and hit rate filter on `success`.

Security notes, also left as notes:

- `proxy.ts` is not Next middleware.
- Unsalted SHA-256 passwords, minimum 4 characters.
- `AUTH_SECRET` default is a committed string.
- Stockbit JWT can arrive in a URL path and can leave via `/api/token-status`.
- `PUT /api/profile` is an open key/value write.
- `test-api.mjs` contains a Stockbit JWT fragment.

---

## 14. What this review did not do

- Did not run `npm run build`, `npm run migrate`, or any Stockbit / Supabase / Gemini call.
- Did not create `PROJECT_TERMS.md`.
- Did not change application code.
- Did not decide the seven conflicts in section 13.
