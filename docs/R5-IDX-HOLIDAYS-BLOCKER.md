# R5 Blocker: 2026 IDX trading holiday seed

**Task:** R5 of `.omh/plans/2026-09-26-phase-0-remediation.md` — seed
`lib/idx-holidays.json` with official 2026 IDX trading holidays.

**Status:** BLOCKED (no dates written; safe weekend-only behavior retained).

**Why:** The official IDX holiday source is unreachable from this environment.

| Attempt | Target | Result |
|---|---|---|
| 1 | `https://www.idx.co.id/en/about-us/trading-holiday/` | Cloudflare block (Ray `a40e2a792d15ee16`) |
| 2 | `https://www.idx.co.id/id/tentang-bei/hari-libur-bursa/` | Cloudflare block |
| 3 | `https://www.idx.co.id/umbraco/Surface/HelperSurface/GetTradingHoliday` | Cloudflare block |
| 4 | `https://www.idx.co.id/StaticData/TradingHoliday` | Cloudflare block |
| 5 | Google search for `IDX trading holiday 2026` | Bot wall, no results |

**Consequence:** `lib/idx-holidays.json` remains `[]`. `sessionDateJakarta` still
rolls back over weekends, which is the safe documented fallback in
`lib/market-calendar.ts`. The calendar does **not** lie about holidays — it just
does not yet know them, so a query on an IDX holiday can return the holiday date.

**Unblock path (operator, one browser session):**
1. Open `https://www.idx.co.id/en/about-us/trading-holiday/` in a normal browser.
2. Copy the 2026 exchange holidays (NOT weekends, NOT public holidays unless the
   exchange lists them).
3. Write them into `lib/idx-holidays.json` as `["YYYY-MM-DD", ...]`.
4. Run `npx tsx --tsconfig tsconfig.test.json --test lib/market-calendar.test.ts`.
5. If tests pass, remove this blocker file.

Recorded: 2026-09-26. Do not delete this file until the seed lands.
