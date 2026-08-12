import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSubscriptionDto } from '../dto';
import { SubscriptionBillingService } from '../../subscription/services/subscription-billing.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../../prisma/generated/client';

@Injectable()
export class StudioSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionBilling: SubscriptionBillingService,
  ) {}

  async findByTenant(tenantId: string) {
    return this.prisma.studioSubscription.findUnique({ where: { tenantId } });
  }

  async findAll() {
    return this.prisma.studioSubscription.findMany({
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Sync the flat/legacy Tenant fields and the computed billing engine's
   * period window from a StudioSubscription row. StudioSubscription is what
   * platform admins edit (and the only place Trial is modeled); this keeps
   * every other reader of subscription data (platform analytics, the
   * enforcement engine, login gating) from drifting out of sync with it.
   */
  private async syncTenant(
    tenantId: string,
    plan: SubscriptionPlan,
    startDate: Date,
    endDate: Date | null,
  ) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionPlan: plan,
        subscriptionStartDate: startDate,
        ...(endDate && { subscriptionEndDate: endDate }),
      },
    });
    if (endDate) {
      await this.subscriptionBilling.recalculateStatus(tenantId, {
        periodStart: startDate,
        periodEnd: endDate,
      });
    }
  }

  /** Create initial trial subscription for a new tenant */
  async createTrial(
    tenantId: string,
    plan: SubscriptionPlan = SubscriptionPlan.BASIC,
    trialDays = 30,
  ) {
    const startDate = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const subscription = await this.prisma.studioSubscription.create({
      data: {
        tenantId,
        plan,
        status: SubscriptionStatus.TRIAL,
        startDate,
        endDate: trialEnd,
      },
    });
    await this.syncTenant(tenantId, plan, startDate, trialEnd);
    return subscription;
  }

  async update(tenantId: string, dto: UpdateSubscriptionDto) {
    const updateData = {
      ...(dto.plan && { plan: dto.plan }),
      ...(dto.status && { status: dto.status }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    const subscription = await this.prisma.studioSubscription.upsert({
      where: { tenantId },
      update: updateData,
      create: {
        tenantId,
        plan: dto.plan ?? SubscriptionPlan.BASIC,
        status: dto.status ?? SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    await this.syncTenant(
      tenantId,
      subscription.plan,
      subscription.startDate,
      subscription.endDate,
    );
    return subscription;
  }
}
