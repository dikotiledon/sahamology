# Checkpoint Troubleshooting Koneksi

Jika status di aplikasi masih **"Disconnected"** atau data tidak muncul, silakan lakukan pemeriksaan poin-poin berikut:

## 1. Konfigurasi Ekstensi Chrome

- **manifest.json** (folder `stockbit-token-extension/dist/`):
  - Pastikan `host_permissions` berisi URL aplikasi Anda.
  - Format: `http://localhost:3000/*` (lokal) atau `https://your-domain.com/*` (harus diakhiri dengan `/*`).
- **background.js**:
  - Default target adalah `http://localhost:3000/api/update-token`.
  - Untuk target lain, set dari service-worker console:
    ```javascript
    chrome.storage.local.set({ appApiUrl: "https://your-domain.com/api/update-token" });
    ```
- **Refresh Ekstensi**:
  - Jika Anda baru saja mengubah kode, buka `chrome://extensions/`, klik tombol **Refresh** (ikon putar) pada ekstensi, lalu refresh halaman Stockbit.

## 2. Struktur Database PostgreSQL

Pastikan tabel sudah terbentuk di container database:

```bash
docker compose exec db psql -U sahamology -d sahamology -c "\dt"
```

Tabel utama yang harus ada: `session`, `stock_queries`, `agent_stories`, `background_job_logs`, `profile`, `watchlist_cache`, `emiten_flags`.

Jika tabel tidak ada, jalankan migrasi:

```bash
docker compose exec app npm run migrate
```

## 3. Environment Variables (.env)

Pastikan di file `.env` variabel berikut sudah benar dan tidak ada typo:

| Key | Catatan |
|---|---|
| `POSTGRES_PASSWORD` | Harus sama dengan yang dipakai container `db` saat pertama kali dibuat |
| `APP_BASE_URL` | Harus sesuai URL yang dipakai browser/ekstensi |
| `CRON_SECRET` | Bebas, tapi jangan kosong |
| `AUTH_SECRET` | Bebas, tapi jangan kosong |
| `LLM_PROVIDER` | `gemini` atau `openai` |
| `GEMINI_API_KEY` | Wajib valid jika `LLM_PROVIDER=gemini` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Wajib jika `LLM_PROVIDER=openai` |

Setelah mengubah `.env`, jalankan ulang:

```bash
docker compose up -d
```

## 4. Verifikasi Chrome Extension

1. Buka `chrome://extensions/`.
2. Klik **Service Worker** pada ekstensi Stockbit Token Syncer.
3. Jika ekstensi bekerja, Anda akan melihat log seperti: `Token successfully synced to API.`
4. Jika ada error merah, silakan screenshot dan tanyakan di group/issue.

## 5. Periksa Log Aplikasi

```bash
docker compose logs -f app
```

Perhatikan baris seperti:
- `[Story Job] Starting background analysis...`
- `[Story Job] Analysis completed for BBCA in ...s`
- `[Queue] BullMQ workers started (watchlist-analysis, story-analysis)`

Jika worker tidak muncul, pastikan Redis berjalan sehat: `docker compose ps` (kolom `sahamology-redis` harus `Up (healthy)`).

---

*Kembali ke [Halaman Utama Wiki](Home)*
