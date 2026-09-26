# R5: 2026 IDX holiday seed — RESOLVED

**Task:** R5 of `.omh/plans/2026-09-26-phase-0-remediation.md` — seed
`lib/idx-holidays.json` with official 2026 IDX trading holidays.

**Status:** RESOLVED 2026-09-26. `lib/idx-holidays.json` now carries 13 weekday
libur-nasional dates for 2026.

**Source (verified):**
- Primary API (user-provided): `https://api.kemendesa.link/libur-nasional/api/holidays/2026.json`
  — metadata cites `SKB 3 Menteri 2026` and links the Kemenko PMK PDF.
- Cross-check: `guangrei/APIHariLibur_V2` `holidays.json` (GitHub) — identical
  libur-nasional vs cuti-bersama split.

**Derivation rule:**
The IDX closes on weekday **libur nasional** and stays open on **cuti bersama**.
So `is_cuti_bersama: true` entries are excluded, and weekend entries are left to
`isWeekend()` rather than duplicated in the holiday file.

Seed (weekday libur nasional only):
`2026-01-01`, `2026-01-16`, `2026-02-17`, `2026-03-19`, `2026-04-03`,
`2026-05-01`, `2026-05-14`, `2026-05-27`, `2026-06-01`, `2026-06-16`,
`2026-08-17`, `2026-08-25`, `2026-12-25`.

**Anomalies resolved against the cross-source:**
- `2026-03-20` is named "Idul Fitri" by kemendesa but flagged cuti bersama;
  guangrei agrees it is cuti bersama → excluded.
- `2026-04-05` (Paskah) is a Sunday → weekend-handled, excluded.
- `2026-03-18`/`2026-02-16`/`2026-05-15`/`2026-05-28`/`2026-12-24` are cuti
  bersama → excluded.

**Caveat (honest):** the SKB PDF itself is a scanned image with no text layer,
so the seed is derived from the two independent machine-readable datasets above,
not from OCR of the gazette PDF. If BEI later publishes an exchange-specific
2026 trading-holiday circular that differs (e.g. an exchange-only half day),
that circular wins — update this file from it.
