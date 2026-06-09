import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Ensures only SUPER_ADMIN users can access Studio endpoints.
 */
@Injectable()
export class StudioGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Atlas Studio is restricted to platform administrators.');
    }
    return true;
  }
}
