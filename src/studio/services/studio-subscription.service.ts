import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSubscriptionDto } from '../dto';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../../prisma/generated/client';

@Injectable()
export class StudioSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Create initial trial subscription for a new tenant */
  async createTrial(
    tenantId: string,
    plan: SubscriptionPlan = SubscriptionPlan.BASIC,
    trialDays = 30,
  ) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    return this.prisma.studioSubscription.create({
      data: {
        tenantId,
        plan,
        status: SubscriptionStatus.TRIAL,
        startDate: new Date(),
        endDate: trialEnd,
      },
    });
  }

  async update(tenantId: string, dto: UpdateSubscriptionDto) {
    const updateData = {
      ...(dto.plan && { plan: dto.plan }),
      ...(dto.status && { status: dto.status }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    return this.prisma.studioSubscription.upsert({
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
  }

  /** Expire subscriptions that have passed their endDate */
  async expireOverdue() {
    return this.prisma.studioSubscription.updateMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
        endDate: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }
}
