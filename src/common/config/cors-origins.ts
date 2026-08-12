/**
 * Shared CORS origin allow-list, used by both the HTTP layer (main.ts) and
 * the Socket.IO gateway (chat.gateway.ts) so they can never drift apart.
 *
 * Reads `CORS_ORIGINS` (comma-separated) if set; otherwise falls back to
 * `WEB_URL`/`FRONTEND_URL` plus the standard local dev ports, which keeps
 * `npm run start:dev` working without any extra config.
 */
export function getAllowedOrigins(): string[] {
  const explicit = process.env.CORS_ORIGINS;
  if (explicit) {
    return explicit
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  const fallbacks = [
    process.env.WEB_URL,
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:19006', // Expo web
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(fallbacks));
}
