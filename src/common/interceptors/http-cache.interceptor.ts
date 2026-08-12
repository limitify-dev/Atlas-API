import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HTTP_CACHE_CONTROL } from '../decorators/http-cache.decorator';

/**
 * Sets a `Cache-Control` header on successful GET responses so the browser
 * (and our Next.js proxy) can cache and, via the Express weak ETag,
 * conditionally revalidate them with cheap `304 Not Modified` replies.
 *
 * Defaults to `private, no-cache`: storable but always revalidated, so no
 * client ever serves stale data. Individual endpoints can widen this with the
 * `@HttpCache(...)` decorator, or opt out with `@HttpCache(false)`.
 *
 * Only GET is touched — mutations (POST/PATCH/PUT/DELETE) are never cached.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private static readonly DEFAULT = 'private, no-cache';

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();

    if (req.method !== 'GET') {
      return next.handle();
    }

    const override = this.reflector.getAllAndOverride<string | false>(
      HTTP_CACHE_CONTROL,
      [context.getHandler(), context.getClass()],
    );

    if (override === false) {
      return next.handle();
    }

    const cacheControl = override ?? HttpCacheInterceptor.DEFAULT;

    // Set on the success path only, so error responses aren't marked cacheable.
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        // `@Res()` passthrough handlers may have already flushed the response;
        // setting a header then would throw. Only set when it's still safe.
        if (!res.headersSent && !res.getHeader('Cache-Control')) {
          res.setHeader('Cache-Control', cacheControl);
        }
      }),
    );
  }
}
