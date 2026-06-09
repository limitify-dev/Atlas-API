import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSubscriptionDto } from '../dto';

@Injectable()
export class StudioSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(tenantId: string) {
    return this.prisma.studioSubscription.findUnique({ where: { tenantId } });
  }

  async findAll() {
    return this.prisma.studioSubscription.findMany({
      include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create initial trial subscription for a new tenant */
  async createTrial(tenantId: string, plan = 'BASIC') {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30); // 30-day trial

    return this.prisma.studioSubscription.create({
      data: {
        tenantId,
        plan,
        status: 'TRIAL',
        startDate: new Date(),
        endDate: trialEnd,
      },
    });
  }

  async update(tenantId: string, dto: UpdateSubscriptionDto) {
    const existing = await this.prisma.studioSubscription.findUnique({ where: { tenantId } });
    if (!existing) throw new NotFoundException('Subscription not found for this tenant.');

    return this.prisma.studioSubscription.update({
      where: { tenantId },
      data: {
        ...(dto.plan && { plan: dto.plan }),
        ...(dto.status && { status: dto.status }),
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
