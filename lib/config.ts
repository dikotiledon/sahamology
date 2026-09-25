/**
 * Host/network configuration helpers.
 *
 * Self-hosting needs an explicit, predictable notion of "what URL is this app
 * reachable at" instead of the old `process.env.URL || http://${req.headers.host}`
 * guessing. The two variables are:
 *
 *   APP_BASE_URL     - The externally reachable URL (LAN IP, domain, or public
 *                      IP). Used when the browser or extension must be told
 *                      where the app lives.
 *   INTERNAL_API_URL - Loopback URL used by in-process schedulers and workers.
 *                      Defaults to http://127.0.0.1:<PORT>.
 */

export function getPort(): number {
  const configured = Number(process.env.PORT);
  return Number.isFinite(configured) && configured > 0 ? configured : 3000;
}

/** The externally reachable base URL (no trailing slash). */
export function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `http://127.0.0.1:${getPort()}`;
}

/** The internal loopback URL used for scheduler/worker self-calls. */
export function getInternalApiUrl(): string {
  const configured = process.env.INTERNAL_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `http://127.0.0.1:${getPort()}`;
}

/**
 * Whether session cookies should carry the `Secure` flag.
 *
 * `Secure` must only be set when the request actually arrived over HTTPS —
 * either directly or via a reverse proxy that sets `X-Forwarded-Proto: https`.
 * Plain-HTTP LAN access (e.g. http://192.168.1.50:3000) must not get a Secure
 * cookie or the browser will refuse to send it.
 */
export function isSecureCookieRequest(forwardedProto?: string | null): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (forwardedProto) return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  return process.env.NODE_ENV === 'production';
}
