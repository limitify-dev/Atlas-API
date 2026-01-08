import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TrendDataPoint {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

export interface ClassroomAnalytics {
  sectionId: string;
  sectionName: string;
  gradeName: string;
  gradeCode: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export interface StudentAnalytics {
  studentId: string;
  studentDbId: string;
  firstName: string;
  lastName: string;
  sectionName: string;
  gradeName: string;
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
  attendanceHistory: { date: string; status: string; checkInTime: string | null }[];
}

export interface OverviewAnalytics {
  totalStudents: number;
  averageAttendanceRate: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  excusedToday: number;
  attendanceRateTrend: number;
  bestPerformingClass: { name: string; rate: number } | null;
  worstPerformingClass: { name: string; rate: number } | null;
  studentsAtRisk: number;
  perfectAttendanceCount: number;
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
export class AttendanceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDateRange(period: string, customStart?: string, customEnd?: string): DateRange {
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

  async getOverviewAnalytics(tenantId: string, period: string = 'month', customStart?: string, customEnd?: string): Promise<OverviewAnalytics> {
    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Get total students
    const totalStudents = await this.prisma.student.count({
      where: { tenantId },
    });

    // Get today's stats
    const todayStats = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      _count: { status: true },
    });

    const todayStatsMap = todayStats.reduce((acc, stat) => {
      acc[stat.status.toLowerCase()] = stat._count.status;
      return acc;
    }, {} as Record<string, number>);

    // Get attendance for the period
    const periodAttendance = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        student: {
          include: { section: { include: { grade: true } } },
        },
      },
    });

    // Calculate average attendance rate
    const totalRecords = periodAttendance.length;
    const presentRecords = periodAttendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
    const averageAttendanceRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    // Calculate trend (compare with previous period)
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousEnd = new Date(startDate.getTime() - 1);

    const previousAttendance = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: previousStart, lte: previousEnd },
      },
    });

    const previousTotal = previousAttendance.length;
    const previousPresent = previousAttendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
    const previousRate = previousTotal > 0 ? (previousPresent / previousTotal) * 100 : 0;
    const attendanceRateTrend = averageAttendanceRate - previousRate;

    // Get class-wise performance
    const classPerformance = await this.getClassroomAnalytics(tenantId, period, customStart, customEnd);
    const sortedClasses = [...classPerformance].sort((a, b) => b.attendanceRate - a.attendanceRate);

    // Students at risk (attendance < 85%)
    const studentAnalytics = await this.getAllStudentsAnalytics(tenantId, period, customStart, customEnd);
    const studentsAtRisk = studentAnalytics.filter(s => s.attendanceRate < 85).length;
    const perfectAttendanceCount = studentAnalytics.filter(s => s.attendanceRate === 100).length;

    return {
      totalStudents,
      averageAttendanceRate,
      presentToday: todayStatsMap.present || 0,
      absentToday: todayStatsMap.absent || 0,
      lateToday: todayStatsMap.late || 0,
      excusedToday: todayStatsMap.excused || 0,
      attendanceRateTrend: Math.round(attendanceRateTrend * 10) / 10,
      bestPerformingClass: sortedClasses.length > 0
        ? { name: `${sortedClasses[0].gradeName} - ${sortedClasses[0].sectionName}`, rate: sortedClasses[0].attendanceRate }
        : null,
      worstPerformingClass: sortedClasses.length > 0
        ? { name: `${sortedClasses[sortedClasses.length - 1].gradeName} - ${sortedClasses[sortedClasses.length - 1].sectionName}`, rate: sortedClasses[sortedClasses.length - 1].attendanceRate }
        : null,
      studentsAtRisk,
      perfectAttendanceCount,
    };
  }

  async getAttendanceTrend(tenantId: string, period: string = 'month', customStart?: string, customEnd?: string): Promise<TrendDataPoint[]> {
    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalStudents = await this.prisma.student.count({
      where: { tenantId },
    });

    // Group by date
    const dateGroups: Record<string, { present: number; absent: number; late: number; excused: number }> = {};

    attendances.forEach(attendance => {
      const dateKey = attendance.createdAt.toISOString().split('T')[0];
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { present: 0, absent: 0, late: 0, excused: 0 };
      }
      dateGroups[dateKey][attendance.status.toLowerCase() as keyof typeof dateGroups[string]]++;
    });

    const trendData: TrendDataPoint[] = Object.entries(dateGroups).map(([date, counts]) => {
      const total = counts.present + counts.absent + counts.late + counts.excused;
      const presentAndLate = counts.present + counts.late;
      return {
        date,
        ...counts,
        total: totalStudents,
        rate: total > 0 ? Math.round((presentAndLate / total) * 100) : 0,
      };
    });

    return trendData.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getClassroomAnalytics(tenantId: string, period: string = 'month', customStart?: string, customEnd?: string): Promise<ClassroomAnalytics[]> {
    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);

    // Get all sections with their students
    const sections = await this.prisma.section.findMany({
      where: { tenantId, isActive: true },
      include: {
        grade: true,
        students: {
          include: {
            attendances: {
              where: {
                createdAt: { gte: startDate, lte: endDate },
              },
            },
          },
        },
      },
    });

    // Calculate previous period for trend
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousEnd = new Date(startDate.getTime() - 1);

    const classroomAnalytics: ClassroomAnalytics[] = await Promise.all(
      sections.map(async section => {
        const totalStudents = section.students.length;
        const allAttendances = section.students.flatMap(s => s.attendances);

        const presentCount = allAttendances.filter(a => a.status === 'PRESENT').length;
        const absentCount = allAttendances.filter(a => a.status === 'ABSENT').length;
        const lateCount = allAttendances.filter(a => a.status === 'LATE').length;
        const excusedCount = allAttendances.filter(a => a.status === 'EXCUSED').length;

        const totalRecords = allAttendances.length;
        const attendanceRate = totalRecords > 0
          ? Math.round(((presentCount + lateCount) / totalRecords) * 100)
          : 0;

        // Get previous period attendance for trend
        const previousAttendances = await this.prisma.attendance.findMany({
          where: {
            tenantId,
            student: { sectionId: section.id },
            createdAt: { gte: previousStart, lte: previousEnd },
          },
        });

        const prevTotal = previousAttendances.length;
        const prevPresent = previousAttendances.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
        const prevRate = prevTotal > 0 ? (prevPresent / prevTotal) * 100 : 0;

        const trendPercentage = attendanceRate - prevRate;
        const trend: 'up' | 'down' | 'stable' = trendPercentage > 1 ? 'up' : trendPercentage < -1 ? 'down' : 'stable';

        return {
          sectionId: section.id,
          sectionName: section.name,
          gradeName: section.grade.name,
          gradeCode: section.grade.code,
          totalStudents,
          presentCount,
          absentCount,
          lateCount,
          excusedCount,
          attendanceRate,
          trend,
          trendPercentage: Math.round(trendPercentage * 10) / 10,
        };
      })
    );

    return classroomAnalytics.sort((a, b) => b.attendanceRate - a.attendanceRate);
  }

  async getStudentAnalytics(tenantId: string, studentId: string, period: string = 'month', customStart?: string, customEnd?: string): Promise<StudentAnalytics | null> {
    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);

    const student = await this.prisma.student.findFirst({
      where: { tenantId, id: studentId },
      include: {
        section: { include: { grade: true } },
        attendances: {
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!student) return null;

    const attendances = student.attendances;
    const totalDays = attendances.length;
    const presentDays = attendances.filter(a => a.status === 'PRESENT').length;
    const absentDays = attendances.filter(a => a.status === 'ABSENT').length;
    const lateDays = attendances.filter(a => a.status === 'LATE').length;
    const excusedDays = attendances.filter(a => a.status === 'EXCUSED').length;

    const attendanceRate = totalDays > 0
      ? Math.round(((presentDays + lateDays) / totalDays) * 100)
      : 0;

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const sortedAttendances = [...attendances].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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

    const recentRate = recentHalf.length > 0
      ? recentHalf.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length / recentHalf.length
      : 0;
    const olderRate = olderHalf.length > 0
      ? olderHalf.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length / olderHalf.length
      : 0;

    const trend: 'up' | 'down' | 'stable' = recentRate > olderRate + 0.05 ? 'up' : recentRate < olderRate - 0.05 ? 'down' : 'stable';

    // Risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (attendanceRate >= 95) riskLevel = 'low';
    else if (attendanceRate >= 85) riskLevel = 'medium';
    else if (attendanceRate >= 75) riskLevel = 'high';
    else riskLevel = 'critical';

    // Last absence
    const lastAbsence = attendances.find(a => a.status === 'ABSENT');
    const lastAbsenceDate = lastAbsence ? lastAbsence.createdAt.toISOString().split('T')[0] : null;

    // Average check-in time
    const checkInTimes = attendances
      .filter(a => a.checkInTime)
      .map(a => {
        const time = a.checkInTime!;
        return time.getUTCHours() * 60 + time.getUTCMinutes();
      });

    let averageCheckInTime: string | null = null;
    if (checkInTimes.length > 0) {
      const avgMinutes = Math.round(checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length);
      const hours = Math.floor(avgMinutes / 60);
      const minutes = avgMinutes % 60;
      averageCheckInTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // Attendance history
    const attendanceHistory = attendances.map(a => ({
      date: a.createdAt.toISOString().split('T')[0],
      status: a.status,
      checkInTime: a.checkInTime
        ? `${String(a.checkInTime.getUTCHours()).padStart(2, '0')}:${String(a.checkInTime.getUTCMinutes()).padStart(2, '0')}`
        : null,
    }));

    return {
      studentId: student.studentId,
      studentDbId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      sectionName: student.section.name,
      gradeName: student.section.grade.name,
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
      attendanceHistory,
    };
  }

  async getAllStudentsAnalytics(tenantId: string, period: string = 'month', customStart?: string, customEnd?: string, sectionId?: string, gradeId?: string): Promise<StudentAnalytics[]> {
    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);

    const where: any = { tenantId };
    if (sectionId) where.sectionId = sectionId;
    if (gradeId) where.gradeId = gradeId;

    const students = await this.prisma.student.findMany({
      where,
      include: {
        section: { include: { grade: true } },
        attendances: {
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return students.map(student => {
      const attendances = student.attendances;
      const totalDays = attendances.length;
      const presentDays = attendances.filter(a => a.status === 'PRESENT').length;
      const absentDays = attendances.filter(a => a.status === 'ABSENT').length;
      const lateDays = attendances.filter(a => a.status === 'LATE').length;
      const excusedDays = attendances.filter(a => a.status === 'EXCUSED').length;

      const attendanceRate = totalDays > 0
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

      const lastAbsence = attendances.find(a => a.status === 'ABSENT');

      return {
        studentId: student.studentId,
        studentDbId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        sectionName: student.section.name,
        gradeName: student.section.grade.name,
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
        lastAbsenceDate: lastAbsence ? lastAbsence.createdAt.toISOString().split('T')[0] : null,
        averageCheckInTime: null,
        attendanceHistory: [],
      };
    });
  }

  async getDayOfWeekAnalytics(tenantId: string, period: string = 'quarter'): Promise<DayOfWeekAnalytics[]> {
    const { startDate, endDate } = this.getDateRange(period);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStats: Record<number, { present: number; total: number }> = {};

    for (let i = 0; i < 7; i++) {
      dayStats[i] = { present: 0, total: 0 };
    }

    attendances.forEach(att => {
      const dayIndex = att.createdAt.getDay();
      dayStats[dayIndex].total++;
      if (att.status === 'PRESENT' || att.status === 'LATE') {
        dayStats[dayIndex].present++;
      }
    });

    return dayNames.map((day, index) => ({
      day,
      dayIndex: index,
      averageRate: dayStats[index].total > 0
        ? Math.round((dayStats[index].present / dayStats[index].total) * 100)
        : 0,
      totalRecords: dayStats[index].total,
    }));
  }

  async getMonthlyComparison(tenantId: string, months: number = 6): Promise<MonthlyComparison[]> {
    const results: MonthlyComparison[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const attendances = await this.prisma.attendance.findMany({
        where: {
          tenantId,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      });

      const totalDays = attendances.length;
      const presentDays = attendances.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
      const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

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

  async getAtRiskStudents(tenantId: string, threshold: number = 85, period: string = 'month', customStart?: string, customEnd?: string): Promise<StudentAnalytics[]> {
    const allStudents = await this.getAllStudentsAnalytics(tenantId, period, customStart, customEnd);
    return allStudents
      .filter(s => s.attendanceRate < threshold && s.totalDays > 0)
      .sort((a, b) => a.attendanceRate - b.attendanceRate);
  }

  async getTopPerformers(tenantId: string, limit: number = 10, period: string = 'month', customStart?: string, customEnd?: string): Promise<StudentAnalytics[]> {
    const allStudents = await this.getAllStudentsAnalytics(tenantId, period, customStart, customEnd);
    return allStudents
      .filter(s => s.totalDays > 0)
      .sort((a, b) => b.attendanceRate - a.attendanceRate || b.streak - a.streak)
      .slice(0, limit);
  }

  async generateReportData(
    tenantId: string,
    reportType: 'summary' | 'detailed' | 'classroom' | 'student',
    period: string = 'month',
    customStart?: string,
    customEnd?: string,
    sectionId?: string,
    studentId?: string
  ): Promise<any> {
    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const baseReport = {
      generatedAt: new Date().toISOString(),
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      schoolName: tenant?.name || 'Unknown School',
      reportType,
    };

    switch (reportType) {
      case 'summary':
        const overview = await this.getOverviewAnalytics(tenantId, period, customStart, customEnd);
        const trend = await this.getAttendanceTrend(tenantId, period, customStart, customEnd);
        const classrooms = await this.getClassroomAnalytics(tenantId, period, customStart, customEnd);
        const atRisk = await this.getAtRiskStudents(tenantId, 85, period, customStart, customEnd);
        const topPerformers = await this.getTopPerformers(tenantId, 10, period, customStart, customEnd);

        return {
          ...baseReport,
          overview,
          trend,
          classrooms,
          atRiskStudents: atRisk.slice(0, 20),
          topPerformers,
        };

      case 'detailed':
        const allStudents = await this.getAllStudentsAnalytics(tenantId, period, customStart, customEnd, sectionId);
        const classroomData = await this.getClassroomAnalytics(tenantId, period, customStart, customEnd);
        const dayOfWeek = await this.getDayOfWeekAnalytics(tenantId, period);
        const monthly = await this.getMonthlyComparison(tenantId, 6);

        return {
          ...baseReport,
          students: allStudents,
          classrooms: classroomData,
          dayOfWeekAnalysis: dayOfWeek,
          monthlyComparison: monthly,
        };

      case 'classroom':
        if (!sectionId) {
          const allClassrooms = await this.getClassroomAnalytics(tenantId, period, customStart, customEnd);
          return { ...baseReport, classrooms: allClassrooms };
        }
        const classStudents = await this.getAllStudentsAnalytics(tenantId, period, customStart, customEnd, sectionId);
        const section = await this.prisma.section.findUnique({
          where: { id: sectionId },
          include: { grade: true },
        });
        return {
          ...baseReport,
          section: section ? { name: section.name, grade: section.grade.name } : null,
          students: classStudents,
        };

      case 'student':
        if (!studentId) {
          throw new Error('Student ID is required for student report');
        }
        const studentData = await this.getStudentAnalytics(tenantId, studentId, period, customStart, customEnd);
        return { ...baseReport, student: studentData };

      default:
        throw new Error('Invalid report type');
    }
  }
}
