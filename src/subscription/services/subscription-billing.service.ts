import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TenantSubscriptionStatus,
  SubscriptionStatus,
  SubscriptionPaymentMethod,
  SubscriptionCurrency,
  SubscriptionAuditAction,
  Prisma,
} from '../../../prisma/generated/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days remaining at/under which a tenant is considered "expiring soon". */
export const EXPIRING_SOON_DAYS = 7;

export interface SubscriptionComputedState {
  status: TenantSubscriptionStatus;
  daysRemaining: number | null;
  isInGrace: boolean;
  isBlocked: boolean;
  blockedReason: 'expired' | 'suspended' | null;
}

export interface SupportContact {
  email?: string | null;
  phone?: string | null;
}

export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export interface SubscriptionSummary {
  totalTenants: number;
  active: number;
  expiringSoon: number;
  expired: number;
  suspended: number;
  /** Actual collected payments, grouped by currency — never summed across currencies. */
  revenueThisMonth: CurrencyAmount[];
  revenueAllTime: CurrencyAmount[];
}

interface EnforcementInput {
  currentPeriodEnd?: Date | null;
  gracePeriodDays: number;
  suspendedManually: boolean;
}

@Injectable()
export class SubscriptionBillingService {
  private readonly logger = new Logger(SubscriptionBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Pure status computation ───────────────────────────────────────────────

  private endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  computeState(input: EnforcementInput): SubscriptionComputedState {
    if (input.suspendedManually) {
      return {
        status: TenantSubscriptionStatus.SUSPENDED,
        daysRemaining: input.currentPeriodEnd
          ? Math.ceil(
              (this.endOfDay(input.currentPeriodEnd).getTime() - Date.now()) /
                DAY_MS,
            )
          : null,
        isInGrace: false,
        isBlocked: true,
        blockedReason: 'suspended',
      };
    }

    if (!input.currentPeriodEnd) {
      return {
        status: TenantSubscriptionStatus.EXPIRED,
        daysRemaining: null,
        isInGrace: false,
        isBlocked: true,
        blockedReason: 'expired',
      };
    }

    const periodEnd = this.endOfDay(input.currentPeriodEnd);
    const graceEnd = new Date(periodEnd);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + input.gracePeriodDays);
    const now = Date.now();

    if (now > graceEnd.getTime()) {
      return {
        status: TenantSubscriptionStatus.EXPIRED,
        daysRemaining: Math.ceil((graceEnd.getTime() - now) / DAY_MS),
        isInGrace: false,
        isBlocked: true,
        blockedReason: 'expired',
      };
    }

    const isInGrace = input.gracePeriodDays > 0 && now > periodEnd.getTime();
    const daysRemaining = Math.ceil((graceEnd.getTime() - now) / DAY_MS);
    const status =
      daysRemaining <= EXPIRING_SOON_DAYS
        ? TenantSubscriptionStatus.EXPIRING_SOON
        : TenantSubscriptionStatus.ACTIVE;

    return {
      status,
      daysRemaining,
      isInGrace,
      isBlocked: false,
      blockedReason: null,
    };
  }

  // ── Live enforcement state (used by guard + login) ─────────────────────────

