import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StudentDayService } from './student-day.service';

const SETTINGS = {
  timezone: 'UTC',
  settings: { attendance: { schoolDays: [1, 2, 3, 4, 5], endTime: '15:00' } },
};

const day = (dateKey: string, over: Record<string, unknown> = {}) => ({
  date: new Date(`${dateKey}T00:00:00.000Z`),
  campusStatus: 'PRESENT',
  firstInAt: null,
  lastOutAt: null,
  checkInMethod: null,
  periodsExpected: 0,
  periodsPresent: 0,
  periodsAbsent: 0,
  cycleComplete: true,
  truancyFlag: false,
  unaccounted: false,
  ...over,
});

describe('StudentDayService.getStudentProfile', () => {
  const build = async (days: any[]) => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(SETTINGS) },
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          firstName: 'Ada',
          lastName: 'Lit',
          studentId: 'ST1',
          gender: 'FEMALE',
          section: { name: 'A' },
          grade: { name: 'P1' },
        }),
      },
      studentAttendanceDay: { findMany: jest.fn().mockResolvedValue(days) },
    };
    const ref = await Test.createTestingModule({
      providers: [
        StudentDayService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return ref.get(StudentDayService);
  };

  it('rates against the school-day count, not just recorded days', async () => {
    // Mon–Fri 2026-09-07..11; present Mon/Tue/Wed, no rows Thu/Fri.
    const svc = await build([
      day('2026-09-07'),
      day('2026-09-08'),
      day('2026-09-09'),
    ]);
    const r = await svc.getStudentProfile(
      't1',
      's1',
      '2026-09-07',
      '2026-09-11',
    );
    expect(r.range.schoolDays).toBe(5);
    expect(r.campus.presentDays).toBe(3);
    expect(r.campus.absentDays).toBe(2);
    expect(r.campus.rate).toBe(60);
  });

  it('computes longest present / absent streaks over the ordered school days', async () => {
    const svc = await build([
      day('2026-09-07'),
      day('2026-09-08'),
      // 09 + 10 missing → absent streak 2
      day('2026-09-11'),
    ]);
    const r = await svc.getStudentProfile(
      't1',
      's1',
      '2026-09-07',
      '2026-09-11',
    );
    expect(r.campus.longestPresentStreak).toBe(2);
    expect(r.campus.longestAbsentStreak).toBe(2);
  });

  it('derives punctuality + chronic-absence flag; carries no in-class block', async () => {
    const svc = await build([
      day('2026-09-07', { campusStatus: 'LATE' }),
      day('2026-09-08'),
    ]);
    const r = await svc.getStudentProfile(
      't1',
      's1',
      '2026-09-07',
      '2026-09-11',
    );
    expect(r.campus.lateDays).toBe(1);
    expect(r.campus.punctualityRate).toBe(50); // 1 on-time of 2 present
    expect(r.campus.rate).toBe(40); // 2 of 5 school days
    expect(r.signals.chronicAbsence).toBe(true); // 40% < 90%
    expect((r as Record<string, unknown>).inClass).toBeUndefined();
  });

  it('marks a day with no materialized row as ABSENT in daily[], matching the count', async () => {
    // Mon 09-07 present, Tue 09-08 has no StudentAttendanceDay row at all.
    const svc = await build([day('2026-09-07')]);
    const r = await svc.getStudentProfile(
      't1',
      's1',
      '2026-09-07',
      '2026-09-08',
    );
    expect(r.campus.absentDays).toBe(1);
    const missing = r.daily.find((d) => d.date === '2026-09-08');
    // Previously rendered 'NONE' here while still counting it as absent
    // above — the two must agree, or the chronic-absence banner and the
    // day-by-day trace grid visibly contradict each other.
    expect(missing?.campus).toBe('ABSENT');
  });
});

describe('StudentDayService.getCohort', () => {
  const build = async (students: any[]) => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(SETTINGS) },
      student: { findMany: jest.fn().mockResolvedValue(students) },
    };
    const ref = await Test.createTestingModule({
      providers: [
        StudentDayService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return ref.get(StudentDayService);
  };

  it('returns a campus rate and at-risk flag, no in-class rate', async () => {
    const svc = await build([
      {
        id: 's1',
        firstName: 'Ada',
        lastName: 'x',
        studentId: 'ST1',
        section: { name: 'A' },
        grade: { name: 'P1' },
        attendanceDays: [
          { date: new Date('2026-09-07T00:00:00.000Z'), campusStatus: 'PRESENT' }, // Mon
          { date: new Date('2026-09-08T00:00:00.000Z'), campusStatus: 'PRESENT' }, // Tue
        ],
      },
    ]);
    const res = await svc.getCohort('t1', '2026-09-07', '2026-09-11');
    const row = res.students[0];
    expect(row.campusRate).toBe(40); // 2 of 5 school days
    expect(row.atRisk).toBe(true);
    expect((row as Record<string, unknown>).inClassRate).toBeUndefined();
  });

  it('excludes a weekend attendance row from the campus rate', async () => {
    const svc = await build([
      {
        id: 's1',
        firstName: 'Ada',
        lastName: 'x',
        studentId: 'ST1',
        section: { name: 'A' },
        grade: { name: 'P1' },
        attendanceDays: [
          { date: new Date('2026-09-06T00:00:00.000Z'), campusStatus: 'LATE' }, // Sun — not a school day
          { date: new Date('2026-09-07T00:00:00.000Z'), campusStatus: 'PRESENT' }, // Mon
        ],
      },
    ]);
    const res = await svc.getCohort('t1', '2026-09-06', '2026-09-11');
    const row = res.students[0];
    expect(row.campusRate).toBe(20); // 1 of 5 school days — Sunday doesn't count
  });
});
