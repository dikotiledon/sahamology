# Sahamology — Self-Hosted Deployment Runbook

This guide covers deploying Sahamology without Netlify or Supabase on four
topologies: **localhost**, **home/office LAN**, **reverse proxy**, and
**public IP / VPS**. The stack is Next.js (standalone output) + PostgreSQL 16 +
Redis 7 with BullMQ workers embedded in the Next.js server process.

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
   │     └── story-analysis
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
npm test              # 7 tests (story-analysis + db jsonb serialization)
npm run lint          # eslint flat config
npm run migrate       # apply supabase/*.sql via DATABASE_URL
```

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