  async getEnforcementState(
    tenantId: string,
  ): Promise<SubscriptionComputedState> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        currentPeriodEnd: true,
        gracePeriodDays: true,
        suspendedManually: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    return this.computeState(tenant);
  }

  // ── Status recalculation (persisted) ───────────────────────────────────────

  /**
   * Recompute and persist the cached `subscriptionStatus` for a tenant.
   * Writes an audit row when the status transitions into EXPIRED.
   * `periodOverride` lets callers set the coverage window atomically.
   */
  async recalculateStatus(
    tenantId: string,
    periodOverride?: { periodStart?: Date; periodEnd?: Date },
    performedBy?: string,
  ): Promise<SubscriptionComputedState> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        subscriptionStatus: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        gracePeriodDays: true,
        suspendedManually: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const data: Prisma.TenantUpdateInput = {};
    if (periodOverride?.periodStart)
      data.currentPeriodStart = periodOverride.periodStart;
    if (periodOverride?.periodEnd)
      data.currentPeriodEnd = periodOverride.periodEnd;

    const state = this.computeState({
      currentPeriodEnd: periodOverride?.periodEnd ?? tenant.currentPeriodEnd,
      gracePeriodDays: tenant.gracePeriodDays,
      suspendedManually: tenant.suspendedManually,
    });

    if (state.status !== tenant.subscriptionStatus) {
      const transitionToExpired =
        state.status === TenantSubscriptionStatus.EXPIRED &&
        tenant.subscriptionStatus !== TenantSubscriptionStatus.EXPIRED;

      data.subscriptionStatus = state.status;
      await this.prisma.tenant.update({ where: { id: tenantId }, data });

      if (transitionToExpired) {
        await this.audit(
          tenantId,
          SubscriptionAuditAction.STATUS_AUTO_EXPIRED,
          performedBy ?? null,
          {
            previousStatus: tenant.subscriptionStatus,
            newStatus: state.status,
          },
        );
      } else if (!periodOverride) {
        // Non-expiry recompute transitions are audit-light.
        await this.audit(
          tenantId,
          SubscriptionAuditAction.STATUS_RECALCULATED,
          performedBy ?? null,
          {
            previousStatus: tenant.subscriptionStatus,
            newStatus: state.status,
          },
        );
      }
    }

    return state;
  }

  /** Run recalculation for every tenant (used by the daily cron). */
  async recalculateAll(): Promise<number> {
    let updated = 0;
    let cursor: string | undefined;
    do {
      const tenants = await this.prisma.tenant.findMany({
        where: cursor ? { id: { gt: cursor } } : undefined,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 200,
      });
      for (const t of tenants) {
        try {
          const state = await this.recalculateStatus(t.id);
          if (state.status === TenantSubscriptionStatus.EXPIRED) updated++;
        } catch (err) {
          this.logger.error(`Failed to recalc tenant ${t.id}`, err as Error);
        }
      }
      cursor = tenants.length ? tenants[tenants.length - 1].id : undefined;
    } while (cursor);
    return updated;
  }

  // ── Manual payment logging ─────────────────────────────────────────────────

  async logPayment(
    tenantId: string,
    dto: {
      amount: number;
      currency?: SubscriptionCurrency;
      paymentDate?: string;
      periodStart: string;
      periodEnd: string;
      paymentMethod?: SubscriptionPaymentMethod;
      referenceNumber?: string;
      notes?: string;
    },
    performedBy?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Invalid coverage window dates.');
    }
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException(
        'Period end must be on or after period start.',
      );
    }
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be positive.');
    }

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        tenantId,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? SubscriptionCurrency.USD,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        periodStart,
        periodEnd,
        paymentMethod:
          dto.paymentMethod ?? SubscriptionPaymentMethod.BANK_TRANSFER,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        recordedById: performedBy,
      },
    });

    const state = await this.recalculateStatus(
      tenantId,
      { periodStart, periodEnd },
      performedBy,
    );

    await this.audit(
      tenantId,
      SubscriptionAuditAction.PAYMENT_LOGGED,
      performedBy ?? null,
      {
        paymentId: payment.id,
        amount: dto.amount,
        currency: dto.currency ?? SubscriptionCurrency.USD,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        previousStatus: tenant.subscriptionStatus,
        newStatus: state.status,
      },
    );

    return { payment, state };
  }

  async listPayments(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      method?: SubscriptionPaymentMethod;
    },
  ) {
    const where: Prisma.SubscriptionPaymentWhereInput = { tenantId };
    if (query.from || query.to) {
      where.paymentDate = {};
      if (query.from) where.paymentDate.gte = new Date(query.from);
      if (query.to) where.paymentDate.lte = new Date(query.to);
    }
    if (query.method) where.paymentMethod = query.method;

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const [items, total] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { recordedBy: { select: { name: true } } },
      }),
      this.prisma.subscriptionPayment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async deletePayment(paymentId: string, performedBy?: string) {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment record not found.');

    await this.prisma.subscriptionPayment.delete({ where: { id: paymentId } });

    // Recalculate the coverage window from any remaining payments.
    const remaining = await this.prisma.subscriptionPayment.findMany({
      where: { tenantId: payment.tenantId },
      orderBy: { periodStart: 'asc' },
    });

    const periodStart = remaining[0]?.periodStart ?? null;
    const periodEnd = remaining.length
      ? remaining.reduce(
          (max, p) => (p.periodEnd > max ? p.periodEnd : max),
          remaining[0].periodEnd,
        )
      : null;

    const state = await this.recalculateStatus(
      payment.tenantId,
      {
        periodStart: periodStart ?? undefined,
        periodEnd: periodEnd ?? undefined,
      },
      performedBy,
    );

    await this.audit(
      payment.tenantId,
      SubscriptionAuditAction.PAYMENT_DELETED,
      performedBy ?? null,
      {
        paymentId,
        amount: payment.amount.toString(),
        currency: payment.currency,
        recomputedPeriodStart: periodStart?.toISOString() ?? null,
        recomputedPeriodEnd: periodEnd?.toISOString() ?? null,
        newStatus: state.status,
      },
    );

    return { state };
  }

  // ── Manual overrides ───────────────────────────────────────────────────────

  async extendSubscription(
    tenantId: string,
    dto: { periodStart?: string; periodEnd: string; reason?: string },
    performedBy?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, subscriptionStatus: true, currentPeriodStart: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const periodEnd = new Date(dto.periodEnd);
    const periodStart = dto.periodStart
      ? new Date(dto.periodStart)
      : (tenant.currentPeriodStart ?? periodEnd);
    if (isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Invalid period end date.');
    }

    const state = await this.recalculateStatus(
      tenantId,
      { periodStart, periodEnd },
      performedBy,
    );

    // Keep the admin-facing StudioSubscription card in sync — otherwise it
    // keeps showing the old end date after an Extend here.
    await this.prisma.studioSubscription.updateMany({
      where: { tenantId },
      data: { startDate: periodStart, endDate: periodEnd },
    });

    await this.audit(
      tenantId,
      SubscriptionAuditAction.MANUALLY_EXTENDED,
      performedBy ?? null,
      {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        reason: dto.reason,
        previousStatus: tenant.subscriptionStatus,
        newStatus: state.status,
      },
    );

    return { state };
  }

  async suspend(tenantId: string, reason: string, performedBy?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        suspendedManually: true,
        suspensionReason: reason,
        subscriptionStatus: TenantSubscriptionStatus.SUSPENDED,
      },
    });

    // Keep the admin-facing StudioSubscription card in sync — otherwise it
    // keeps showing "Active" for a tenant that's actually suspended.
    await this.prisma.studioSubscription.updateMany({
      where: { tenantId },
      data: { status: SubscriptionStatus.SUSPENDED },
    });

    await this.audit(
      tenantId,
      SubscriptionAuditAction.MANUALLY_SUSPENDED,
      performedBy ?? null,
      { reason, previousStatus: tenant.subscriptionStatus },
    );

    return {
      state: this.computeState({
        currentPeriodEnd: null,
        gracePeriodDays: 0,
        suspendedManually: true,
      }),
    };
  }

  async reactivate(tenantId: string, performedBy?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        gracePeriodDays: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { suspendedManually: false, suspensionReason: null },
    });

    const state = await this.recalculateStatus(
      tenantId,
      undefined,
      performedBy,
    );

    // Keep the admin-facing StudioSubscription card in sync — a reactivated
    // tenant should read as Active there too, not still show Suspended.
    await this.prisma.studioSubscription.updateMany({
      where: { tenantId, status: SubscriptionStatus.SUSPENDED },
      data: { status: SubscriptionStatus.ACTIVE },
    });

    await this.audit(
      tenantId,
      SubscriptionAuditAction.MANUALLY_REACTIVATED,
      performedBy ?? null,
      { previousStatus: tenant.subscriptionStatus, newStatus: state.status },
    );

    return { state };
  }

  async updateGracePeriod(
    tenantId: string,
    days: number,
    performedBy?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, gracePeriodDays: true, subscriptionStatus: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { gracePeriodDays: days },
    });

    const state = await this.recalculateStatus(
      tenantId,
      undefined,
      performedBy,
    );

    await this.audit(
      tenantId,
      SubscriptionAuditAction.GRACE_PERIOD_UPDATED,
      performedBy ?? null,
      {
        previousGraceDays: tenant.gracePeriodDays,
        newGraceDays: days,
        newStatus: state.status,
      },
    );

    return { state };
  }

  // ── Audit log ──────────────────────────────────────────────────────────────

  async listAuditLog(
    tenantId: string,
    query: { page?: number; limit?: number; from?: string; to?: string },
  ) {
    const where: Prisma.SubscriptionAuditLogWhereInput = { tenantId };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 30));

    const [items, total] = await Promise.all([
      this.prisma.subscriptionAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { performedBy: { select: { name: true } } },
      }),
      this.prisma.subscriptionAuditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private async audit(
    tenantId: string,
    action: SubscriptionAuditAction,
    performedById: string | null,
    details: Record<string, unknown>,
  ) {
    return this.prisma.subscriptionAuditLog.create({
      data: {
        tenantId,
        action,
        performedById,
        details: details as Prisma.InputJsonValue,
      },
    });
  }

  // ── Dashboard summary ──────────────────────────────────────────────────────

  async getDashboardSummary(): Promise<SubscriptionSummary> {
    const [statuses, monthByCurrency, allTimeByCurrency, total] =
      await Promise.all([
        this.prisma.tenant.groupBy({
          by: ['subscriptionStatus'],
          _count: { _all: true },
        }),
        // Grouped by currency — payments are logged in whichever of the 10
        // supported currencies the admin picked, so a flat sum would add
        // incompatible currencies together under one hardcoded label.
        this.prisma.subscriptionPayment.groupBy({
          by: ['currency'],
          where: {
            paymentDate: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
          _sum: { amount: true },
        }),
        this.prisma.subscriptionPayment.groupBy({
          by: ['currency'],
          _sum: { amount: true },
        }),
        this.prisma.tenant.count(),
      ]);

    const counts = new Map<string, number>();
    statuses.forEach((s) =>
      counts.set(s.subscriptionStatus ?? 'UNKNOWN', s._count._all),
    );

    const toCurrencyAmounts = (
      rows: { currency: string; _sum: { amount: Prisma.Decimal | null } }[],
    ): CurrencyAmount[] =>
      rows
        .filter((r) => Number(r._sum.amount ?? 0) > 0)
        .map((r) => ({ currency: r.currency, amount: Number(r._sum.amount ?? 0) }));

    return {
      totalTenants: total,
      active: counts.get(TenantSubscriptionStatus.ACTIVE) ?? 0,
      expiringSoon: counts.get(TenantSubscriptionStatus.EXPIRING_SOON) ?? 0,
      expired: counts.get(TenantSubscriptionStatus.EXPIRED) ?? 0,
      suspended: counts.get(TenantSubscriptionStatus.SUSPENDED) ?? 0,
      revenueThisMonth: toCurrencyAmounts(monthByCurrency),
      revenueAllTime: toCurrencyAmounts(allTimeByCurrency),
    };
  }

  /** Full subscription state for a tenant (UI + guard). */
  async getSubscriptionState(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionStatus: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        gracePeriodDays: true,
        suspendedManually: true,
        suspensionReason: true,
        subscriptionPlan: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    const computed = await this.getEnforcementState(tenantId);
    return { ...tenant, computed };
  }

  /** List all tenants with their computed subscription state (dashboard). */
  async listTenantsWithState(
    query: {
      status?: TenantSubscriptionStatus;
      search?: string;
    } = {},
  ) {
    const where: Prisma.TenantWhereInput = {};
    if (query.status) where.subscriptionStatus = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const tenants = await this.prisma.tenant.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionStatus: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        gracePeriodDays: true,
        suspendedManually: true,
        suspensionReason: true,
        subscriptionPlan: true,
        subscriptionPayments: {
          orderBy: { paymentDate: 'desc' },
          take: 1,
          select: { paymentDate: true, amount: true, currency: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return tenants.map((t) => ({
      ...t,
      computed: this.computeState({
        currentPeriodEnd: t.currentPeriodEnd,
        gracePeriodDays: t.gracePeriodDays,
        suspendedManually: t.suspendedManually,
      }),
      lastPayment: t.subscriptionPayments[0] ?? null,
    }));
  }
}
