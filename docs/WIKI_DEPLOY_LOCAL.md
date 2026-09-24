# OPSI B: Instalasi Lokal (Docker + PostgreSQL)

Ikuti langkah-langkah berikut secara berurutan untuk menjalankan Sahamology di komputer sendiri.

## B1. Prasyarat

1. Install **Docker Desktop** untuk OS Anda:
   - Windows/Mac: <https://www.docker.com/products/docker-desktop/>
   - Linux: Docker Engine + Compose v2
2. Pastikan Docker sedang berjalan.

## B2. Clone & Konfigurasi

1. Clone repository:

   ```bash
   git clone https://github.com/dikotiledon/sahamology.git
   cd sahamology
   ```

2. Salin template environment:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` dan isi variabel berikut:

   ```env
   POSTGRES_PASSWORD=password-kuat-pilihanmu
   APP_BASE_URL=http://localhost:3000
   CRON_SECRET=rahasia-cron
   AUTH_SECRET=rahasia-sesi-panjang
   # --- AI Story: pilih salah satu provider ---
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=AIza...
   # ATAU pakai OpenAI-compatible:
   # LLM_PROVIDER=openai
   # LLM_BASE_URL=http://192.168.1.4:20128/v1
   # LLM_API_KEY=sk-...
   # LLM_MODEL=power
   ```

   | Variable | Nilai | Wajib |
   |----------|-------|:-----:|
   | `POSTGRES_PASSWORD` | Password database (ganti dari default) | ✅ |
   | `APP_BASE_URL` | `http://localhost:3000` (atau IP LAN) | ✅ |
   | `CRON_SECRET` | Secret untuk trigger cron/worker | ✅ |
   | `AUTH_SECRET` | Secret HMAC untuk sesi login | ✅ |
   | `GEMINI_API_KEY` | API Key dari [Google AI Studio](https://aistudio.google.com/) — provider `gemini` | ⚠️ |
   | `LLM_PROVIDER` | `gemini` (default) atau `openai` | ❌ |
   | `LLM_BASE_URL` | Base URL OpenAI-compatible. Wajib saat `LLM_PROVIDER=openai` | ❌ |
   | `LLM_API_KEY` | Bearer key endpoint OpenAI-compatible. Wajib saat `LLM_PROVIDER=openai` | ❌ |
   | `LLM_MODEL` | Nama model (contoh: `power`, `agmanager/gemini-3.8-flash-high`). Wajib saat `LLM_PROVIDER=openai` | ❌ |
   | `STOCKBIT_JWT_TOKEN` | Fallback token manual (opsional, ekstensi lebih baik) | ❌ |

   > **CATATAN**: Background worker (BullMQ + Redis) berjalan *embedded* di proses Next.js. Tidak ada Netlify Functions — AI Story Analysis berjalan lewat `instrumentation.ts` → queue worker.

## B3. Jalankan Aplikasi

```bash
docker compose up -d --build
```

Aplikasi akan berjalan di [http://localhost:3000](http://localhost:3000).

Cek status container:

```bash
docker compose ps
docker compose logs -f app
```

Migrasi database dijalankan otomatis saat startup. Untuk manual:

```bash
docker compose exec app npm run migrate
```

## B4. Setup Chrome Extension (untuk Lokal)

1. Buka folder `stockbit-token-extension/dist/` — sudah berisi `manifest.json` dan `background.js` siap pakai.
2. (Opsional) Jika ingin kustomisasi, duplikat file `.example` di folder induk.
3. Buka `chrome://extensions/` → aktifkan **Developer mode** → **Load unpacked** → pilih `stockbit-token-extension/dist`.
4. Default target sudah `http://localhost:3000/api/update-token`. Jika aplikasi diakses dari perangkat lain (LAN), set URL dari service-worker console ekstensi:

   ```javascript
   chrome.storage.local.set({ appApiUrl: "http://192.168.1.4:3000/api/update-token" });
   ```

## B5. Verifikasi Instalasi

1. Pastikan aplikasi berjalan (`docker compose ps`).
2. Buka [Stockbit](https://stockbit.com/) dan login.
3. Ekstensi otomatis menangkap token dan mengirimkannya ke `/api/update-token`.
4. Buka [http://localhost:3000](http://localhost:3000).
5. Cek indikator koneksi Stockbit — harus menunjukkan **Connected/Valid**.
6. Coba analisis saham pertama Anda! 🎉

---

*Kembali ke [Halaman Utama Wiki](Home)*
