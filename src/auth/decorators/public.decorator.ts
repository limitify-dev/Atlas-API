import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public so the global JwtAuthGuard skips it.
 * Use on any endpoint that must be reachable without a Bearer token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
