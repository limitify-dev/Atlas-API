import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceMethod,
  AttendanceStatus,
} from '../../prisma/generated/client';
import {
  AttendanceSettings,
  getLocalDateParts,
  parseTimeToMinutes,
  resolveAttendanceEndTime,
  resolveAttendanceStartTime,
  resolveSchoolDays,
} from './attendance-day';

export type DayState =
  | 'FULL'
  | 'LEFT_EARLY'
  | 'LATE_ARRIVAL'
  | 'ABSENT'
  | 'NO_DATA';

const ON_CAMPUS: AttendanceStatus[] = ['PRESENT', 'LATE'];

interface DayFacts {
  campusStatus: AttendanceStatus;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  checkInMethod: AttendanceMethod | null;
  periodsExpected: number;
  periodsPresent: number;
  periodsAbsent: number;
  cycleComplete: boolean;
  truancyFlag: boolean;
  unaccounted: boolean;
}

@Injectable()
export class StudentDayService {
  private readonly logger = new Logger(StudentDayService.name);

  constructor(private readonly prisma: PrismaService) {}

  private settingsOf(raw: unknown): AttendanceSettings {
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as AttendanceSettings)
      : {};
  }

  private dayUtc(dateKey: string): Date {
    return new Date(`${dateKey.slice(0, 10)}T00:00:00.000Z`);
  }

  /** Ordered YYYY-MM-DD keys for school days in [from, to] inclusive. */
  private schoolDayKeys(
    from: string,
    to: string,
    schoolDays: number[],
  ): string[] {
    const keys: string[] = [];
    const cur = this.dayUtc(from);
    const end = this.dayUtc(to);
    while (cur <= end) {
      if (schoolDays.includes(cur.getUTCDay())) {
        keys.push(cur.toISOString().slice(0, 10));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return keys;
  }

  /** Compose the raw facts of one student-day from the SchoolEntry. */
  private async factsFor(
    tenantId: string,
    studentId: string,
    day: Date,
  ): Promise<DayFacts> {
    const entry = await this.prisma.schoolEntry.findUnique({
      where: { tenantId_studentId_date: { tenantId, studentId, date: day } },
    });

    const campusStatus: AttendanceStatus = entry?.status ?? 'ABSENT';
    const cycleComplete = !!(entry?.checkInAt && entry?.checkOutAt);

    return {
      campusStatus,
      firstInAt: entry?.checkInAt ?? null,
      lastOutAt: entry?.checkOutAt ?? null,
      checkInMethod: entry?.checkInMethod ?? null,
      periodsExpected: 0,
      periodsPresent: 0,
      periodsAbsent: 0,
      cycleComplete,
      truancyFlag: false,
      unaccounted: false,
    };
  }

  private classify(facts: DayFacts, endMinutes: number | null): DayState {
    const onCampus = ON_CAMPUS.includes(facts.campusStatus);
    if (!onCampus) return 'ABSENT';
    if (
      facts.lastOutAt &&
      endMinutes !== null &&
      facts.lastOutAt.getUTCHours() * 60 + facts.lastOutAt.getUTCMinutes() <
        endMinutes - 30
    ) {
      return 'LEFT_EARLY';
    }
    if (facts.campusStatus === 'LATE') return 'LATE_ARRIVAL';
    return 'FULL';
  }

  private async tenantConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, settings: true },
    });
    const settings = this.settingsOf(tenant?.settings);
    const chronicPct =
      typeof (settings as Record<string, unknown>)
        .chronicAbsenceThresholdPct === 'number'
        ? (settings as Record<string, number>).chronicAbsenceThresholdPct
        : 90;
    return {
      settings,
      timezone: tenant?.timezone || 'UTC',
      schoolDays: resolveSchoolDays(settings),
      startMinutes: parseTimeToMinutes(resolveAttendanceStartTime(settings)),
      endMinutes: parseTimeToMinutes(resolveAttendanceEndTime(settings)),
      chronicPct,
    };
  }

  // ── Live per-student day ───────────────────────────────────────────────────

  /** The campus check-in / check-out cycle for one student on a day. */
  async getStudentDay(tenantId: string, studentId: string, dateKey: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentId: true,
        sectionId: true,
        section: { select: { name: true } },
        grade: { select: { name: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const { endMinutes } = await this.tenantConfig(tenantId);
    const day = this.dayUtc(dateKey);

    const entry = await this.prisma.schoolEntry.findUnique({
      where: { tenantId_studentId_date: { tenantId, studentId, date: day } },
    });

    const facts = await this.factsFor(tenantId, studentId, day);
    const triage = this.classify(facts, endMinutes);

    type TimelineEvent =
      | {
          kind: 'check-in';
          at: string | null;
          method: AttendanceMethod | null;
          status: AttendanceStatus;
        }
      | {
          kind: 'check-out';
          at: string | null;
          method: AttendanceMethod | null;
        };

    const timeline: TimelineEvent[] = [];
    if (entry?.checkInAt || ON_CAMPUS.includes(facts.campusStatus)) {
      timeline.push({
        kind: 'check-in',
        at: entry?.checkInAt?.toISOString() ?? null,
        method: entry?.checkInMethod ?? null,
        status: facts.campusStatus,
      });
    }
    if (entry?.checkOutAt) {
      timeline.push({
        kind: 'check-out',
        at: entry.checkOutAt.toISOString(),
        method: entry.checkOutMethod ?? null,
      });
    }

    return {
      student: {
        id: student.id,
        displayId: student.studentId,
        name: `${student.firstName} ${student.lastName}`.trim(),
        section: student.section?.name ?? null,
        grade: student.grade?.name ?? null,
      },
      date: dateKey,
      triage,
      ...facts,
      firstInAt: facts.firstInAt?.toISOString() ?? null,
      lastOutAt: facts.lastOutAt?.toISOString() ?? null,
      timeline,
    };
  }

  // ── Full per-student attendance profile (trace + feature vector) ──────────

  /**
   * A single structured record of one student's campus attendance over a
   * range: a day-by-day trace for the calendar, day-of-week and weekly
   * patterns, arrival timing, and a flat set of derived risk signals.
   */
  async getStudentProfile(
    tenantId: string,
    studentId: string,
    from: string,
    to: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentId: true,
        gender: true,
        section: { select: { name: true } },
        grade: { select: { name: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const { schoolDays, chronicPct, startMinutes, timezone } =
      await this.tenantConfig(tenantId);
    const keys = this.schoolDayKeys(from, to, schoolDays);
    const fromDay = this.dayUtc(from);
    const toDay = this.dayUtc(to);

    const days = await this.prisma.studentAttendanceDay.findMany({
      where: { tenantId, studentId, date: { gte: fromDay, lte: toDay } },
      orderBy: { date: 'asc' },
    });

    const byKey = new Map(
      days.map((d) => [d.date.toISOString().slice(0, 10), d]),
    );

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = Array.from({ length: 7 }, (_, i) => ({
      dow: i,
      label: DOW[i],
      schoolDays: 0,
      present: 0,
    }));
    const weekMap = new Map<
      string,
      { schoolDays: number; campusPresent: number }
    >();

    let presentDays = 0;
    let lateDays = 0;
    let absentDays = 0;
    let excusedDays = 0;
    let incompleteDays = 0;
    let longestPresentStreak = 0;
    let longestAbsentStreak = 0;
    let currentAbsenceStreak = 0;
    let curPresent = 0;
    let curAbsent = 0;
    let arrivalSum = 0;
    let arrivalCount = 0;
    let checkoutCount = 0;

    const daily: Array<{
      date: string;
      campus: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' | 'NONE';
      firstInAt: string | null;
      lastOutAt: string | null;
    }> = [];

    for (const key of keys) {
      const d = byKey.get(key);
      const dt = new Date(`${key}T00:00:00.000Z`);
      const wd = dt.getUTCDay();
      const monday = new Date(dt);
      monday.setUTCDate(dt.getUTCDate() - ((wd + 6) % 7));
      const wk = monday.toISOString().slice(0, 10);
      const w = weekMap.get(wk) ?? { schoolDays: 0, campusPresent: 0 };

      dow[wd].schoolDays += 1;
      w.schoolDays += 1;

      const status = d?.campusStatus ?? null;
      const onCampus = status === 'PRESENT' || status === 'LATE';
      // What actually gets counted below must be the same thing shown in
      // `daily[]` — a day with no materialized row was being counted as
      // ABSENT in the aggregate (chronic-absence banner etc.) but rendered
      // as 'NONE'/"No record" in the day-by-day trace, so the two visibly
      // disagreed. displayStatus is set in every branch and is what both
      // the count AND the trace now use.
      let displayStatus: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

      if (onCampus) {
        presentDays += 1;
        curPresent += 1;
        curAbsent = 0;
        currentAbsenceStreak = 0;
        dow[wd].present += 1;
        w.campusPresent += 1;
        if (status === 'LATE') lateDays += 1;
        if (!d!.cycleComplete) incompleteDays += 1;
        if (d!.lastOutAt) checkoutCount += 1;
        if (d!.firstInAt && startMinutes !== null) {
          const local = getLocalDateParts(d!.firstInAt, timezone);
          arrivalSum += local.hour * 60 + local.minute - startMinutes;
          arrivalCount += 1;
        }
        displayStatus = status as 'PRESENT' | 'LATE';
      } else if (status === 'EXCUSED') {
        excusedDays += 1;
        curAbsent += 1;
        curPresent = 0;
        currentAbsenceStreak += 1;
        displayStatus = 'EXCUSED';
      } else {
        absentDays += 1;
        curAbsent += 1;
        curPresent = 0;
        currentAbsenceStreak += 1;
        displayStatus = 'ABSENT';
      }
      longestPresentStreak = Math.max(longestPresentStreak, curPresent);
      longestAbsentStreak = Math.max(longestAbsentStreak, curAbsent);

      weekMap.set(wk, w);

      daily.push({
        date: key,
        campus: displayStatus,
        firstInAt: d?.firstInAt?.toISOString() ?? null,
        lastOutAt: d?.lastOutAt?.toISOString() ?? null,
      });
    }

    const schoolDayCount = keys.length || 1;
    const campusRate = Math.round((presentDays / schoolDayCount) * 100);
    const punctualityRate =
      presentDays > 0
        ? Math.round(((presentDays - lateDays) / presentDays) * 100)
        : null;
    const cycleCompleteRate =
      presentDays > 0
        ? Math.round(((presentDays - incompleteDays) / presentDays) * 100)
        : null;

    const weekly = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, w]) => ({
        weekStart,
        campusRate: w.schoolDays
          ? Math.round((w.campusPresent / w.schoolDays) * 100)
          : 0,
      }));

    // Trend direction: second-half campus rate vs first-half.
    let trendDelta = 0;
    if (keys.length >= 6) {
      const mid = Math.floor(keys.length / 2);
      const rate = (slice: string[]) =>
        slice.length
          ? (slice.filter((k) => {
              const s = byKey.get(k)?.campusStatus;
              return s === 'PRESENT' || s === 'LATE';
            }).length /
              slice.length) *
            100
          : 0;
      trendDelta = Math.round(rate(keys.slice(mid)) - rate(keys.slice(0, mid)));
    }

    const avgArrivalMinutes =
      arrivalCount > 0 ? Math.round(arrivalSum / arrivalCount) : null;

    return {
      student: {
        id: student.id,
        displayId: student.studentId,
        name: `${student.firstName} ${student.lastName}`.trim(),
        gender: student.gender,
        grade: student.grade?.name ?? null,
        section: student.section?.name ?? null,
      },
      range: { from, to, schoolDays: keys.length },
      campus: {
        rate: campusRate,
        presentDays,
        lateDays,
        absentDays,
        excusedDays,
        punctualityRate,
        avgArrivalMinutes,
        checkoutRate:
          presentDays > 0
            ? Math.round((checkoutCount / presentDays) * 100)
            : null,
        cycleCompleteRate,
        longestPresentStreak,
        longestAbsentStreak,
        currentAbsenceStreak,
      },
      dayOfWeek: dow
        .filter((d) => d.schoolDays > 0)
        .map((d) => ({
          ...d,
          rate: d.schoolDays ? Math.round((d.present / d.schoolDays) * 100) : 0,
        })),
      weekly,
      daily,
      signals: {
        chronicAbsence: campusRate < chronicPct || absentDays > 10,
        chronicThresholdPct: chronicPct,
        trendDelta,
        declining: trendDelta <= -10,
        frequentLate: presentDays >= 5 && lateDays / presentDays >= 0.2,
        chronicLeaver: presentDays >= 5 && incompleteDays / presentDays >= 0.3,
      },
    };
  }

  // ── Cohort roster with campus attendance rate ────────────────────────────

  async getCohort(
    tenantId: string,
    from: string,
    to: string,
    filters: {
      sectionId?: string;
      gradeId?: string;
      program?: 'BOARDING' | 'DAY';
    } = {},
  ) {
    const { schoolDays, chronicPct } = await this.tenantConfig(tenantId);
    const schoolDayCount = this.schoolDayKeys(from, to, schoolDays).length || 1;
    const fromDay = this.dayUtc(from);
    const toDay = this.dayUtc(to);

    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
        ...(filters.program ? { program: filters.program } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentId: true,
        program: true,
        section: { select: { name: true } },
        grade: { select: { name: true } },
        attendanceDays: {
          where: { date: { gte: fromDay, lte: toDay } },
          select: { campusStatus: true },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return {
      range: { from, to, schoolDays: schoolDayCount },
      students: students.map((s) => {
        const present = s.attendanceDays.filter((d) =>
          ON_CAMPUS.includes(d.campusStatus),
        ).length;
        const campusRate = Math.round((present / schoolDayCount) * 100);
        return {
          studentId: s.id,
          displayId: s.studentId,
          name: `${s.firstName} ${s.lastName}`.trim(),
          section: s.section?.name ?? null,
          grade: s.grade?.name ?? null,
          // Gate-based "on campus" tracking means something different for a
          // boarder (already lives on campus — may rarely tap the gate at
          // all) than a day scholar (the gate tap *is* their attendance
          // signal). Surfaced per-row so the two are never silently averaged
          // together as if they measured the same thing.
          program: s.program ?? null,
          campusRate,
          atRisk: campusRate < chronicPct,
        };
      }),
    };
  }

  // ── Materialisation ──────────────────────────────────────────────────────

  /** Rebuild one student-day row. */
  async materializeStudentDay(
    tenantId: string,
    studentId: string,
    dateKey: string,
  ) {
    const day = this.dayUtc(dateKey);
    const facts = await this.factsFor(tenantId, studentId, day);
    return this.prisma.studentAttendanceDay.upsert({
      where: {
        tenantId_studentId_date: { tenantId, studentId, date: day },
      },
      create: { tenantId, studentId, date: day, ...facts },
      update: { ...facts },
    });
  }

  /**
   * Rebuild every (student, day) that has a SchoolEntry or an Attendance row in
   * [from, to] for a tenant. Days with no campus record stay absent implicitly
   * (no row) — analytics use the school-day count as the denominator.
   */
  async materializeRange(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<{ pairs: number }> {
    const fromDay = this.dayUtc(from);
    const toDay = this.dayUtc(to);

    const [entries, lessons] = await Promise.all([
      this.prisma.schoolEntry.findMany({
        where: { tenantId, date: { gte: fromDay, lte: toDay } },
        select: { studentId: true, date: true },
      }),
      this.prisma.attendance.findMany({
        where: { tenantId, date: { gte: fromDay, lte: toDay } },
        select: { studentId: true, date: true },
      }),
    ]);

    const pairs = new Set<string>();
    for (const r of [...entries, ...lessons]) {
      if (!r.date) continue;
      pairs.add(`${r.studentId}|${r.date.toISOString().slice(0, 10)}`);
    }

    for (const pair of pairs) {
      const [studentId, dateKey] = pair.split('|');
      await this.materializeStudentDay(tenantId, studentId, dateKey).catch(
        (e) =>
          this.logger.warn(
            `materialize ${studentId} ${dateKey}: ${
              e instanceof Error ? e.message : e
            }`,
          ),
      );
    }

    return { pairs: pairs.size };
  }
}
