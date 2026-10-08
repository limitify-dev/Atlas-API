import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/client';
import { ModuleAccessService } from './module-access.service';
import {
  REQUIRED_MODULE_KEY,
  type GatedModuleKey,
} from './require-module.decorator';

const MODULE_LABELS: Record<GatedModuleKey, string> = {
  academics: 'Academics',
  finance: 'Finance',
  attendance: 'Attendance',
  connect: 'Atlas Connect',
};

/**
 * Blocks routes decorated with `@RequireModule(key)` when the caller's tenant
 * does not have that platform module enabled. Runs after the auth guards, so
 * `request.user` is populated. Device routes (no user) fall back to
 * `request.tenantId` set by the device API-key guard.
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleAccess: ModuleAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<GatedModuleKey | null>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    // Platform super admins are never tenant-scoped.
    if (user?.role === Role.SUPER_ADMIN) return true;

    const tenantId: string | undefined = user?.tenantId ?? req.tenantId;
    // No resolvable tenant → let the auth layer decide; don't 403 here.
    if (!tenantId) return true;

    const enabled = await this.moduleAccess.isEnabled(tenantId, required);
    if (!enabled) {
      throw new ForbiddenException(
        `The ${MODULE_LABELS[required]} module is not enabled for this school.`,
      );
    }
    return true;
  }
}
