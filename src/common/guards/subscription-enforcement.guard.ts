import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/client';
import { SubscriptionBillingService } from '../../subscription/services/subscription-billing.service';
import { SystemSettingsService } from '../../subscription/services/system-settings.service';

/**
 * Per-request subscription enforcement.
 *
 * Blocks any authenticated, tenant-scoped request when the tenant's
 * subscription has lapsed (past currentPeriodEnd + gracePeriodDays) or the
 * tenant has been manually suspended. This is the safety net that cuts off a
 * user mid-session if their subscription expires while they are active.
 *
 * Exempt:
 *  - public routes (@Public / IS_PUBLIC_KEY)
 *  - SUPER_ADMIN (Atlas-Studio) — never gated
 *  - users with no tenant context (cross-tenant platform calls)
 */
@Injectable()
export class SubscriptionEnforcementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionBilling: SubscriptionBillingService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true;
    if (user.role === Role.SUPER_ADMIN) return true;
    if (!user.tenantId) return true;

    const state = await this.subscriptionBilling.getEnforcementState(
      user.tenantId,
    );
    if (state.isBlocked) {
      const support = await this.systemSettings
        .getSupportContact()
        .catch(() => null);
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_ENDED',
        message:
          state.blockedReason === 'suspended'
            ? 'This tenant has been suspended by the system administrator.'
            : 'This tenant’s subscription has ended.',
        reason: state.blockedReason,
        support,
      });
    }

    return true;
  }
}
