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

### Unreleased / v0.17.0 (draft) — Phase 13: Cross-Sector Capital Rotation & Institutional Flow Matrix
Phase 13 introduces the **Cross-Sector Capital Rotation & Institutional Flow Momentum Matrix Engine**, formalizing Relative Strength ($RS$) benchmarking against IHSG, multi-session sectoral foreign net flow velocity ($5d, 20d$), RRG-adapted institutional quadrant classification (`LEADING`, `IMPROVING`, `WEAKENING`, `LAGGING`), and tactical execution confluence for the Discovery Radar and Pre-Market Battle Plan.

### Unreleased / v0.16.0 (draft) — Phase 12: Cognitive Post-Trade Journal & Trader Discipline Engine
Phase 12 introduces the **Cognitive Post-Trade Journal & Execution Discipline Engine**, formalizing post-trade execution audits, behavioral deviation detection (FOMO Chase, Stop Widening, Premature Exit, Oversizing, Revenge Trading), quantitative discipline scoring ($0$–$100$), and automated psychological capital tracking with Trader Tilt Lockout protection.

### Unreleased / v0.15.0 (draft) — Phase 11: Volume Profile Liquidity Shelves & Value Area Confluence
Phase 11 introduces **Volume Profile Liquidity Shelves & Value Area Confluence**, formalizing discrete intraday volume-by-price accumulation, Point of Control (POC) shelf identification, 70% Value Area (VAH, VAL) calculation via Auction Market Theory, and high/low volume node liquidity clustering.

📜 Riwayat versi sebelumnya ada di **[CHANGELOG.md](CHANGELOG.md)**.

---

## Fitur Utama

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
