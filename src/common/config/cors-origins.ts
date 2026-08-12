/**
 * Shared CORS origin allow-list, used by both the HTTP layer (main.ts) and
 * the Socket.IO gateway (chat.gateway.ts) so they can never drift apart.
 *
 * Sources are MERGED (not either/or) and de-duplicated:
 *   - `CORS_ORIGINS`  — comma-separated explicit allow-list (primary)
 *   - `WEB_URL` / `FRONTEND_URL` — the deployed web app origin(s)
 *   - localhost dev ports — added ONLY outside production, so prod stays tight
 *     while `npm run start:dev` works with no extra config.
 *
 * Every origin is normalized (trimmed, trailing slash removed) so
 * `https://app.example.com/` and `https://app.example.com` are treated the
 * same — a common source of "works locally, blocked in prod" CORS bugs.
 *
 * Note: matching is exact (the `cors` package compares strings), so list each
 * origin you need — including scheme and any non-default port.
 */

const DEV_ORIGINS = [
  'http://localhost:3000', // Next.js web
  'http://localhost:19006', // Expo web
];

/** Trim surrounding whitespace and drop any trailing slash(es). */
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function getAllowedOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === 'production';

  const fromList = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  const singles = [process.env.WEB_URL, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value))
    .map(normalizeOrigin);

  const dev = isProduction ? [] : DEV_ORIGINS;

  return Array.from(new Set([...fromList, ...singles, ...dev]));
}
