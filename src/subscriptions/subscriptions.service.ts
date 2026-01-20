import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionPlan, TenantStatus } from '../../prisma/generated/client';

export interface UpdateSubscriptionDto {
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;
  maxStudents?: number;
  maxTeachers?: number;
  status?: TenantStatus;
}

export interface SubscriptionSummary {
  plan: SubscriptionPlan;
  count: number;
  activeCount: number;
  trialCount: number;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get subscription details for a tenant
   */
  async getSubscription(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        subscriptionPlan: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        maxStudents: true,
        maxTeachers: true,
        createdAt: true,
        _count: {
          select: {
            students: true,
            teachers: true,
            users: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const daysRemaining = tenant.subscriptionEndDate
      ? Math.ceil(
          (tenant.subscriptionEndDate.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      ...tenant,
      usage: {
        students: tenant._count.students,
        teachers: tenant._count.teachers,
        users: tenant._count.users,
        studentLimit: tenant.maxStudents,
        teacherLimit: tenant.maxTeachers,
        studentUsagePercent: Math.round(
          (tenant._count.students / tenant.maxStudents) * 100,
        ),
        teacherUsagePercent: Math.round(
          (tenant._count.teachers / tenant.maxTeachers) * 100,
        ),
      },
      daysRemaining,
      isExpired:
        tenant.subscriptionEndDate && tenant.subscriptionEndDate < new Date(),
      isNearExpiry: daysRemaining !== null && daysRemaining <= 30,
    };
  }

  /**
   * Update subscription for a tenant
   */
  async updateSubscription(tenantId: string, data: UpdateSubscriptionDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Validate that new limits are not lower than current usage
    if (data.maxStudents !== undefined || data.maxTeachers !== undefined) {
      const counts = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          _count: {
            select: {
              students: true,
              teachers: true,
            },
          },
        },
      });

      if (
        data.maxStudents !== undefined &&
        data.maxStudents < counts!._count.students
      ) {
        throw new BadRequestException(
          `Cannot set student limit to ${data.maxStudents}. Current usage is ${counts!._count.students} students.`,
        );
      }

      if (
        data.maxTeachers !== undefined &&
        data.maxTeachers < counts!._count.teachers
      ) {
        throw new BadRequestException(
          `Cannot set teacher limit to ${data.maxTeachers}. Current usage is ${counts!._count.teachers} teachers.`,
        );
      }
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.subscriptionPlan && {
          subscriptionPlan: data.subscriptionPlan,
        }),
        ...(data.subscriptionStartDate && {
          subscriptionStartDate: data.subscriptionStartDate,
        }),
        ...(data.subscriptionEndDate && {
          subscriptionEndDate: data.subscriptionEndDate,
        }),
        ...(data.maxStudents !== undefined && {
          maxStudents: data.maxStudents,
        }),
        ...(data.maxTeachers !== undefined && {
          maxTeachers: data.maxTeachers,
        }),
        ...(data.status && { status: data.status }),
      },
    });
  }

  /**
   * Extend subscription by a number of days
   */
  async extendSubscription(tenantId: string, days: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const currentEndDate = tenant.subscriptionEndDate || new Date();
    const baseDate = currentEndDate > new Date() ? currentEndDate : new Date();
    const newEndDate = new Date(
      baseDate.getTime() + days * 24 * 60 * 60 * 1000,
    );

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionEndDate: newEndDate,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Check resource limits for a tenant
   */
  async checkResourceLimits(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      students: {
        current: tenant._count.students,
        limit: tenant.maxStudents,
        available: tenant.maxStudents - tenant._count.students,
        usagePercent: Math.round(
          (tenant._count.students / tenant.maxStudents) * 100,
        ),
        isAtLimit: tenant._count.students >= tenant.maxStudents,
        isNearLimit: tenant._count.students >= tenant.maxStudents * 0.9,
      },
      teachers: {
        current: tenant._count.teachers,
        limit: tenant.maxTeachers,
        available: tenant.maxTeachers - tenant._count.teachers,
        usagePercent: Math.round(
          (tenant._count.teachers / tenant.maxTeachers) * 100,
        ),
        isAtLimit: tenant._count.teachers >= tenant.maxTeachers,
        isNearLimit: tenant._count.teachers >= tenant.maxTeachers * 0.9,
      },
    };
  }

  /**
   * Get subscription summary across all tenants
   */
  async getSubscriptionSummary() {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        subscriptionPlan: true,
        status: true,
      },
    });

    const summary: Record<SubscriptionPlan, SubscriptionSummary> = {
      FREE: { plan: 'FREE', count: 0, activeCount: 0, trialCount: 0 },
      BASIC: { plan: 'BASIC', count: 0, activeCount: 0, trialCount: 0 },
      PREMIUM: { plan: 'PREMIUM', count: 0, activeCount: 0, trialCount: 0 },
      ENTERPRISE: {
        plan: 'ENTERPRISE',
        count: 0,
        activeCount: 0,
        trialCount: 0,
      },
    };

    tenants.forEach((tenant) => {
      summary[tenant.subscriptionPlan].count++;
      if (tenant.status === 'ACTIVE') {
        summary[tenant.subscriptionPlan].activeCount++;
      }
      if (tenant.status === 'TRIAL') {
        summary[tenant.subscriptionPlan].trialCount++;
      }
    });

    return Object.values(summary);
  }

  /**
   * Get expiring subscriptions
   */
  async getExpiringSubscriptions(daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.prisma.tenant.findMany({
      where: {
        subscriptionEndDate: {
          gte: new Date(),
          lte: futureDate,
        },
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        subscriptionPlan: true,
        subscriptionEndDate: true,
        status: true,
      },
      orderBy: {
        subscriptionEndDate: 'asc',
      },
    });
  }

  /**
   * Get usage statistics for a tenant
   */
  async getUsageStats(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
            users: true,
            grades: true,
            sections: true,
            devices: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      subscriptionPlan: tenant.subscriptionPlan,
      resources: {
        students: {
          used: tenant._count.students,
          limit: tenant.maxStudents,
          percentage: Math.round(
            (tenant._count.students / tenant.maxStudents) * 100,
          ),
        },
        teachers: {
          used: tenant._count.teachers,
          limit: tenant.maxTeachers,
          percentage: Math.round(
            (tenant._count.teachers / tenant.maxTeachers) * 100,
          ),
        },
        users: tenant._count.users,
        grades: tenant._count.grades,
        sections: tenant._count.sections,
        devices: tenant._count.devices,
      },
    };
  }
}
