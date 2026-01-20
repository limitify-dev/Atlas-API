import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get comprehensive platform statistics
   */
  async getPlatformStats() {
    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      totalUsers,
      totalStudents,
      totalTeachers,
      totalDevices,
      activeDevices,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'TRIAL' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count(),
      this.prisma.student.count(),
      this.prisma.teacher.count(),
      this.prisma.device.count(),
      this.prisma.device.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        trial: trialTenants,
        suspended: suspendedTenants,
      },
      users: {
        total: totalUsers,
        students: totalStudents,
        teachers: totalTeachers,
      },
      devices: {
        total: totalDevices,
        active: activeDevices,
      },
    };
  }

  /**
   * Get subscription distribution across all tenants
   */
  async getSubscriptionDistribution() {
    const distribution = await this.prisma.tenant.groupBy({
      by: ['subscriptionPlan'],
      _count: {
        id: true,
      },
    });

    const result = {
      FREE: 0,
      BASIC: 0,
      PREMIUM: 0,
      ENTERPRISE: 0,
    };

    distribution.forEach((item) => {
      result[item.subscriptionPlan] = item._count.id;
    });

    return result;
  }

  /**
   * Get growth metrics over a specified period
   */
  async getGrowthMetrics(period: string = 'month') {
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
      default: // month
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    }

    const [
      currentTenants,
      previousTenants,
      currentUsers,
      previousUsers,
      currentStudents,
      previousStudents,
    ] = await Promise.all([
      this.prisma.tenant.count({
        where: { createdAt: { gte: startDate } },
      }),
      this.prisma.tenant.count({
        where: {
          createdAt: { gte: previousStartDate, lt: startDate },
        },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: startDate } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: previousStartDate, lt: startDate },
        },
      }),
      this.prisma.student.count({
        where: { createdAt: { gte: startDate } },
      }),
      this.prisma.student.count({
        where: {
          createdAt: { gte: previousStartDate, lt: startDate },
        },
      }),
    ]);

    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return {
      period,
      tenants: {
        current: currentTenants,
        previous: previousTenants,
        growth: calculateGrowth(currentTenants, previousTenants),
      },
      users: {
        current: currentUsers,
        previous: previousUsers,
        growth: calculateGrowth(currentUsers, previousUsers),
      },
      students: {
        current: currentStudents,
        previous: previousStudents,
        growth: calculateGrowth(currentStudents, previousStudents),
      },
    };
  }

  /**
   * Get system health metrics from logs
   */
  async getSystemHealthMetrics() {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const [
      totalRequests24h,
      errorCount24h,
      criticalCount24h,
      totalRequestsLastHour,
      avgResponseTime,
    ] = await Promise.all([
      this.prisma.systemLog.count({
        where: { createdAt: { gte: last24Hours } },
      }),
      this.prisma.systemLog.count({
        where: { createdAt: { gte: last24Hours }, level: 'ERROR' },
      }),
      this.prisma.systemLog.count({
        where: { createdAt: { gte: last24Hours }, level: 'CRITICAL' },
      }),
      this.prisma.systemLog.count({
        where: { createdAt: { gte: lastHour } },
      }),
      this.prisma.systemLog.aggregate({
        where: {
          createdAt: { gte: last24Hours },
          duration: { not: null },
        },
        _avg: { duration: true },
      }),
    ]);

    const errorRate =
      totalRequests24h > 0
        ? Math.round((errorCount24h / totalRequests24h) * 10000) / 100
        : 0;

    // Calculate uptime (100% - error rate, simplified)
    const uptime = Math.max(0, 100 - errorRate);

    return {
      uptime: Math.round(uptime * 100) / 100,
      totalRequests24h,
      errorCount24h,
      criticalCount24h,
      requestsPerHour: totalRequestsLastHour,
      avgResponseTime: Math.round(avgResponseTime._avg.duration || 0),
      errorRate,
    };
  }

  /**
   * Get tenant activity ranking
   */
  async getTenantActivityRanking(limit: number = 10) {
    // Get tenants with their user counts and recent activity
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: {
        _count: {
          select: {
            users: true,
            students: true,
            teachers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get recent log activity per tenant
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activityPromises = tenants.map(async (tenant) => {
      const logCount = await this.prisma.systemLog.count({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: last7Days },
        },
      });
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        subscriptionPlan: tenant.subscriptionPlan,
        status: tenant.status,
        userCount: tenant._count.users,
        studentCount: tenant._count.students,
        teacherCount: tenant._count.teachers,
        recentActivity: logCount,
      };
    });

    const results = await Promise.all(activityPromises);

    // Sort by activity
    return results.sort((a, b) => b.recentActivity - a.recentActivity);
  }

  /**
   * Get recent activity logs for dashboard
   */
  async getRecentActivity(limit: number = 20) {
    const logs = await this.prisma.systemLog.findMany({
      where: {
        level: { in: ['INFO', 'WARN'] },
        message: {
          contains: '',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        level: true,
        message: true,
        tenantId: true,
        userId: true,
        endpoint: true,
        createdAt: true,
      },
    });

    return logs;
  }

  /**
   * Get alerts for dashboard (expiring subscriptions, resource limits, errors)
   */
  async getAlerts() {
    const now = new Date();
    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Expiring subscriptions
    const expiringSubscriptions = await this.prisma.tenant.findMany({
      where: {
        subscriptionEndDate: {
          gte: now,
          lte: next30Days,
        },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        subscriptionEndDate: true,
      },
    });

    // Tenants near resource limits
    const tenantsWithLimits = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
          },
        },
      },
    });

    const nearLimitTenants = tenantsWithLimits
      .filter((tenant) => {
        const studentUsage = tenant._count.students / tenant.maxStudents;
        const teacherUsage = tenant._count.teachers / tenant.maxTeachers;
        return studentUsage >= 0.9 || teacherUsage >= 0.9;
      })
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        studentUsage: Math.round(
          (tenant._count.students / tenant.maxStudents) * 100,
        ),
        teacherUsage: Math.round(
          (tenant._count.teachers / tenant.maxTeachers) * 100,
        ),
      }));

    // Recent critical errors
    const criticalErrors = await this.prisma.systemLog.count({
      where: {
        createdAt: { gte: last24Hours },
        level: { in: ['ERROR', 'CRITICAL'] },
      },
    });

    return {
      expiringSubscriptions,
      nearLimitTenants,
      criticalErrors,
    };
  }
}
