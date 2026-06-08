import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** @deprecated use @Tenant() */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId as string;
  },
);

/**
 * Extracts tenantId from the authenticated user's JWT payload.
 *
 * Example:
 *   findAll(@Tenant() tenantId: string) {
 *     return this.service.findAll(tenantId, ...);
 *   }
 */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId as string;
  },
);
