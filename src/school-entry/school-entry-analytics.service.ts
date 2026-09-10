import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AttendanceBucket {
  students: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  records: number;
  rate: number;
}

export interface ClassroomGenderRow {
  sectionId: string;
  gradeName: string;
  gradeCode: string;
  gradeLevel: number;
  sectionName: string;
  label: string;
  overall: AttendanceBucket;
  male: AttendanceBucket;
  female: AttendanceBucket;
}

export interface ClassroomGenderReport {
  period: { label: string; startDate: string; endDate: string };
  classrooms: ClassroomGenderRow[];
  totals: {
    overall: AttendanceBucket;
    male: AttendanceBucket;
    female: AttendanceBucket;
  };
}

@Injectable()
export class SchoolEntryAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Same period semantics as the old attendance analytics. */
  private getDateRange(period: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    let startDate: Date;
    const endDate = new Date(now);
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
          endDate.setTime(new Date(customEnd).getTime());
          endDate.setUTCHours(23, 59, 59, 999);
        } else {
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          startDate.setUTCHours(0, 0, 0, 0);
        }
        break;
      case 'month':
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        startDate.setUTCHours(0, 0, 0, 0);
    }
    return { startDate, endDate };
  }

  private periodLabel(period: string, start: Date, end: Date): string {
    const map: Record<string, string> = {
      today: 'Today',
      week: 'This Week',
      month: 'This Month',
      quarter: 'This Quarter',
      year: 'This Year',
      custom: 'Custom Range',
    };
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    return `${map[period] ?? 'This Month'} (${fmt(start)} – ${fmt(end)})`;
  }

  private emptyBucket(): AttendanceBucket {
    return {
      students: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      records: 0,
      rate: 0,
    };
  }

  private addStudent(bucket: AttendanceBucket, entries: { status: string }[]) {
    bucket.students += 1;
    for (const e of entries) {
      bucket.records += 1;
      if (e.status === 'PRESENT') bucket.present += 1;
      else if (e.status === 'ABSENT') bucket.absent += 1;
      else if (e.status === 'LATE') bucket.late += 1;
      else if (e.status === 'EXCUSED') bucket.excused += 1;
    }
  }

  /**
   * Rate = students present-or-late as a share of expected attendances
   * (studentsInBucket × schoolDays), NOT a share of the marks that happen to
   * exist. Capped at 100.
   */
  private finalize(bucket: AttendanceBucket, schoolDays: number) {
    const expected = bucket.students * Math.max(schoolDays, 0);
    bucket.rate =
      expected > 0
        ? Math.min(
            100,
            Math.round(((bucket.present + bucket.late) / expected) * 100),
          )
        : 0;
    return bucket;
  }

  /** Per-classroom campus attendance for a time frame, by gender + overall. */
  async getClassroomGenderReport(
    tenantId: string,
    period = 'month',
    customStart?: string,
    customEnd?: string,
    gradeId?: string,
  ): Promise<ClassroomGenderReport> {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );

    const sections = await this.prisma.section.findMany({
      where: { tenantId, isActive: true, ...(gradeId ? { gradeId } : {}) },
      include: {
        grade: { select: { name: true, code: true, level: true } },
        students: {
          select: {
            gender: true,
            schoolEntries: {
              where: { date: { gte: startDate, lte: endDate } },
              select: { status: true, date: true },
            },
          },
        },
      },
    });

    // "School days" in the window = distinct dates that actually have any
    // attendance record. Used as the per-student expected-attendance count.
    const dayKeys = new Set<string>();
    for (const s of sections)
      for (const st of s.students)
        for (const e of st.schoolEntries)
          dayKeys.add(e.date.toISOString().slice(0, 10));
    const schoolDays = dayKeys.size;

    const totalOverall = this.emptyBucket();
    const totalMale = this.emptyBucket();
    const totalFemale = this.emptyBucket();

    const classrooms: ClassroomGenderRow[] = sections.map((section) => {
      const overall = this.emptyBucket();
      const male = this.emptyBucket();
      const female = this.emptyBucket();

      for (const student of section.students) {
        this.addStudent(overall, student.schoolEntries);
        this.addStudent(totalOverall, student.schoolEntries);
        if (student.gender === 'MALE') {
          this.addStudent(male, student.schoolEntries);
          this.addStudent(totalMale, student.schoolEntries);
        } else if (student.gender === 'FEMALE') {
          this.addStudent(female, student.schoolEntries);
          this.addStudent(totalFemale, student.schoolEntries);
        }
      }

      const label =
        `${section.grade.code || section.grade.name} ${section.name}`.trim();
      return {
        sectionId: section.id,
        gradeName: section.grade.name,
        gradeCode: section.grade.code,
        gradeLevel: section.grade.level,
        sectionName: section.name,
        label,
        overall: this.finalize(overall, schoolDays),
        male: this.finalize(male, schoolDays),
        female: this.finalize(female, schoolDays),
      };
    });

    classrooms.sort(
      (a, b) => a.gradeLevel - b.gradeLevel || a.label.localeCompare(b.label),
    );

    return {
      period: {
        label: this.periodLabel(period, startDate, endDate),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      classrooms,
      totals: {
        overall: this.finalize(totalOverall, schoolDays),
        male: this.finalize(totalMale, schoolDays),
        female: this.finalize(totalFemale, schoolDays),
      },
    };
  }

  /** Flat per-classroom rates (dashboard/analytics list). */
  async getClassroomAnalytics(
    tenantId: string,
    period = 'month',
    customStart?: string,
    customEnd?: string,
  ) {
    const report = await this.getClassroomGenderReport(
      tenantId,
      period,
      customStart,
      customEnd,
    );
    return report.classrooms
      .map((c) => ({
        sectionId: c.sectionId,
        sectionName: c.sectionName,
        gradeName: c.gradeName,
        gradeCode: c.gradeCode,
        totalStudents: c.overall.students,
        presentCount: c.overall.present,
        absentCount: c.overall.absent,
        lateCount: c.overall.late,
        excusedCount: c.overall.excused,
        attendanceRate: c.overall.rate,
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate);
  }

  /** Tenant-wide summary for the given period. */
  async getOverview(
    tenantId: string,
    period = 'month',
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );
    const [grouped, dayGroups, totalStudents] = await Promise.all([
      this.prisma.schoolEntry.groupBy({
        by: ['status'],
        where: { tenantId, date: { gte: startDate, lte: endDate } },
        _count: { _all: true },
      }),
      this.prisma.schoolEntry.groupBy({
        by: ['date'],
        where: { tenantId, date: { gte: startDate, lte: endDate } },
        _count: { _all: true },
      }),
      this.prisma.student.count({ where: { tenantId } }),
    ]);
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const g of grouped) {
      counts[g.status as keyof typeof counts] = g._count._all;
    }
    const records =
      counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
    // Rate against expected attendances = students × school days with any data.
    const schoolDays = dayGroups.length;
    const expected = totalStudents * schoolDays;
    return {
      period: this.periodLabel(period, startDate, endDate),
      totalStudents,
      records,
      schoolDays,
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      excused: counts.EXCUSED,
      attendanceRate:
        expected > 0
          ? Math.min(
              100,
              Math.round(((counts.PRESENT + counts.LATE) / expected) * 100),
            )
          : 0,
    };
  }

  /**
   * Daily present-or-late rate for the last `days` days, as a share of the
   * whole enrolled student population (not just of the marks that exist).
   */
  async getTrend(tenantId: string, days = 14) {
    const now = new Date();
    const start = new Date(now.getTime() - (days - 1) * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);

    const [rows, totalStudents] = await Promise.all([
      this.prisma.schoolEntry.findMany({
        where: { tenantId, date: { gte: start } },
        select: { date: true, status: true },
      }),
      this.prisma.student.count({ where: { tenantId } }),
    ]);

    const byDay = new Map<
      string,
      { present: number; late: number; absent: number; excused: number; total: number }
    >();
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      byDay.set(d.toISOString().slice(0, 10), {
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
        total: 0,
      });
    }
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const e = byDay.get(key);
      if (!e) continue;
      e.total += 1;
      if (r.status === 'PRESENT') e.present += 1;
      else if (r.status === 'LATE') e.late += 1;
      else if (r.status === 'ABSENT') e.absent += 1;
      else if (r.status === 'EXCUSED') e.excused += 1;
    }

    return Array.from(byDay.entries()).map(([date, e]) => ({
      date,
      ...e,
      rate:
        totalStudents > 0
          ? Math.min(
              100,
              Math.round(((e.present + e.late) / totalStudents) * 100),
            )
          : 0,
    }));
  }

  /** Per-student campus attendance summary (student profile / parent app). */
  async getStudentAnalytics(
    tenantId: string,
    studentId: string,
    period = 'month',
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDate, endDate } = this.getDateRange(
      period,
      customStart,
      customEnd,
    );
    const entries = await this.prisma.schoolEntry.findMany({
      where: {
        tenantId,
        studentId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
      select: { status: true, date: true, checkInAt: true, checkOutAt: true },
    });
    const bucket = this.emptyBucket();
    this.addStudent(bucket, entries);
    // One student → expected attendances = number of days that have any record.
    const schoolDays = new Set(
      entries.map((e) => e.date.toISOString().slice(0, 10)),
    ).size;
    this.finalize(bucket, schoolDays);
    return {
      attendanceRate: bucket.rate,
      presentDays: bucket.present,
      lateDays: bucket.late,
      absentDays: bucket.absent,
      excusedDays: bucket.excused,
      totalDays: bucket.records,
      history: entries,
    };
  }
}
