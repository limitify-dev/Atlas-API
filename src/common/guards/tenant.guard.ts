import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/client';

/** Key for the @Public() decorator — skips TenantGuard on platform-level routes */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Blocks authenticated requests that have no tenantId unless the user is a SUPER_ADMIN
 * (who operates cross-tenant) or the route is decorated with @Public().
 *
 * Apply globally in AppModule after JwtAuthGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Not yet authenticated — let JwtAuthGuard handle this
    if (!user) return true;

    if (user.role === Role.SUPER_ADMIN) return true;

    if (!user.tenantId) {
      throw new ForbiddenException(
        'No tenant context found in token. Please re-authenticate.',
      );
    }

    return true;
  }
}
