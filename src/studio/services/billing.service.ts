import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingStatus } from '../../../prisma/generated/client';
import { CreateBillingDto, UpdateBillingDto } from '../dto';

@Injectable()
export class BillingService {
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
        // Auto-set paidAt when marking PAID
        ...(dto.status === BillingStatus.PAID &&
          !dto.paidAt && { paidAt: new Date() }),
      },
    });
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
}
