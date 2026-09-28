# Changelog

Riwayat lengkap perubahan Sahamology. 3 versi terbaru selalu ditampilkan di [README.md](README.md#changelog); versi yang lebih lama diarsipkan di sini.

### Unreleased / v0.7.0 (draft) — Phase 1 Tape Filter

Phase 1 "Tape Filter" — ATR(14) invalidation, 20-EMA trend gate, and the
3-pattern allow-list, validated by a purged walk-forward before the gate ships.

- **Tape substrate (`lib/tape/`)**: zero-dependency Wilder ATR(14) and
  TA-Lib-aligned EMA(20) with lookahead-closed snapshot builder
  (`MIN_BARS = 21`, unclosed session excluded when `liveIncompleteToday`).
- **3-pattern allow-list**: P1 Wyckoff spring, P2 higher low with same-bandar
  persistence, P3 break of prior high holding above EMA(20). No candlestick
  patterns.
- **G3 ATR invalidation**: stop = `rataRataBandar − 1.0×ATR` tick-rounded
  toward entry on IDX fraksi; Phase 0 interim `min(arb, bandar×0.97)` kept as
  the no-tape fallback.
- **G4 live fail-closed tape gate**: missing/short tape or a collapsing tape
  without an allow-list pattern → `WAIT`; G5–G7 remain skipped (`phase-1`).
- **Unified path-outcome scorer**: stop-first, max-before-R1, expiry at last
  close, round-trip friction 0.006, empty path unscored.
- **365-day chunked backfill**: Stockbit history queries paginated through
  `chunkDateRange` and deduplicated (`dedupeHistoryByDate`).
- **Walk-forward reporter**: `npm run walkforward:g4` compares the Phase 0
  card (G0–G3, interim stop, G4 skipped) against the Phase 1 card (G0–G4, ATR
  stop) on a purged 80/20 split (5-session purge gap). Ship gate = Phase 1
  beats Phase 0 on OOS expectancy and profit factor with ≥ 30 ENTER trades.

### Unreleased / v0.6.0 (draft)

Phase 0 "Honest Desk" — deterministic decision engine built on the Adi Sucipto
target math. This entry describes work merged locally; **the CI workflow file was
added but a GitHub CI run is not claimed in this entry.**

- **Decision Journal JSONB Fix**: `saveDecisionJournal` serializes the `gates`
  array into valid JSON before reaching node-postgres (was: `invalid input syntax
  for type json` on every journal POST). `strategi_trading` is also covered by
  the same serializer, and `listDecisionJournal(emiten, limit)` now reads back
  the latest cards ordered by `as_of DESC`.
- **Canonical G0–G3 Playbook Evaluator**: `lib/playbook/evaluate.ts` implements
  the spec exactly — G0 data integrity (degenerate book → `AVOID`), G1 bandar
  sponsorship (Smartmoney/Whale accumulation; `TAKE_PROFIT` when `harga > R1`
  with an open ENTER card), G2 execution headroom (`harga >= ara`,
  `totalOffer > 2 × totalBid`), and G3 net risk-reward ≥ 1.5 after IDX friction.
  The invented 5%-above-bandar chase rule is removed. G4–G7 are emitted as
  `pass: true, skipped: true` for forward compatibility (Phase 1 replaces G4
  with the live tape filter).
- **Live Context Wiring**: `/api/stock` now builds the playbook input from
  historical bandar accumulation (prior 3 sessions), token validity
  (`getTokenStatus`), IDX session check (`market-calendar`), and the latest
  journaled card for open-position detection. The Decision Card renders the
  evaluator's output and the calculator journals every shown card.
- **Price History Backfill Worker**: BullMQ queue `price-history-backfill`
  (`concurrency: 1`) with `enqueuePriceHistoryBackfill()` and a session-gated
  `POST /api/price-history/backfill`. The CLI `npm run backfill:history` remains
  as an operator fallback. No daily cron in Phase 0.
- **2026 IDX Holiday Seed (from SKB 3 Menteri 2026)**: `lib/idx-holidays.json`
  now carries 13 weekday libur-nasional dates. Sourced from the
  `api.kemendesa.link` national-holiday API (metadata cites SKB 3 Menteri 2026)
  and cross-checked against the `guangrei/APIHariLibur_V2` dataset. Cuti-bersama
  days are excluded because the exchange stays open on them. See
  `docs/R5-IDX-HOLIDAYS-BLOCKER.md` for the derivation and the caveat that the
  gazette PDF itself is a scanned image.
- **Story Analysis Schema Alignment**: `buildPrompt` is now exported and requires
  `strategi_trading` (`tipe_saham`, `catalyst_bias`, `invalidating_events`) in
  the model output while continuing to forbid numeric price levels.
  `updateAgentStory` persists `strategi_trading` to the JSONB column, and
  `AgentStoryCard` shows it with a fixed disclaimer that targets and
  invalidations follow the Decision Card (Adi R1/Max).
- **Phase 0 Hardening (from the audited initial delivery)**: test harness
  expansion, guarded `calculateTargets` math, Asia/Jakarta market calendar,
  `AUTH_SECRET` required in production, scrypt password hashing with legacy
  migration, allow-listed profile settings, Stockbit JWT redaction, Stockbit
  token-bucket rate limiter, `price_history` table, unified hit definition
  (next-day `max_harga`), Adi-only baseline harness, decision journal table and
  API, and the Decision Card UI.

### v0.5.0 (2026-09-24)
- **Self-Hosted Migration**: Netlify + Supabase → Next.js standalone + PostgreSQL 16 + Redis 7 (BullMQ) dalam Docker Compose.
- **Native pg Data Layer**: `lib/db.ts` menggantikan PostgREST/Supabase client; `lib/supabase.ts` tetap sebagai shim backward-compatible.
- **Embedded Workers**: Background job (watchlist & story analysis) berjalan di proses Next.js via `instrumentation.ts`.
- **OpenAI-Compatible LLM**: `LLM_PROVIDER=openai` mendukung endpoint chat-compatible (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
- **Fix JSONB Persistence**: `updateAgentStory` men-serialize nilai array/object untuk kolom `jsonb` (mencegah `invalid input syntax for type json`).
- **Chrome Extension Dist**: `stockbit-token-extension/dist/` siap load + archive `.zip`.

### v0.4.0 (2026-02-23)
- **High-Fidelity Copy Image**: Migrasi dari `html2canvas` ke `html-to-image` untuk hasil capture yang lebih tajam (HD) dan akurat.
- **Transparent Corners**: Optimalisasi capture spesifik pada elemen card untuk menghasilkan pojok yang transparan (rounded).
- **Clean Capture**: Penambahan fitur filter otomatis untuk menyembunyikan tombol aksi footer dari hasil gambar copy.

### v0.3.3 (2026-02-22)
- **Password Protection**: Implementasi keamanan akses aplikasi dengan proteksi password.
- **Session-based Unlocking**: Mekanisme akses satu kali per sesi.
- **Reset Documentation**: Panduan pemulihan akses melalui Supabase jika lupa password.

### v0.3.2 (2026-02-22)
- **Local Watchlist & Normalization**: Mengalihkan penyimpanan data watchlist dari Stockbit API ke database lokal (cache-first) dengan struktur database yang lebih efisien.
- **Status Indicator UI**: Pembaruan indikator status token dengan warna **Orange** untuk status "Expiring", serta pemindahan indikator proses fetching stockbit ke Navbar untuk mencegah *layout shifting*.
- **Spinner & Aesthetics**: Pembaruan gaya visual spinner menjadi transparan (arc-only) dan penyatuan status sinkronisasi *Watchlist* ke indikator global di Navbar.
- **Documentation Migration**: Memindahkan panduan instalasi lengkap ke Wiki (`docs/WIKI_DEPLOY_LOCAL.md` & `docs/WIKI_DEPLOY_CLOUD.md`) untuk menjaga agar README tetap ringkas.

### v0.3.1 (2026-02-19)
- **Responsive Navbar**: Implementasi menu hamburger untuk tampilan mobile, memindahkan indikator status dan toggle tema ke dalam sub-menu.
- **Card UI Fixes**: Perbaikan alignment logo/judul pada navbar dan penanganan nama sektor yang sangat panjang (elipsis) pada card ringkasan.
- **Scroll Optimization**: Menonaktifkan vertical scroll pada `CompactResultCard` dan `BrokerSummaryCard` untuk menjaga konsistensi visual saat pengambilan screenshot/copy image.

### v0.3.0 (2026-02-16)
- **New Summary & Performance Dashboard**: Dasbor khusus untuk melacak performa emiten dalam jangka waktu tertentu (3, 5, 10, 20, 50 hari trading).
- **Hit Rate Analytics**: Kalkulasi otomatis "Hit Rate R1", "Hit Rate Max", dan "Total Hit Rate" berdasarkan riwayat analisis nyata.
- **Top 3 Bandar Tracking**: Menampilkan 3 broker paling aktif untuk setiap emiten, lengkap dengan jumlah kemunculan dan klasifikasi tipe (Whale, Smart Money, Retail, Mix).
- **Fix PDF Export Global**: Perbaikan bug di mana beberapa emiten terlewati pada "All Per Emiten PDF" serta memastikan filter diterapkan secara global (bukan hanya halaman aktif).
- **UI/UX Refinements**: Standarisasi ukuran font, peningkatan kontras warna label pada Dark Mode, dan optimalisasi layout kolom untuk keterbacaan data yang lebih baik.

### v0.2.0 (2026-02-15)
- **Advanced PDF Export**: Sistem pelaporan PDF baru yang lebih informatif, mencakup:
  - Format portrait yang dioptimalkan (muat 20 baris per halaman).
  - Ringkasan statistik agregat (Hit R1, Hit Max, Avg Bandar Plus/Minus).
  - Ringkasan frekuensi Bandar per emiten.
  - Grafik performa visual (dot tracking) terintegrasi dalam PDF.
- **Revamp UI Tabel Riwayat**: Pembaruan gaya tombol "Solid-Btn" yang lebih premium dan konsisten di seluruh aplikasi, serta perbaikan visibilitas elemen pada Dark Mode.
- **Sinkronisasi Format Laporan**: Menyamakan format output antara "Filtered PDF" dan "Per Emiten PDF" untuk konsistensi data.
