# Cloudflare Tunnel — Hindsight Local Access

Goal: expose the local Hindsight instance (`http://192.168.1.4:8888`) to the self-hosted
Sahamology server through a **private, token-authenticated HTTPS hostname**, without exposing
it to the public internet.

```
Sahamology (Docker/PM2)  --HTTPS-->  Cloudflare edge (Access: service-token auth)
                                        |
                                   cloudflared tunnel (runs on 192.168.1.4, outbound-only)
                                        |
                                   http://localhost:8888  (Hindsight)
```

## 0. Prerequisites

- A Cloudflare account with a **zone/domain** (e.g. `example.com`). Token auth requires a real zone;
  a `trycloudflare.com` quick tunnel cannot do edge token auth and uses a throwaway URL.
- Shell access to the Linux Mint server `192.168.1.4` (where Hindsight runs).
- Hindsight listening on `localhost:8888` on that server.

> ⚠️ Hindsight currently has **no built-in auth** (`securitySchemes: {}` in OpenAPI). The token in this
> design is enforced **at the Cloudflare edge** (Cloudflare Access), not by Hindsight.

## 1. Install cloudflared on 192.168.1.4

```bash
# amd64 (adjust arch if needed: arm64, armhf)
ARCH=amd64
curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared --version
```

## 2. Authenticate the tunnel to your Cloudflare account

```bash
cloudflared tunnel login
# Opens a browser; pick the zone/domain you want to use.
# Stores cert.pem under ~/.cloudflared/
```

## 3. Create a named tunnel + config

```bash
cloudflared tunnel create hindsight
# => outputs TUNNEL_UUID; writes ~/.cloudflared/<uuid>.json
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: hindsight
credentials-file: /home/<user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: hindsight.memory.example.com
    service: http://localhost:8888
  - service: http_status:404
```

> The tunnel process must run **on 192.168.1.4** so `localhost:8888` is the Hindsight box.
> If Hindsight is not on loopback, use its real bind address (e.g. `http://192.168.1.4:8888`).

## 4. Create the DNS route

```bash
cloudflared tunnel route dns hindsight hindsight.memory.example.com
```

## 5. Run as a systemd service (survives reboot)

```bash
sudo cloudflared service install   # installs cloudflared.service using ~/.cloudflared/config.yml
sudo systemctl enable --now cloudflared
systemctl status cloudflared
```

## 6. Lock the hostname with Cloudflare Access (the token auth)

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain: `hindsight.memory.example.com`.
3. Policy: name `service-token`, action **Service Auth**, create a service token (keep `Client ID` + `Client Secret`).
4. Verify the edge blocks anonymous requests:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://hindsight.memory.example.com/health/live   # expect 302/403
   ```
   With the token:
   ```bash
   curl -s https://hindsight.memory.example.com/health/live \
     -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
   ```

## 7. Point Sahamology at it

Environment variables (`.env`):

```bash
HINDSIGHT_ENABLED=true
HINDSIGHT_API_URL=https://hindsight.memory.example.com
HINDSIGHT_BANK_ID=sahamology
HINDSIGHT_CF_ACCESS_CLIENT_ID=xxxx.access
HINDSIGHT_CF_ACCESS_CLIENT_SECRET=xxxxxxxx
```

`lib/hindsight.ts` must attach the two `CF-Access-*` headers on every request:

```ts
headers: {
  'Content-Type': 'application/json',
  ...(process.env.HINDSIGHT_CF_ACCESS_CLIENT_ID
    ? {
        'CF-Access-Client-Id': process.env.HINDSIGHT_CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': process.env.HINDSIGHT_CF_ACCESS_CLIENT_SECRET ?? '',
      }
    : {}),
}
```

> `lib/hindsight.ts` stays **server-only**. The service-token secret must never reach a client bundle.

## 8. Fallback for quick local-only dev (no token auth)

If a real zone/Cloudflare Access is not available yet, a **quick tunnel** works for local dev only
(throwaway URL, no auth, dies with the process):

```bash
cloudflared tunnel --url http://localhost:8888
# => https://<random>.trycloudflare.com
```

Use it only temporarily in `.env.local`; do **not** put it in production environment variables.

## 9. Security checklist

- [ ] Service-token secret only in `.env` / `.env.local`, never in git or frontend bundle.
- [ ] Access policy is **Service Auth** (machine auth), not an open "Allow everyone" policy.
- [ ] `enable_reranking` stays `false` on the `sahamology` bank.
- [ ] Only non-secret observations are retained (no Stockbit tokens / passwords).
- [ ] Cloudflared service enabled on boot.
