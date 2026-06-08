import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TeacherTrendDataPoint {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

export interface DepartmentAnalytics {
  department: string;
  totalTeachers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export interface TeacherAnalytics {
  teacherId: string;
  teacherDbId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  department: string | null;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  attendanceRate: number;
  streak: number;
  longestStreak: number;
  trend: 'up' | 'down' | 'stable';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastAbsenceDate: string | null;
  averageCheckInTime: string | null;
  averageCheckOutTime: string | null;
  averageWorkHours: number | null;
  attendanceHistory: {
    date: string;
    status: string;
    checkInTime: string | null;
    checkOutTime: string | null;
  }[];
}

export interface TeacherOverviewAnalytics {
  totalTeachers: number;
  averageAttendanceRate: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  excusedToday: number;
  attendanceRateTrend: number;
  bestPerformingDepartment: { name: string; rate: number } | null;
  worstPerformingDepartment: { name: string; rate: number } | null;
  teachersAtRisk: number;
  perfectAttendanceCount: number;
  averageWorkHoursToday: number | null;
}

export interface DayOfWeekAnalytics {
  day: string;
  dayIndex: number;
  averageRate: number;
  totalRecords: number;
}

export interface MonthlyComparison {
  month: string;
  year: number;
  attendanceRate: number;
  totalDays: number;
  presentDays: number;
}

@Injectable()
export class TeacherAttendanceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDateRange(
    period: string,
    customStart?: string,
    customEnd?: string,
  ): DateRange {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now);
    endDate.setUTCHours(23, 59, 59, 999);

    switch (period) {
      case 'today':
        startDate = new Date(now);
        startDate.setUTCHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        startDate.setUTCHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        startDate.setUTCHours(0, 0, 0, 0);
        break;
      case 'quarter':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        startDate.setUTCHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        startDate.setUTCHours(0, 0, 0, 0);
        break;
      case 'custom':
        if (customStart && customEnd) {
          startDate = new Date(customStart);
          startDate.setUTCHours(0, 0, 0, 0);
          endDate = new Date(customEnd);
          endDate.setUTCHours(23, 59, 59, 999);
        } else {
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          startDate.setUTCHours(0, 0, 0, 0);
        }
        break;
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        startDate.setUTCHours(0, 0, 0, 0);
    }

    return { startDate, endDate };
  }

  async getOverviewAnalytics(
    tenantId: string,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
  ): Promise<TeacherOverviewAnalytics> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Get total teachers
    const totalTeachers = await this.prisma.teacher.count({
      where: { tenantId },
    });

    // Get today's stats
    const todayStats = await this.prisma.teacherAttendance.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      _count: { status: true },
    });

    const todayStatsMap = todayStats.reduce(
      (acc, stat) => {
        acc[stat.status.toLowerCase()] = stat._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Get today's attendance for average work hours
    const todayAttendances = await this.prisma.teacherAttendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: todayStart, lte: todayEnd },
        checkInTime: { not: null },
        checkOutTime: { not: null },
      },
    });

    let averageWorkHoursToday: number | null = null;
    if (todayAttendances.length > 0) {
      const totalHours = todayAttendances.reduce((sum, att) => {
        if (att.checkInTime && att.checkOutTime) {
          const diff = att.checkOutTime.getTime() - att.checkInTime.getTime();
          return sum + diff / (1000 * 60 * 60);
        }
        return sum;
      }, 0);
      averageWorkHoursToday =
        Math.round((totalHours / todayAttendances.length) * 10) / 10;
    }

    // Get attendance for the period
    const periodAttendance = await this.prisma.teacherAttendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        teacher: true,
      },
    });

    // Calculate average attendance rate
    const totalRecords = periodAttendance.length;
    const presentRecords = periodAttendance.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE',
    ).length;
    const averageAttendanceRate =
      totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    // Calculate trend (compare with previous period)
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousEnd = new Date(startDate.getTime() - 1);

    const previousAttendance = await this.prisma.teacherAttendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: previousStart, lte: previousEnd },
      },
    });

    const previousTotal = previousAttendance.length;
    const previousPresent = previousAttendance.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE',
    ).length;
    const previousRate =
      previousTotal > 0 ? (previousPresent / previousTotal) * 100 : 0;
    const attendanceRateTrend = averageAttendanceRate - previousRate;

    // Get department-wise performance
    const departmentPerformance = await this.getDepartmentAnalytics(
      tenantId,
      period,
      customStart,
      customEnd,
    );
    const sortedDepartments = [...departmentPerformance].sort(
      (a, b) => b.attendanceRate - a.attendanceRate,
    );

    // Teachers at risk (attendance < 85%)
    const teacherAnalytics = await this.getAllTeachersAnalytics(
      tenantId,
      period,
      customStart,
      customEnd,
    );
    const teachersAtRisk = teacherAnalytics.filter(
      (t) => t.attendanceRate < 85,
    ).length;
    const perfectAttendanceCount = teacherAnalytics.filter(
      (t) => t.attendanceRate === 100,
    ).length;

    return {
      totalTeachers,
      averageAttendanceRate,
      presentToday: todayStatsMap.present || 0,
      absentToday: todayStatsMap.absent || 0,
      lateToday: todayStatsMap.late || 0,
      excusedToday: todayStatsMap.excused || 0,
      attendanceRateTrend: Math.round(attendanceRateTrend * 10) / 10,
      bestPerformingDepartment:
        sortedDepartments.length > 0
          ? {
              name: sortedDepartments[0].department,
              rate: sortedDepartments[0].attendanceRate,
            }
          : null,
      worstPerformingDepartment:
        sortedDepartments.length > 0
          ? {
              name: sortedDepartments[sortedDepartments.length - 1].department,
              rate: sortedDepartments[sortedDepartments.length - 1]
                .attendanceRate,
            }
          : null,
      teachersAtRisk,
      perfectAttendanceCount,
      averageWorkHoursToday,
    };
  }

  async getAttendanceTrend(
    tenantId: string,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
  ): Promise<TeacherTrendDataPoint[]> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );

    const attendances = await this.prisma.teacherAttendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalTeachers = await this.prisma.teacher.count({
      where: { tenantId },
    });

    // Group by date
    const dateGroups: Record<
      string,
      { present: number; absent: number; late: number; excused: number }
    > = {};

    attendances.forEach((attendance) => {
      const dateKey = attendance.createdAt.toISOString().split('T')[0];
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { present: 0, absent: 0, late: 0, excused: 0 };
      }
      dateGroups[dateKey][
        attendance.status.toLowerCase() as keyof (typeof dateGroups)[string]
      ]++;
    });

    const trendData: TeacherTrendDataPoint[] = Object.entries(dateGroups).map(
      ([date, counts]) => {
        const total =
          counts.present + counts.absent + counts.late + counts.excused;
        const presentAndLate = counts.present + counts.late;
        return {
          date,
          ...counts,
          total: totalTeachers,
          rate: total > 0 ? Math.round((presentAndLate / total) * 100) : 0,
        };
      },
    );

    return trendData.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getDepartmentAnalytics(
    tenantId: string,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
  ): Promise<DepartmentAnalytics[]> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );

    // Get all teachers grouped by department
    const teachers = await this.prisma.teacher.findMany({
      where: { tenantId },
      include: {
        attendances: {
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
        },
      },
    });

    // Group by department
    const departmentGroups: Record<
      string,
      {
        teachers: typeof teachers;
        attendances: (typeof teachers)[0]['attendances'];
      }
    > = {};

    teachers.forEach((teacher) => {
      const dept = teacher.department || 'Unassigned';
      if (!departmentGroups[dept]) {
        departmentGroups[dept] = { teachers: [], attendances: [] };
      }
      departmentGroups[dept].teachers.push(teacher);
      departmentGroups[dept].attendances.push(...teacher.attendances);
    });

    // Calculate previous period for trend
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousEnd = new Date(startDate.getTime() - 1);

    const departmentAnalytics: DepartmentAnalytics[] = await Promise.all(
      Object.entries(departmentGroups).map(async ([department, data]) => {
        const totalTeachers = data.teachers.length;
        const allAttendances = data.attendances;

        const presentCount = allAttendances.filter(
          (a) => a.status === 'PRESENT',
        ).length;
        const absentCount = allAttendances.filter(
          (a) => a.status === 'ABSENT',
        ).length;
        const lateCount = allAttendances.filter(
          (a) => a.status === 'LATE',
        ).length;
        const excusedCount = allAttendances.filter(
          (a) => a.status === 'EXCUSED',
        ).length;

        const totalRecords = allAttendances.length;
        const attendanceRate =
          totalRecords > 0
            ? Math.round(((presentCount + lateCount) / totalRecords) * 100)
            : 0;

        // Get previous period attendance for trend
        const teacherIds = data.teachers.map((t) => t.id);
        const previousAttendances =
          await this.prisma.teacherAttendance.findMany({
            where: {
              tenantId,
              teacherId: { in: teacherIds },
              createdAt: { gte: previousStart, lte: previousEnd },
            },
          });

        const prevTotal = previousAttendances.length;
        const prevPresent = previousAttendances.filter(
          (a) => a.status === 'PRESENT' || a.status === 'LATE',
        ).length;
        const prevRate = prevTotal > 0 ? (prevPresent / prevTotal) * 100 : 0;

        const trendPercentage = attendanceRate - prevRate;
        const trend: 'up' | 'down' | 'stable' =
          trendPercentage > 1 ? 'up' : trendPercentage < -1 ? 'down' : 'stable';

        return {
          department,
          totalTeachers,
          presentCount,
          absentCount,
          lateCount,
          excusedCount,
          attendanceRate,
          trend,
          trendPercentage: Math.round(trendPercentage * 10) / 10,
        };
      }),
    );

    return departmentAnalytics.sort(
      (a, b) => b.attendanceRate - a.attendanceRate,
    );
  }

  async getTeacherAnalytics(
    tenantId: string,
    teacherId: string,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
  ): Promise<TeacherAnalytics | null> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );

    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId, id: teacherId },
      include: {
        user: { select: { email: true } },
        attendances: {
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!teacher) return null;

    const attendances = teacher.attendances;
    const totalDays = attendances.length;
    const presentDays = attendances.filter(
      (a) => a.status === 'PRESENT',
    ).length;
    const absentDays = attendances.filter((a) => a.status === 'ABSENT').length;
    const lateDays = attendances.filter((a) => a.status === 'LATE').length;
    const excusedDays = attendances.filter(
      (a) => a.status === 'EXCUSED',
    ).length;

    const attendanceRate =
      totalDays > 0
        ? Math.round(((presentDays + lateDays) / totalDays) * 100)
        : 0;

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const sortedAttendances = [...attendances].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    for (const att of sortedAttendances) {
      if (att.status === 'PRESENT' || att.status === 'LATE') {
        tempStreak++;
        if (currentStreak === 0) currentStreak = tempStreak;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
        if (currentStreak === 0) currentStreak = 0;
      }
    }

    // Calculate trend
    const midPoint = Math.floor(attendances.length / 2);
    const recentHalf = attendances.slice(0, midPoint);
    const olderHalf = attendances.slice(midPoint);

    const recentRate =
      recentHalf.length > 0
        ? recentHalf.filter(
            (a) => a.status === 'PRESENT' || a.status === 'LATE',
          ).length / recentHalf.length
        : 0;
    const olderRate =
      olderHalf.length > 0
        ? olderHalf.filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
            .length / olderHalf.length
        : 0;

    const trend: 'up' | 'down' | 'stable' =
      recentRate > olderRate + 0.05
        ? 'up'
        : recentRate < olderRate - 0.05
          ? 'down'
          : 'stable';

    // Risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (attendanceRate >= 95) riskLevel = 'low';
    else if (attendanceRate >= 85) riskLevel = 'medium';
    else if (attendanceRate >= 75) riskLevel = 'high';
    else riskLevel = 'critical';

    // Last absence
    const lastAbsence = attendances.find((a) => a.status === 'ABSENT');
    const lastAbsenceDate = lastAbsence
      ? lastAbsence.createdAt.toISOString().split('T')[0]
      : null;

    // Average check-in time
    const checkInTimes = attendances
      .filter((a) => a.checkInTime)
      .map((a) => {
        const time = a.checkInTime!;
        return time.getUTCHours() * 60 + time.getUTCMinutes();
      });

    let averageCheckInTime: string | null = null;
    if (checkInTimes.length > 0) {
      const avgMinutes = Math.round(
        checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length,
      );
      const hours = Math.floor(avgMinutes / 60);
      const minutes = avgMinutes % 60;
      averageCheckInTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // Average check-out time
    const checkOutTimes = attendances
      .filter((a) => a.checkOutTime)
      .map((a) => {
        const time = a.checkOutTime!;
        return time.getUTCHours() * 60 + time.getUTCMinutes();
      });

    let averageCheckOutTime: string | null = null;
    if (checkOutTimes.length > 0) {
      const avgMinutes = Math.round(
        checkOutTimes.reduce((a, b) => a + b, 0) / checkOutTimes.length,
      );
      const hours = Math.floor(avgMinutes / 60);
      const minutes = avgMinutes % 60;
      averageCheckOutTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // Average work hours
    const workHours = attendances
      .filter((a) => a.checkInTime && a.checkOutTime)
      .map((a) => {
        const diff = a.checkOutTime!.getTime() - a.checkInTime!.getTime();
        return diff / (1000 * 60 * 60);
      });

    let averageWorkHours: number | null = null;
    if (workHours.length > 0) {
      averageWorkHours =
        Math.round(
          (workHours.reduce((a, b) => a + b, 0) / workHours.length) * 10,
        ) / 10;
    }

    // Attendance history
    const attendanceHistory = attendances.map((a) => ({
      date: a.createdAt.toISOString().split('T')[0],
      status: a.status,
      checkInTime: a.checkInTime
        ? `${String(a.checkInTime.getUTCHours()).padStart(2, '0')}:${String(a.checkInTime.getUTCMinutes()).padStart(2, '0')}`
        : null,
      checkOutTime: a.checkOutTime
        ? `${String(a.checkOutTime.getUTCHours()).padStart(2, '0')}:${String(a.checkOutTime.getUTCMinutes()).padStart(2, '0')}`
        : null,
    }));

    return {
      teacherId: teacher.teacherId,
      teacherDbId: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.user.email,
      department: teacher.department,
      totalDays,
      presentDays,
      absentDays,
      lateDays,
      excusedDays,
      attendanceRate,
      streak: currentStreak,
      longestStreak,
      trend,
      riskLevel,
      lastAbsenceDate,
      averageCheckInTime,
      averageCheckOutTime,
      averageWorkHours,
      attendanceHistory,
    };
  }

  async getAllTeachersAnalytics(
    tenantId: string,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
    department?: string,
  ): Promise<TeacherAnalytics[]> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );

    const where: {
      tenantId: string;
      department?: string;
    } = { tenantId };
    if (department) where.department = department;

    const teachers = await this.prisma.teacher.findMany({
      where,
      include: {
        user: { select: { email: true } },
        attendances: {
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return teachers.map((teacher) => {
      const attendances = teacher.attendances;
      const totalDays = attendances.length;
      const presentDays = attendances.filter(
        (a) => a.status === 'PRESENT',
      ).length;
      const absentDays = attendances.filter(
        (a) => a.status === 'ABSENT',
      ).length;
      const lateDays = attendances.filter((a) => a.status === 'LATE').length;
      const excusedDays = attendances.filter(
        (a) => a.status === 'EXCUSED',
      ).length;

      const attendanceRate =
        totalDays > 0
          ? Math.round(((presentDays + lateDays) / totalDays) * 100)
          : 0;

      // Simple streak calculation
      let streak = 0;
      for (const att of attendances) {
        if (att.status === 'PRESENT' || att.status === 'LATE') streak++;
        else break;
      }

      // Risk level
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (attendanceRate >= 95) riskLevel = 'low';
      else if (attendanceRate >= 85) riskLevel = 'medium';
      else if (attendanceRate >= 75) riskLevel = 'high';
      else riskLevel = 'critical';

      const lastAbsence = attendances.find((a) => a.status === 'ABSENT');

      return {
        teacherId: teacher.teacherId,
        teacherDbId: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.user.email,
        department: teacher.department,
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        excusedDays,
        attendanceRate,
        streak,
        longestStreak: streak,
        trend: 'stable' as const,
        riskLevel,
        lastAbsenceDate: lastAbsence
          ? lastAbsence.createdAt.toISOString().split('T')[0]
          : null,
        averageCheckInTime: null,
        averageCheckOutTime: null,
        averageWorkHours: null,
        attendanceHistory: [],
      };
    });
  }

  async getDayOfWeekAnalytics(
    tenantId: string,
    period: string = 'quarter',
  ): Promise<DayOfWeekAnalytics[]> {
    const { startDate, endDate } = this.getDateRange(period);

    const attendances = await this.prisma.teacherAttendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const dayStats: Record<number, { present: number; total: number }> = {};

    for (let i = 0; i < 7; i++) {
      dayStats[i] = { present: 0, total: 0 };
    }

    attendances.forEach((att) => {
      const dayIndex = att.createdAt.getDay();
      dayStats[dayIndex].total++;
      if (att.status === 'PRESENT' || att.status === 'LATE') {
        dayStats[dayIndex].present++;
      }
    });

    return dayNames.map((day, index) => ({
      day,
      dayIndex: index,
      averageRate:
        dayStats[index].total > 0
          ? Math.round((dayStats[index].present / dayStats[index].total) * 100)
          : 0,
      totalRecords: dayStats[index].total,
    }));
  }

  async getMonthlyComparison(
    tenantId: string,
    months: number = 6,
  ): Promise<MonthlyComparison[]> {
    const results: MonthlyComparison[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );

      const attendances = await this.prisma.teacherAttendance.findMany({
        where: {
          tenantId,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      });

      const totalDays = attendances.length;
      const presentDays = attendances.filter(
        (a) => a.status === 'PRESENT' || a.status === 'LATE',
      ).length;
      const attendanceRate =
        totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

      results.push({
        month: monthStart.toLocaleString('default', { month: 'short' }),
        year: monthStart.getFullYear(),
        attendanceRate,
        totalDays,
        presentDays,
      });
    }

    return results.reverse();
  }

  async getAtRiskTeachers(
    tenantId: string,
    threshold: number = 85,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
  ): Promise<TeacherAnalytics[]> {
    const allTeachers = await this.getAllTeachersAnalytics(
      tenantId,
      period,
      customStart,
      customEnd,
    );
    return allTeachers
      .filter((t) => t.attendanceRate < threshold && t.totalDays > 0)
      .sort((a, b) => a.attendanceRate - b.attendanceRate);
  }

  async getTopPerformers(
    tenantId: string,
    limit: number = 10,
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
  ): Promise<TeacherAnalytics[]> {
    const allTeachers = await this.getAllTeachersAnalytics(
      tenantId,
      period,
      customStart,
      customEnd,
    );
    return allTeachers
      .filter((t) => t.totalDays > 0)
      .sort(
        (a, b) => b.attendanceRate - a.attendanceRate || b.streak - a.streak,
      )
      .slice(0, limit);
  }

  async generateReportData(
    tenantId: string,
    reportType: 'summary' | 'detailed' | 'department' | 'teacher',
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
    department?: string,
    teacherId?: string,
  ): Promise<any> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const baseReport = {
      generatedAt: new Date().toISOString(),
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      schoolName: tenant?.name || 'Unknown School',
      reportType,
      reportCategory: 'teacher',
    };

    switch (reportType) {
      case 'summary': {
        const overview = await this.getOverviewAnalytics(
          tenantId,
          period,
          customStart,
          customEnd,
        );
        const trend = await this.getAttendanceTrend(
          tenantId,
          period,
          customStart,
          customEnd,
        );
        const departments = await this.getDepartmentAnalytics(
          tenantId,
          period,
          customStart,
          customEnd,
        );
        const atRisk = await this.getAtRiskTeachers(
          tenantId,
          85,
          period,
          customStart,
          customEnd,
        );
        const topPerformers = await this.getTopPerformers(
          tenantId,
          10,
          period,
          customStart,
          customEnd,
        );

        return {
          ...baseReport,
          overview,
          trend,
          departments,
          atRiskTeachers: atRisk.slice(0, 20),
          topPerformers,
        };
      }

      case 'detailed': {
        const allTeachers = await this.getAllTeachersAnalytics(
          tenantId,
          period,
          customStart,
          customEnd,
          department,
        );
        const departmentData = await this.getDepartmentAnalytics(
          tenantId,
          period,
          customStart,
          customEnd,
        );
        const dayOfWeek = await this.getDayOfWeekAnalytics(tenantId, period);
        const monthly = await this.getMonthlyComparison(tenantId, 6);

        return {
          ...baseReport,
          teachers: allTeachers,
          departments: departmentData,
          dayOfWeekAnalysis: dayOfWeek,
          monthlyComparison: monthly,
        };
      }

      case 'department': {
        if (!department) {
          const allDepartments = await this.getDepartmentAnalytics(
            tenantId,
            period,
            customStart,
            customEnd,
          );
          return { ...baseReport, departments: allDepartments };
        }
        const deptTeachers = await this.getAllTeachersAnalytics(
          tenantId,
          period,
          customStart,
          customEnd,
          department,
        );
        return {
          ...baseReport,
          department,
          teachers: deptTeachers,
        };
      }

      case 'teacher': {
        if (!teacherId) {
          throw new Error('Teacher ID is required for teacher report');
        }
        const teacherData = await this.getTeacherAnalytics(
          tenantId,
          teacherId,
          period,
          customStart,
          customEnd,
        );
        return { ...baseReport, teacher: teacherData };
      }

      default:
        throw new Error('Invalid report type');
    }
  }
}
