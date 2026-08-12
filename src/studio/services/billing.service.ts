import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BillingCycle,
  BillingSource,
  BillingStatus,
} from '../../../prisma/generated/client';
import { CreateBillingDto, UpdateBillingDto } from '../dto';
import { PLAN_PRICES } from '../constants/plan-prices';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tenantBilling.findMany({
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findForTenant(tenantId: string) {
    return this.prisma.tenantBilling.findMany({
      where: { tenantId },
      orderBy: { periodStart: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateBillingDto) {
    return this.prisma.tenantBilling.create({
      data: {
        tenantId,
        billingCycle: dto.billingCycle,
        amount: dto.amount,
        currency: dto.currency ?? 'USD',
        dueDate: new Date(dto.dueDate),
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateBillingDto) {
    const record = await this.prisma.tenantBilling.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Billing record not found.');

    return this.prisma.tenantBilling.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.paidAt && { paidAt: new Date(dto.paidAt) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.billingCycle && { billingCycle: dto.billingCycle }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.periodStart && { periodStart: new Date(dto.periodStart) }),
        ...(dto.periodEnd && { periodEnd: new Date(dto.periodEnd) }),
        // Auto-set paidAt when marking PAID
        ...(dto.status === BillingStatus.PAID &&
          !dto.paidAt && { paidAt: new Date() }),
      },
    });
  }

  async delete(id: string) {
    const record = await this.prisma.tenantBilling.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Billing record not found.');

    await this.prisma.tenantBilling.delete({ where: { id } });
  }

  /** Mark all records past their dueDate as OVERDUE (cron-safe) */
  async flagOverdue() {
    return this.prisma.tenantBilling.updateMany({
      where: {
        status: BillingStatus.PENDING,
        dueDate: { lt: new Date() },
      },
      data: { status: BillingStatus.OVERDUE },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailyOverdueFlagging() {
    try {
      const { count } = await this.flagOverdue();
      if (count > 0) {
        this.logger.log(`Flagged ${count} billing record(s) as overdue.`);
      }
    } catch (err) {
      this.logger.error('Daily overdue flagging failed', err as Error);
    }
  }

  /**
   * Auto-generate the next due TenantBilling record for every tenant with an
   * active or trialing subscription, once their last billing period has
   * fully elapsed. Idempotent — only creates a record once a period is
   * actually over, so re-running (e.g. via the daily cron) is always safe.
   * Manual `create()` above stays available for ad-hoc/off-cycle charges.
   */
  async generateDueBillingRecords() {
    const tenants = await this.prisma.tenant.findMany({
      where: { studioSubscription: { status: { in: ['ACTIVE', 'TRIAL'] } } },
      select: {
        id: true,
        subscriptionPlan: true,
        studioSubscription: { select: { startDate: true } },
      },
    });

    let created = 0;
    for (const tenant of tenants) {
      const amount = PLAN_PRICES[tenant.subscriptionPlan] ?? 0;
      if (amount <= 0) continue; // free plan, nothing to bill

      const lastRecord = await this.prisma.tenantBilling.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { periodEnd: 'desc' },
      });

      const periodStart =
        lastRecord?.periodEnd ??
        tenant.studioSubscription?.startDate ??
        new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      if (periodEnd > new Date()) continue; // current period not over yet

      await this.prisma.tenantBilling.create({
        data: {
          tenantId: tenant.id,
          billingCycle: BillingCycle.MONTHLY,
          amount,
          source: BillingSource.AUTO,
          dueDate: periodEnd,
          periodStart,
          periodEnd,
        },
      });
      created++;
    }
    return created;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyBillingGeneration() {
    try {
      const created = await this.generateDueBillingRecords();
      if (created > 0) {
        this.logger.log(`Auto-generated ${created} billing record(s).`);
      }
    } catch (err) {
      this.logger.error('Daily billing generation failed', err as Error);
    }
  }
}
