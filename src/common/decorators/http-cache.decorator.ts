import { SetMetadata } from '@nestjs/common';

export const HTTP_CACHE_CONTROL = 'http_cache_control';

/**
 * Opt a GET endpoint into a specific `Cache-Control` value.
 *
 * By default (no decorator) the global HttpCacheInterceptor applies
 * `private, no-cache` to every successful GET — the browser may store the
 * response but must revalidate it every time, and the backend's weak ETag
 * turns unchanged revalidations into cheap `304 Not Modified` replies. That is
 * always safe: it never serves stale data.
 *
 * Use this decorator on read-mostly endpoints where a few seconds of staleness
 * is acceptable in exchange for skipping the round-trip entirely, e.g.:
 *
 *   @HttpCache('private, max-age=30, stale-while-revalidate=120')
 *   @Get('grades')
 *
 * Pass `false` to explicitly opt out (e.g. an endpoint that sets its own
 * caching headers or must never be stored).
 */
export const HttpCache = (value: string | false) =>
  SetMetadata(HTTP_CACHE_CONTROL, value);
