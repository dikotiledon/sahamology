# OPSI A: Deploy ke Cloud / VPS (Docker + PostgreSQL)

Ikuti langkah-langkah berikut secara berurutan untuk menjalankan Sahamology di server publik (VPS, VM, atau dedicated server) menggunakan Docker Compose.

## A1. Prasyarat Server

1. Server Linux dengan **Docker Engine** dan **Docker Compose v2** terpasang.
   - Docker: <https://docs.docker.com/engine/install/>
   - Compose: sudah termasuk dalam Docker Desktop / plugin `docker-compose`.
2. Pastikan port **3000** terbuka di firewall server (atau port lain yang Anda pilih lewat `APP_PORT`).

## A2. Clone & Konfigurasi

1. Clone repository:

   ```bash
   git clone https://github.com/dikotiledon/sahamology.git
   cd sahamology
   ```

2. Salin template environment:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` dan isi variabel berikut (minimal):

   | Variable | Nilai | Wajib |
   |----------|-------|:-----:|
   | `POSTGRES_PASSWORD` | Password database PostgreSQL (ganti dari default) | ✅ |
   | `APP_BASE_URL` | URL publik aplikasi, contoh `https://stocks.example.com` atau `http://<IP_PUBLIK>:3000` | ✅ |
   | `CRON_SECRET` | Secret untuk trigger cron/worker internal | ✅ |
   | `AUTH_SECRET` | Secret HMAC untuk sesi login (string acak panjang) | ✅ |
   | `GEMINI_API_KEY` | API Key dari [Google AI Studio](https://aistudio.google.com/) — untuk provider `gemini` | ⚠️ |
   | `LLM_PROVIDER` | `gemini` (default) atau `openai` | ❌ |
   | `LLM_BASE_URL` | Base URL OpenAI-compatible (contoh: `http://192.168.1.4:20128/v1`). Wajib saat `LLM_PROVIDER=openai` | ❌ |
   | `LLM_API_KEY` | Bearer key endpoint OpenAI-compatible. Wajib saat `LLM_PROVIDER=openai` | ❌ |
   | `LLM_MODEL` | Nama model (contoh: `power` atau `agmanager/gemini-3.8-flash-high`). Wajib saat `LLM_PROVIDER=openai` | ❌ |
   | `STOCKBIT_JWT_TOKEN` | Fallback token manual (opsional — ekstensi Chrome lebih baik) | ❌ |

   > **CATATAN**: AI Story Analysis bisa memakai salah satu dari dua provider:
   > - `LLM_PROVIDER=gemini` → memakai `GEMINI_API_KEY` + `GEMINI_STORY_MODEL`, dengan Google Search grounding.
   > - `LLM_PROVIDER=openai` → memakai `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` (endpoint OpenAI-compatible).

## A3. Jalankan Aplikasi

```bash
docker compose up -d --build
```

Aplikasi akan berjalan di `http://<IP_SERVER>:3000` (atau sesuai `APP_PORT`/`APP_BASE_URL`).

Cek status:

```bash
docker compose ps
docker compose logs -f app
```

## A4. Migrasi Database

Migrasi SQL (`supabase/*.sql`) dijalankan otomatis oleh container saat startup. Untuk menjalankannya manual:

```bash
docker compose exec app npm run migrate
```

## A5. Reverse Proxy (Opsional, HTTPS)

Untuk HTTPS, letakkan aplikasi di belakang reverse proxy (Caddy/Nginx) dan set `APP_BASE_URL` ke domain HTTPS. Cookie `Secure` otomatis aktif ketika request tiba lewat HTTPS (atau lewat `X-Forwarded-Proto: https`).

## A6. Setup Chrome Extension

1. Buka folder `stockbit-token-extension/dist/` di dalam repositori — folder ini sudah berisi `manifest.json` dan `background.js` siap pakai.
2. Jika ingin kustomisasi, duplikat file `.example` di folder induknya:
   - `manifest.json.example` → `manifest.json`
   - `background.js.example` → `background.js`
3. Buka `chrome://extensions/` → aktifkan **Developer mode** → klik **Load unpacked** → pilih folder `stockbit-token-extension/dist` (atau folder tempat Anda membuat file kustom).
4. Atur URL target (opsional, dari service-worker console ekstensi):

   ```javascript
   chrome.storage.local.set({ appApiUrl: "https://stocks.example.com/api/update-token" });
   ```

## A7. Verifikasi Instalasi

1. Buka [Stockbit](https://stockbit.com/) dan login.
2. Ekstensi otomatis menangkap token dan mengirimkannya ke `/api/update-token`.
3. Buka aplikasi Anda di `APP_BASE_URL`.
4. Cek indikator koneksi Stockbit — harus menunjukkan **Connected/Valid**.
5. Coba analisis saham pertama Anda! 🎉

---

*Kembali ke [Halaman Utama Wiki](Home)*
