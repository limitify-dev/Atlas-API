import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

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
      weeklyAttendance,
      // Permissions
      pendingPermissions,
      activePermissions,
      todayApprovedPermissions,
      // Conduct
      activeIncidents,
      // Recent attendance activity
      recentAttendance,
      // Recent permissions
      recentPermissions,
    ] = await Promise.all([
      // Core counts
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.section.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.teacher.count({ where: { tenantId } }),

      // Today's attendance
      this.prisma.attendance.count({
        where: { tenantId, createdAt: { gte: today }, status: 'PRESENT' },
      }),
      this.prisma.attendance.count({
        where: { tenantId, createdAt: { gte: today } },
      }),

      // Yesterday's attendance
      this.prisma.attendance.count({
        where: {
          tenantId,
          createdAt: { gte: yesterday, lt: today },
          status: 'PRESENT',
        },
      }),
      this.prisma.attendance.count({
        where: { tenantId, createdAt: { gte: yesterday, lt: today } },
      }),

      // Weekly attendance (last 7 days)
      this.prisma.attendance.groupBy({
        by: ['createdAt'],
        where: { tenantId, createdAt: { gte: weekAgo } },
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
          approvedAt: { gte: today },
        },
      }),

      // Active conduct incidents
      this.prisma.conductRecord.count({
        where: { tenantId, incidentStatus: 'ACTIVE' },
      }),

      // Recent attendance (last 10) - Only auto mode (card-based) entries with checkInTime from today
      this.prisma.attendance.findMany({
        where: { 
          tenantId,
          checkInTime: { 
            not: null, // Only show card-based auto check-ins
            gte: today, // Only today's records
          },
        },
        orderBy: { checkInTime: 'desc' }, // Order by actual check-in time
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
    ]);

    // Calculate attendance rate
    const attendanceRate =
      todayTotal > 0 ? (todayPresent / todayTotal) * 100 : 0;

    const yesterdayRate =
      yesterdayTotal > 0 ? (yesterdayPresent / yesterdayTotal) * 100 : 0;

    const attendanceChange =
      yesterdayRate > 0
        ? ((attendanceRate - yesterdayRate) / yesterdayRate) * 100
        : 0;

    // Build weekly chart data (aggregate by day)
    const dayMap = new Map<string, { present: number; total: number }>();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dayMap.set(key, { present: 0, total: 0 });
    }

    // We need a more specific query for weekly chart data
    const weeklyRaw = await this.prisma.attendance.findMany({
      where: { tenantId, createdAt: { gte: weekAgo } },
      select: { createdAt: true, status: true },
    });

    weeklyRaw.forEach((record) => {
      const key = record.createdAt.toISOString().split('T')[0];
      const entry = dayMap.get(key);
      if (entry) {
        entry.total += 1;
        if (record.status === 'PRESENT') {
          entry.present += 1;
        }
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
          rate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
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

      // Permissions
      pendingPermissions,
      activePermissions,
      todayApprovedPermissions,

      // Conduct
      activeIncidents,

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
        checkInTime: a.checkInTime,
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
