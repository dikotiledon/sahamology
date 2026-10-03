# Sahamology - Kalkulator Target Saham

> [!CAUTION]
> **PERINGATAN KEAMANAN**: Jangan pernah membagikan URL aplikasi Anda secara publik. Aplikasi ini melakukan sinkronisasi token sesi Stockbit Anda ke database. Jika URL bocor, orang lain dapat menyalahgunakan akses tersebut. Meski begitu, aplikasi ini tetap tidak bisa melakukan transaksi karena tidak bisa mengakses fitur PIN. Gunakan aplikasi ini hanya untuk penggunaan pribadi.

> [!IMPORTANT]
> **DISCLAIMER & TANGGUNG JAWAB**: Dengan menginstal dan menggunakan aplikasi ini, Anda menyatakan sadar dan setuju bahwa aplikasi ini akan menggunakan token sesi Stockbit Anda untuk keperluan sinkronisasi data. Pengguna memahami sepenuhnya cara kerja aplikasi ini dan membebaskan pengembang dari segala tuntutan hukum atau kerugian yang mungkin timbul. Pengembang tidak bertanggung jawab atas penyalahgunaan akses jika URL aplikasi Anda diketahui oleh pihak lain.

![Sahamology Preview 1](public/sahamology01.PNG)

---

💡 **Credit Rumus**: Algoritma dan rumus analisis dalam aplikasi ini didasarkan pada metodologi dari **[Adi Sucipto](https://www.instagram.com/adisuciipto/)**.

---

## Changelog

### Unreleased / v0.25.0 (draft) — Phase 21: Cumulative Volume Delta (CVD) Proxy, Foreign Tape Aggression & Passive Absorption Divergence Engine
Phase 21 introduces the **Cumulative Volume Delta (CVD) Proxy, Foreign Tape Aggression & Passive Absorption Divergence Engine**, formalizing single-bar volume delta proxies (Close Location Value + Open-to-Close displacement weighting), multi-session rolling Cumulative Volume Delta (CVD 20d & 50d), Foreign Tape Aggression Ratio (HAKA vs HAKI participation), and order flow divergence detection (Bullish Absorption vs Bearish Exhaustion) for the Indonesia Stock Exchange.

### Unreleased / v0.24.0 (draft) — Phase 20: Corporate Actions, Ex-Date Dividend Arbitrage & Rights Issue Dilution Risk Engine
Phase 20 introduces the **Corporate Actions, Ex-Date Dividend Arbitrage & Rights Issue Dilution Risk Engine**, formalizing cash dividend yield quantification, historical Ex-Date drop ratios, Dividend Trap Risk Scoring (0–100), Pre-Cum Run-Up momentum window detection ($5 \le T_{\text{cum}} \le 20$), and Rights Issue (HMETD) dilution percentage, exercise price discount, and Standby Buyer (Pembeli Siaga) commitments for the Indonesia Stock Exchange.

### Unreleased / v0.23.0 (draft) — Phase 19: Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine
Phase 19 introduces the **Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine**, formalizing 15-minute Initial Balance ($IB_{15}$: 09:00–09:15 WIB), 60-minute Initial Balance ($IB_{60}$: 09:00–10:00 WIB), Steidlmayer Auction Market Profile day type classifications (`TREND_DAY_EXPANSION`, `NORMAL_VARIATION_DAY`, `FAILED_BREAKOUT_TRAP`, `NEUTRAL_ROTATIONAL_DAY`), range extension targets ($R_1, R_2, S_1, S_2$), and direct synergy with the $V_{15m}$ pre-market battle plan volume rules for the Indonesia Stock Exchange.

📜 Riwayat versi sebelumnya ada di **[CHANGELOG.md](CHANGELOG.md)**.

---

## Fitur Utama

- **Cumulative Volume Delta (CVD) & Tape Aggression (Phase 21)**: Kalkulasi delta volume single-bar (bobot Close Location Value + Open-to-Close), akumulasi rolling CVD multi-sesi (20d & 50d), Rasio Agresi Tape Asing (HAKA vs HAKI), serta deteksi divergensi order flow (*Bullish Absorption* saat pembeli pasif institusi menyerap tekanan jual & *Bearish Exhaustion*) di laci inspeksi `/radar` dan kartu battle plan `/desk`.
- **Corporate Actions, Dividend Trap & Rights Dilution (Phase 20)**: Penilai risiko Dividend Trap (0–100) dan kalkulasi rasio penurunan harga historis Ex-Date vs DPS memproteksi modal dari jebakan dividen nominal tinggi. Mengidentifikasi jendela peluang *Pre-Cum Dividend Run-Up* ($5 \le T_{\text{cum}} \le 20$), menghitung Harga Teoritis Rights Issue ($P_{\text{teoritis}}$), rasio dilusi, diskon harga tebus, dan komitmen Pembeli Siaga (Standby Buyer) di laci inspeksi `/radar` serta kartu battle plan `/desk`.
- **Opening Range Breakout (ORB) & Initial Balance (Phase 19)**: Identifikasi rentang pembukaan Initial Balance 15 menit ($IB_{15}$: 09:00–09:15 WIB) dan 60 menit ($IB_{60}$: 09:00–10:00 WIB), target ekstensi likuiditas ($R_1, R_2, S_1, S_2$), profil tipe hari bursa Steidlmayer (`TREND_DAY_EXPANSION`, `NORMAL_VARIATION_DAY`, `FAILED_BREAKOUT_TRAP`), dan konfirmasi volume $V_{15m}$ di laci inspeksi `/radar` serta kartu battle plan `/desk`.
- **Multi-Timeframe Alignment & Institutional Trend Matrix (Phase 18)**: Integrasi Triple Screen Alexander Elder dan Analisis Tahapan Stan Weinstein mengagregasikan candle mingguan sintetis untuk menilai Arus Utama Mingguan (Tahap 1–4, $\text{EMA}_{10\text{w}}$, $\text{EMA}_{30\text{w}}$, slope 30w) terhadap Gelombang Harian ($\text{EMA}_{20}$, $\text{SMA}_{50}$, $\text{SMA}_{200}$). Menghitung matriks keselarasan (`PERFECT_TIDE_ALIGNMENT`, `HIGH_PROBABILITY_PULLBACK`, `RANGE_BOUND_COMPRESSION`, `COUNTER_TREND_TRAP_HAZARD`, `SECULAR_LIQUIDATION`) dan penskalaan risiko ukuran lot ($0.00\times$ hingga $1.00\times$) di laci inspeksi `/radar` dan kartu battle plan `/desk`.
- **Smart Money Concepts (SMC: Order Blocks & FVG) (Phase 17)**: Deteksi jejak algoritma institusi melalui Break of Structure (BOS), Change of Character (CHoCH), Order Block (OB) origin dengan pelacakan mitigasi, Fair Value Gap (FVG) dengan Consequent Encroachment (CE 50%), serta Turtle Soup liquidity sweeps. Ditampilkan di laci inspeksi `/radar` dan kartu battle plan `/desk`.
- **Anchored VWAP & Bandar Benchmark (Phase 16)**: Perhitungan volume-weighted average price multi-titik anchor (Basis Akumulasi, Klimaks Volume Whale, Puncak 52-Minggu) dan Bandar VWAP (rata-rata harga modal broker akumulator Top 3 & Top 5 dari broker summary EOD) dengan pita volatilitas $\pm 1\sigma, \pm 2\sigma$. Memetakan zona pertahanan institusi (*Institutional Defense*) dan ekspansi nilai tanpa hambatan di laci inspeksi `/radar` serta kartu battle plan `/desk`.
- **IDX Market Breadth & Composite Liquidity (Phase 15)**: Pengukuran partisipasi pasar luas IDX memisahkan akumulasi institusi riil dari manipulasi bobot konglomerat IHSG. Menghitung rasio Advance/Decline (A/D), persentase emiten di atas moving average ($> \text{EMA}_{20}$, $> \text{SMA}_{50}$, $> \text{SMA}_{200}$), ekspansi 52-Week High/Low net, serta mengklasifikasikan 5 rezim pasar bursa deterministik (`BULLISH_EXPANSION`, `HEALTHY_PULLBACK`, `BREADTH_DIVERGENCE_WARNING`, `BEARISH_DISTRIBUTION`, `OVERSOLD_CAPITULATION`) dengan visualisasi interaktif di `/desk` dan `/radar`.
- **Volatility Contraction Pattern (VCP) & Trend Template (Phase 14)**: Engine pengenalan pola VCP Minervini (SEPA) mendeteksi kompresi volatilitas progresif ($T_1 > T_2 > T_3 > T_4$), pengeringan volume pasokan ($\le 0.60 \times \text{SMA}_{50}$), level trigger cheat/pivot breakout, serta stop loss asimetris ketat (1 tick di bawah wave terakhir) dengan verifikasi 6 kriteria Stage 2 Trend Template.
- **Cross-Sector Capital Rotation (Phase 13)**: Engine rotasi sektoral multi-sesi memetakan pergerakan modal institusi dan Relative Strength (RS) terhadap IHSG ke dalam kuadran rotasi (`LEADING`, `IMPROVING`, `WEAKENING`, `LAGGING`). Mengidentifikasi *Sector Tailwind* (`🌊`) dan *Sector Headwind* (`⚠️`) pada `/radar` dan Battle Plan `/desk` tanpa melanggar batasan gerbang nol-stance G0–G4.
- **Cognitive Post-Trade Journal & Tilt Lockout (Phase 12)**: Audit psikologis dan disiplin eksekusi pasca-trade mendeteksi deviasi perilaku (FOMO entry slippage, pelebaran stop-loss, exit prematur, oversizing lot, revenge trading). Menghitung Skor Disiplin ($0$–$100$) serta mengelola modal psikologis dengan proteksi *Trader Tilt Lockout* otomatis.
- **Volume Profile Liquidity Shelves (Phase 11)**: Distribusi likuiditas volume-by-price fraksi harga IDX menghitung Point of Control (POC), 70% Value Area (VAH/VAL), serta kluster HVN/LVN untuk konfluensi entri di laci inspeksi `/radar` dan kartu battle plan `/desk`.
- **Wyckoff Structural Screener & VSA (Phase 10)**: Identifikasi batas trading range (Ice support & Creek resistance), deteksi event struktural (Selling Climax, Spring, Sign of Strength, Upthrust), dan klasifikasi fase akumulasi Wyckoff (Fase A hingga E) dengan konfluensi Brosum AQS.
- **Macro Dynamic Overlay & Tranche Execution (Phase 9)**: Pelacakan keputusan suku bunga RDG Bank Indonesia, Rupiah Pressure Index (RPI: 0–100) dari kecepatan spot USD/IDR, pengetatan stop & peningkatan konfirmasi volume $V_{15m}$ saat HEADWIND, serta pemecahan eksekusi order institusi menjadi 3 tranche (30%-40%-30%) sesuai batas fraksi dan antrean pasar IDX.
- **The Institutional Trading Lifecycle (Phase 8)**: Siklus perdagangan institusional lengkap mencakup multi-window broker absorption (AQS 0–100), pelacakan divergensi paus asing vs domestik berskala ADTV, rencana tempur pra-pasar 08:30 WIB ($V_{15m}$ rule), radar tape anomaly crossing Pasar Nego, position sizer fraksi IDX dengan pagu ekuitas 20%, dan audit slippage pasca-trade.
- **Ranked Desk (Phase 5)**: Halaman `/desk` meranking kartu jurnal tersimpan (`ENTER > WAIT > TAKE_PROFIT > INVALIDATED > AVOID`, lalu R:R), menampilkan kartu pagi, dan menjelaskan setiap WAIT/AVOID dari reason gate yang tersimpan. Baris AVOID disembunyikan secara default di belakang toggle `Tampilkan AVOID`; TAKE_PROFIT tetap terlihat. **Bukan evaluasi ulang.** Phase 4 tetap capture-complete (`VERDICT_UNREACHABLE`); tidak ada profil yang di-arm. Outcome ENTER diisi oleh `npm run backfill:outcomes` hanya setelah horizon N=5 lengkap — yang belum terskor tetap NULL. Phase 6 menambahkan health live-only, skip hari libur IDX, dan deadline Stockbit fail-closed tanpa meng-arm gate.
- **Analisis Target**: Menghitung target harga "Realistis (R1)" dan "Maksimal" berdasarkan rata-rata harga pembelian broker (Avg Bandar).
- **Decision Card (Playbook G0–G4)**: Setiap analisis memunculkan stance deterministik (`ENTER` / `WAIT` / `AVOID` / `TAKE_PROFIT`) berdasarkan gate kuantitatif: integritas data (G0), kualitas broker akumulator Smartmoney/Whale (G1), ruang menuju ARA dan kesehatan buku (G2), risk-reward bersih ≥ 1.5 setelah friksi IDX dengan invalidation ATR(14) (G3), dan **tape filter 20-EMA + 3 pola allow-list** (G4, aktif di Phase 1). TradingView tidak pernah menjadi input gate — murni tampilan.
- **Baseline Backtest (Adi-Only)**: CLI `npm run baseline:backtest` mensimulasikan setiap sinyal harian terhadap candle 5 hari bursa berikutnya dan mempublikasikan expectancy, profit factor, win rate, serta touch R1. Setiap layer analisis baru wajib mengalahkan baseline ini out-of-sample sebelum di-merge.
- **G4 Walk-Forward**: CLI `npm run walkforward:g4` membandingkan kartu Phase 0 (G0–G3, stop interim) vs kartu Phase 1 (G0–G4, stop ATR) pada pemisahan kronologis 80/20 dengan purge gap 5 sesi bursa. Ship gate PASS hanya jika Phase 1 unggul expectancy & profit factor pada out-of-sample dengan ≥ 30 trade ENTER.
- **Persistensi & Micro (Phase 2, default-off)**: G1 membaca akumulasi/distribusi, persistensi bandar berulang, dan aliran broker akumulator teratas. `PLAYBOOK_G1_PROFILE` tetap `phase-1` sampai ship gate lulus, jadi perilaku live tidak berubah. CLI `npm run walkforward:p2` membandingkan kartu Phase 2 vs Phase 1 pada sinyal dan bar horizon yang identik. Selama sampel OOS masih di bawah 30 (Phase 2) / 50 (Phase 1) ENTER, reporter mencetak `SHIP_GATE=VERDICT_UNREACHABLE` — bukan `FAIL` — karena gate belum bisa dihakimi, bukan karena gagal.
- **Regime Makro (Phase 4, default-off)**: G7 membaca regime makro dari IHSG, USD/IDR, dan harga emas, lalu menurunkan `ENTER` menjadi `WAIT` — **satu anak tangga saja, tidak pernah `AVOID`**. `PLAYBOOK_G7_PROFILE` default `off`. **Belum tervalidasi, dan memang klausa-armed-nya kosong sekarang**: studi korelasi `npm run macro:correlation` mengaktifkan **0 dari 3** klausa pada data yang ada, karena 13 sinyal pada 3 tanggal jauh di bawah lantai 30 observasi yang dibutuhkan sebuah bound. Klausa tanpa bound tidak bisa menyala, jadi `npm run walkforward:p4` mencetak `SHIP_GATE=VERDICT_UNREACHABLE` — bukan `FAIL`. Data hilang gagal *open*, persis seperti G5. Leg USD/IDR membaca **spot pasar**, bukan JISDOR resmi Bank Indonesia; sistem menamainya `USDIDR` dan memperlakukannya sebagai *proxy*, tidak pernah mengklaim sama dengan JISDOR.
- **Fundamental Veto (Phase 3, default-off)**: G5 menolak setup `ENTER` pada emiten distress — ekuitas negatif, leverage ekstrem, atau skor Altman Z negatif. Emiten keuangan (bank) **dikecualikan** lewat metrik regulator eksklusif, karena leverage bank yang sehat secara struktural tinggi. `PLAYBOOK_G5_PROFILE` default `off`; use `visible` untuk melihat skor tanpa veto, `veto` untuk mengaktifkannya. **Belum tervalidasi**: `npm run walkforward:p3` mencetak `VERDICT_UNREACHABLE` selama sampel OOS masih tumbuh, dan data historis ~14 bulan pertama memang tidak ada kolom fundamental. G5 hanya bisa menurunkan `ENTER` → `AVOID`, tidak pernah menaikkan; data hilang gagal *open*.
- **Price History & Backfill**: Tabel `price_history` menyimpan OHLCV harian per emiten; `npm run backfill:history` menarik riwayat dari Stockbit secara terpaginasi untuk menopang evaluasi sinyal tanpa lookahead.
- **Trading Journal**: Migrasi `020_decision_journal.sql` menyimpan audit trail stance, target, invalidation, dan hasil realisasi.
- **Summary & Performance Dashboard**: Melacak hit rate target emiten dan dominasi bandar dalam rentang waktu tertentu.
- **Data Terintegrasi Stockbit**: Mengambil data transaksi broker summary.
- **History & Watchlist**: Menyimpan riwayat analisis untuk dipantau di kemudian hari.
- **Sync Watchlist & Hapus Otomatis**: Menampilkan watchlist langsung dari akun Stockbit termasuk fungsi delete.
- **Tracking Real Harga**: Otomatis memperbarui harga riil di hari bursa berikutnya untuk memverifikasi target.
- **Sistem Background Job & Retry**: Pemantauan status background job (analisis otomatis) dengan tombol **Retry** untuk menjalankan ulang job yang gagal.
- **Advanced Charts (TradingView & Chartbit)**:
  - Integrasi grafis dengan **Chartbit**.
  - Integrasi **TradingView Advanced Chart** (widget embed) sebagai **tampilan saja**. Indikator RSI/oversold di chart tidak pernah dipakai sebagai input Decision Card; semua angka gate dihitung deterministik dari `lib/tape` dan `lib/playbook`, bukan dari iframe TradingView.
- **Filter Flag & Watchlist**: Filter cepat berdasarkan flag emiten dan watchlist untuk mempermudah pemantauan portfolio.
- **Ringkasan Broker (Top 1, 3, 5)**: Visualisasi kekuatan akumulasi vs distribusi broker.
- **AI Story Analysis**: Analisis berita dan sentimen pasar menggunakan AI (Gemini) untuk merangkum story, SWOT, dan katalis emiten secara instan. Model AI **dilarang** memproduksi angka harga (entry/take-profit/stop-loss); seluruh level harga dihitung deterministik oleh `lib/calculations.ts` dan `lib/playbook.ts`.
- **Multi-Version Analysis**: Menyimpan dan menampilkan riwayat analisis AI sebelumnya sehingga Anda bisa melacak perubahan narasi pasar dari waktu ke waktu.
- **Export to PDF**: Unduh laporan riwayat analisis dalam format PDF yang rapi.
- **Password Protection**: Proteksi keamanan akses aplikasi untuk menjaga privasi data dan token sesi Anda (scrypt, migrasi otomatis dari SHA-256 lama).

---

## Tech Stack

- **Frontend**: [Next.js 16 (App Router)](https://nextjs.org/), React 19, Tailwind CSS 4.
- **Backend/Database**: PostgreSQL 16 via native `pg` (`lib/db.ts`), migrations dari `supabase/*.sql`.
- **Deployment**: Docker Compose (app + PostgreSQL + Redis), atau PM2 (`ecosystem.config.js`) dengan Next.js standalone output.
- **Queue/Background**: Redis 7 + BullMQ, worker embedded di proses Next.js (`instrumentation.ts`).
- **AI Engine**: [Google Gemini](https://ai.google.dev/) dengan Google Search Grounding, atau endpoint OpenAI-compatible (`LLM_PROVIDER=openai`).
- **Tools**: `jspdf`, `html-to-image`, & `html2canvas` untuk ekspor PDF dan capture image, `lucide-react` untuk ikon.

---

## Pilih Opsi Instalasi

Pilih salah satu opsi instalasi yang sesuai dengan kebutuhan Anda:

| | **OPSI A: CLOUD / VPS** | 💻 **OPSI B: LOKAL** |
|---|---|---|
| **Platform** | Docker Compose di server publik | Docker Compose di PC |
| **Akses** | Dari mana saja via URL | Hanya dari komputer Anda |
| **Scheduled Jobs** | ✅ Otomatis (BullMQ cron) | ✅ Otomatis (BullMQ cron) |
| **Biaya** | Sesuai biaya server | Gratis (self-hosted) |
| **Cocok untuk** | Penggunaan harian | Development/testing |

---

# OPSI A: Deploy ke Cloud / VPS (Docker + PostgreSQL)

Opsi ini direkomendasikan untuk penggunaan harian karena aplikasi akan berjalan secara otomatis di server dan dapat diakses dari mana saja.

👉 **[Lihat Panduan Deploy Cloud Selengkapnya](https://github.com/dikotiledon/sahamology/wiki/Deploy-Cloud)**

---

# OPSI B: Instalasi Lokal (Docker + PostgreSQL)

Opsi ini cocok untuk pengembangan atau jika Anda hanya ingin menjalankan aplikasi di komputer sendiri.

👉 **[Lihat Panduan Instalasi Lokal Selengkapnya](https://github.com/dikotiledon/sahamology/wiki/Deploy-Local)**

---

## Self-Hosted Runbook (Lengkap)

Panduan operasional lengkap (arsitektur, topologi jaringan, perintah verifikasi, troubleshooting) tersedia di:

👉 **[Self-Hosted Runbook](https://github.com/dikotiledon/sahamology/wiki/Self-Hosted)**

---

## Troubleshooting
 
👉 **[Punya masalah? Lihat Checkpoint Troubleshooting](https://github.com/dikotiledon/sahamology/wiki/Checkpoint)**

---

## Referensi Environment Variables

| Variable | Cloud | Lokal | Deskripsi |
|----------|:-----:|:-----:|-----------|
| `POSTGRES_PASSWORD` | ✅ | ✅ | Password database PostgreSQL |
| `APP_BASE_URL` | ✅ | ✅ | URL publik aplikasi (contoh: `http://192.168.1.4:3000`) |
| `CRON_SECRET` | ✅ | ✅ | Secret untuk trigger cron/worker |
| `AUTH_SECRET` | ✅ | ✅ | Secret HMAC untuk sesi login |
| `GEMINI_API_KEY` | ⚠️ | ⚠️ | API Key Google AI Studio (provider `gemini`) |
| `GEMINI_STORY_MODEL` | ❌ | ❌ | Model Gemini untuk AI Story Analysis (default: `gemini-3-flash-preview`) |
| `GEMINI_STORY_THINKING_LEVEL` | ❌ | ❌ | Thinking level Gemini: `MINIMAL`/`LOW`/`MEDIUM`/`HIGH` (default: `HIGH`) |
| `LLM_PROVIDER` | ❌ | ❌ | `gemini` (default) atau `openai`. Mode `openai` memakai endpoint chat compatible dan tidak menjalankan Google Search |
| `LLM_BASE_URL` | ❌ | ❌ | Base URL OpenAI-compatible. Wajib saat `LLM_PROVIDER=openai`. Kode menambahkan `/chat/completions` |
| `LLM_API_KEY` | ❌ | ❌ | Bearer key untuk endpoint OpenAI-compatible. Wajib saat `LLM_PROVIDER=openai` |
| `LLM_MODEL` | ❌ | ❌ | Nama model di endpoint OpenAI-compatible (contoh: `power`, `agmanager/gemini-3.8-flash-high`). Wajib saat `LLM_PROVIDER=openai`; tidak ada default |
| `STOCKBIT_JWT_TOKEN` | ❌ | ⚠️ | Fallback token manual |
| `PORT` | ❌ | ✅ | Port bind server standalone (default `3000`) |
| `INTERNAL_API_URL` | ❌ | ✅ | URL loopback untuk self-call scheduler/worker. **Wajib sama dengan `PORT`** — `lib/config.ts` memakai nilai ini apa adanya, jadi kalau `.env` meng-pin `http://127.0.0.1:3000` sementara server jalan di port lain, instrumentation/worker timeout `ETIMEDOUT` |

### Menjalankan di port lain

```bash
PORT=3411 INTERNAL_API_URL=http://127.0.0.1:3411 npm run start
```

Kalau muncul `EADDRINUSE` padahal `ss -tlnp` bilang port itu kosong, di WSL itu biasanya proses **di sisi Windows** yang memegang port tersebut (WSL mirrored networking tidak menampilkannya). Cek dari PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { (Get-Process -Id $_).ProcessName }
```

Umum di mesin ini: `com.docker.backend` (Docker Desktop) memegang port 3000.

---

## Lisensi

Aplikasi ini dilisensikan di bawah MIT License.

Copyright (c) 2026 Bhakti Utama.

Izin diberikan, secara gratis, kepada siapa pun yang mendapatkan salinan perangkat lunak ini untuk menggunakannya tanpa batasan, termasuk hak untuk menggunakan, menyalin, memodifikasi, menggabungkan, menerbitkan, mendistribusikan, menyisipkan lisensi, dan/atau menjual salinan perangkat lunak ini. 

Proyek ini dibuat untuk tujuan edukasi dan penggunaan pribadi. Pastikan untuk mematuhi ketentuan penggunaan layanan pihak ketiga yang digunakan.
