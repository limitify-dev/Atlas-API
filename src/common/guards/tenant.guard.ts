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
 * Enforces tenant isolation on every authenticated request.
 *
 * Two protections:
 *  1. An authenticated non-super-admin request must carry a tenantId in its
 *     token (otherwise there is no tenant context to scope queries to).
 *  2. A request may not *supply its own* tenantId (via query, route param, or
 *     body) that differs from the one in its token. Many controllers derive
 *     `effectiveTenantId = req.query.tenantId || req.user.tenantId`; without
 *     this check a user could pass `?tenantId=<other-school>` and read/write
 *     another tenant's data. Here we reject that up front, centrally, so the
 *     controllers' fallback pattern is safe.
 *
 * SUPER_ADMIN is exempt from both — they legitimately operate across tenants
 * (studio/platform ops), so they may target any tenantId.
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

    // Super admins operate cross-tenant; they may target any tenantId.
    if (user.role === Role.SUPER_ADMIN) return true;

    if (!user.tenantId) {
      throw new ForbiddenException(
        'No tenant context found in token. Please re-authenticate.',
      );
    }

    // Reject any client-supplied tenantId that doesn't match the caller's own.
    const suppliedTenantIds = [
      request.query?.tenantId,
      request.params?.tenantId,
      request.body?.tenantId,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    for (const supplied of suppliedTenantIds) {
      if (supplied !== user.tenantId) {
        throw new ForbiddenException(
          'You cannot access resources belonging to another tenant.',
        );
      }
    }

    return true;
  }
}
