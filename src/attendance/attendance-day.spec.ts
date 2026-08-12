import {
  getTenantDayRange,
  parseTimeToMinutes,
  resolveAttendanceEndTime,
  resolveAttendanceStartTime,
  resolveSchoolDays,
} from './attendance-day';

describe('attendance day helpers', () => {
  it('builds tenant-local day boundaries in UTC', () => {
    const range = getTenantDayRange(
      new Date('2026-07-21T15:30:00.000Z'),
      'Africa/Kigali',
    );

    expect(range.dateKey).toBe('2026-07-21');
    expect(range.start.toISOString()).toBe('2026-07-20T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-21T22:00:00.000Z');
    expect(range.minutesSinceMidnight).toBe(17 * 60 + 30);
    expect(range.dayOfWeek).toBe(2);
  });

  it('uses explicit tenant school-day times', () => {
    expect(
      resolveAttendanceEndTime({
        attendance: { endTime: '16:15' },
        attendanceEndTime: '16:30',
      }),
    ).toBe('16:15');
    expect(
      resolveAttendanceStartTime({
        attendance: { startTime: '07:30' },
        attendanceStartTime: '08:00',
      }),
    ).toBe('07:30');
    expect(resolveAttendanceStartTime({})).toBeNull();
    expect(resolveAttendanceEndTime({})).toBeNull();
  });

  it('validates times and school-day configuration', () => {
    expect(parseTimeToMinutes('08:30')).toBe(510);
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(resolveSchoolDays({})).toEqual([1, 2, 3, 4, 5]);
    expect(resolveSchoolDays({ schoolDays: [1, 3, 6, 8, 3] })).toEqual([
      1, 3, 6,
    ]);
  });
});
