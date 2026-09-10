import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { getTenantDayRange } from '../attendance/attendance-day';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Dashboard stats fan out to ~20 aggregate queries per call. Cache the
   * computed result per tenant for a short window so repeated dashboard loads
   * (and multiple admins on the same tenant) don't re-run them every time.
   * 30s bounds staleness while eliminating almost all of the DB cost.
   */
  async getStats(tenantId: string) {
    return this.cache.getOrSet(`dashboard:stats:${tenantId}`, 30, () =>
      this.computeStats(tenantId),
    );
  }

  private async computeStats(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone || 'UTC';
    const todayRange = getTenantDayRange(new Date(), timezone);
    const yesterdayRange = getTenantDayRange(
      new Date(todayRange.start.getTime() - 1),
      timezone,
    );
    // `SchoolEntry.date` is a `@db.Date` column: every row is stored at
    // UTC-midnight of the tenant-local calendar day. Query it with UTC-midnight
    // boundaries derived from the tenant-local date key — NOT the offset-shifted
    // instants in `todayRange`, which a date-only column truncates to the wrong
    // day for any non-UTC tenant.
    const dayStart = new Date(`${todayRange.dateKey}T00:00:00.000Z`);
    const tomorrow = new Date(dayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const yesterday = new Date(dayStart);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const weekAgo = new Date(dayStart);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const monthStart = new Date(dayStart);
    monthStart.setUTCDate(monthStart.getUTCDate() - 30);
    const today = dayStart;
    // Instant range (real timestamps like `checkInAt`) still uses the tenant's
    // actual local-day boundaries.
    const todayInstantStart = todayRange.start;
    const todayInstantEnd = todayRange.end;

    const [
      totalStudents,
      totalSections,
      totalUsers,
      totalTeachers,
      // Today's attendance
      todayPresent,
      todayTotal,
      // Yesterday's attendance (for comparison)
      yesterdayPresent,
      yesterdayTotal,
      // Weekly attendance data
      _weeklyAttendance,
      // Permissions
      pendingPermissions,
      activePermissions,
      todayApprovedPermissions,
      // Conduct
      activeIncidents,
      // Finance
      openInvoices,
      pendingPaymentSubmissions,
      partiallyPaidInvoices,
      // Recent attendance activity
      recentAttendance,
      // Recent permissions
      recentPermissions,
      // Live campus headcount (checked in, not yet checked out)
      onCampusNow,
      // 30-day chronic-absence cohort inputs
      month30DayGroups,
      present30ByStudent,
      any30ByStudent,
    ] = await Promise.all([
      // Core counts
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.section.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.teacher.count({ where: { tenantId } }),

      // Today's campus attendance (SchoolEntry — the "on campus" signal).
      // "Attending" = present OR late.
      this.prisma.schoolEntry.count({
        where: {
          tenantId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['PRESENT', 'LATE'] },
        },
      }),
      // The denominator is the full student population, including students
      // whose attendance has not been logged yet.
      this.prisma.student.count({ where: { tenantId } }),

      // Yesterday's campus attendance
      this.prisma.schoolEntry.count({
        where: {
          tenantId,
          date: { gte: yesterday, lt: today },
          status: { in: ['PRESENT', 'LATE'] },
        },
      }),
      this.prisma.student.count({ where: { tenantId } }),

      // Weekly attendance (last 7 days)
      this.prisma.schoolEntry.groupBy({
        by: ['date'],
        where: { tenantId, date: { gte: weekAgo } },
        _count: { id: true },
      }),

      // Permissions counts
      this.prisma.permission.count({
        where: { tenantId, status: 'PENDING' },
      }),
      this.prisma.permission.count({
        where: {
          tenantId,
          status: 'APPROVED',
          fromDate: { lte: new Date() },
          toDate: { gte: new Date() },
        },
      }),
      this.prisma.permission.count({
        where: {
          tenantId,
          status: 'APPROVED',
          approvedAt: { gte: todayInstantStart, lt: todayInstantEnd },
        },
      }),

      // Active conduct incidents
      this.prisma.conductRecord.count({
        where: { tenantId, incidentStatus: 'ACTIVE' },
      }),

      this.prisma.invoice.count({
        where: {
          tenantId,
          status: {
            in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'],
          },
        },
      }),
      this.prisma.paymentSubmission.count({
        where: { tenantId, status: 'PENDING_REVIEW' },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: 'PARTIALLY_PAID' },
      }),

      // Recent campus check-ins today (card / device)
      this.prisma.schoolEntry.findMany({
        where: {
          tenantId,
          checkInAt: {
            not: null,
            gte: todayInstantStart,
            lt: todayInstantEnd,
          },
        },
        orderBy: { checkInAt: 'desc' },
        take: 5,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              studentId: true,
              grade: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      }),

      // Recent permissions (last 5)
      this.prisma.permission.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              studentId: true,
            },
          },
        },
      }),

      // On campus right now — checked in today and not checked out
      this.prisma.schoolEntry.count({
        where: {
          tenantId,
          date: { gte: today, lt: tomorrow },
          checkInAt: { not: null },
          checkOutAt: null,
          status: { in: ['PRESENT', 'LATE'] },
        },
      }),

      // Distinct school days that actually have entries in the last 30 days
      this.prisma.schoolEntry.groupBy({
        by: ['date'],
        where: { tenantId, date: { gte: monthStart, lt: tomorrow } },
        _count: { _all: true },
      }),
      // Per-student present-or-late day count over the same window
      this.prisma.schoolEntry.groupBy({
        by: ['studentId'],
        where: {
          tenantId,
          date: { gte: monthStart, lt: tomorrow },
          status: { in: ['PRESENT', 'LATE'] },
        },
        _count: { _all: true },
      }),
      // Every student who has any entry in the window (so a student marked
      // absent every day is still in the cohort, not silently excluded)
      this.prisma.schoolEntry.groupBy({
        by: ['studentId'],
        where: { tenantId, date: { gte: monthStart, lt: tomorrow } },
        _count: { _all: true },
      }),
    ]);

    // Chronic absentees: students with attendance data in the last 30 school
    // days whose present-or-late rate is under 80%. Suppressed until there is
    // at least a week of data so a fresh rollout doesn't look alarming.
    const schoolDays30 = month30DayGroups.length;
    const present30Map = new Map(
      present30ByStudent.map((g) => [g.studentId, g._count._all]),
    );
    let chronicAbsentees = 0;
    if (schoolDays30 >= 5) {
      for (const g of any30ByStudent) {
        const rate = (present30Map.get(g.studentId) ?? 0) / schoolDays30;
        if (rate < 0.8) chronicAbsentees += 1;
      }
    }

    // Calculate attendance rate (present-or-late ÷ enrolled students)
    const attendanceRate =
      todayTotal > 0 ? Math.min(100, (todayPresent / todayTotal) * 100) : 0;

    const yesterdayRate =
      yesterdayTotal > 0
        ? Math.min(100, (yesterdayPresent / yesterdayTotal) * 100)
        : 0;

    const attendanceChange =
      yesterdayRate > 0
        ? ((attendanceRate - yesterdayRate) / yesterdayRate) * 100
        : 0;

    // Build weekly chart data (aggregate by day)
    const dayMap = new Map<string, { present: number; total: number }>();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const day = getTenantDayRange(
        new Date(today.getTime() - i * 86_400_000),
        timezone,
      );
      const key = day.dateKey;
      dayMap.set(key, { present: 0, total: 0 });
    }

    // Weekly chart data from campus attendance. Rate is present-or-late as a
    // share of the whole enrolled population, not of the marks that exist.
    const weeklyRaw = await this.prisma.schoolEntry.findMany({
      where: { tenantId, date: { gte: weekAgo } },
      select: { date: true, status: true },
    });

    for (const entry of dayMap.values()) entry.total = totalStudents;

    weeklyRaw.forEach((record) => {
      const key = getTenantDayRange(record.date, timezone).dateKey;
      const entry = dayMap.get(key);
      if (entry && (record.status === 'PRESENT' || record.status === 'LATE')) {
        entry.present += 1;
      }
    });

    const weeklyChartData = Array.from(dayMap.entries()).map(
      ([dateStr, data]) => {
        const d = new Date(dateStr);
        return {
          day: dayNames[d.getDay()],
          date: dateStr,
          present: data.present,
          total: data.total,
          rate:
            data.total > 0
              ? Math.min(100, Math.round((data.present / data.total) * 100))
              : 0,
        };
      },
    );

    return {
      // Core stats
      totalStudents,
      activeClasses: totalSections,
      totalTeachers,
      totalUsers,

      // Attendance
      attendanceRate: attendanceRate.toFixed(1) + '%',
      attendanceChange:
        (attendanceChange >= 0 ? '+' : '') + attendanceChange.toFixed(1) + '%',
      todayPresent,
      todayTotal,
      onCampusNow,
      chronicAbsentees,
      chronicWindowDays: schoolDays30,

      // Permissions
      pendingPermissions,
      activePermissions,
      todayApprovedPermissions,

      // Conduct
      activeIncidents,

      // Finance
      openInvoices,
      pendingPaymentSubmissions,
      partiallyPaidInvoices,

      // Charts
      weeklyChartData,

      // Recent activity
      recentAttendance: recentAttendance.map((a) => ({
        id: a.id,
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        studentId: a.student.studentId,
        grade: a.student.grade.name,
        section: a.student.section.name,
        status: a.status,
        checkInTime: a.checkInAt,
        checkOutTime: a.checkOutAt,
        createdAt: a.createdAt,
      })),

      recentPermissions: recentPermissions.map((p) => ({
        id: p.id,
        studentName: `${p.student.firstName} ${p.student.lastName}`,
        studentId: p.student.studentId,
        reason: p.reason,
        status: p.status,
        permissionType: p.permissionType,
        fromDate: p.fromDate,
        toDate: p.toDate,
        createdAt: p.createdAt,
      })),
    };
  }
}
