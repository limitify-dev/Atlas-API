const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type AttendanceSettings = {
  attendanceStartTime?: unknown;
  attendanceEndTime?: unknown;
  schoolDayStartTime?: unknown;
  schoolDayEndTime?: unknown;
  schoolDays?: unknown;
  attendance?: {
    startTime?: unknown;
    endTime?: unknown;
    schoolDays?: unknown;
  };
};

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function getLocalDateParts(
  date: Date,
  requestedTimeZone: string,
): LocalDateParts {
  const timeZone = validTimeZone(requestedTimeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function zonedDateTimeToUtc(
  parts: Omit<LocalDateParts, 'hour' | 'minute'> & {
    hour?: number;
    minute?: number;
  },
  timeZone: string,
) {
  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
  );
  let candidate = targetAsUtc;

  // Two passes handle ordinary offsets as well as daylight-saving transitions.
  for (let pass = 0; pass < 2; pass += 1) {
    const rendered = getLocalDateParts(new Date(candidate), timeZone);
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
    );
    candidate += targetAsUtc - renderedAsUtc;
  }

  return new Date(candidate);
}

export function getTenantDateRange(dateKey: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return getTenantDayRange(new Date(dateKey), timeZone);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const followingDate = new Date(Date.UTC(year, month - 1, day + 1));

  return {
    start: zonedDateTimeToUtc({ year, month, day }, timeZone),
    end: zonedDateTimeToUtc(
      {
        year: followingDate.getUTCFullYear(),
        month: followingDate.getUTCMonth() + 1,
        day: followingDate.getUTCDate(),
      },
      timeZone,
    ),
    dateKey,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

export function getTenantDayRange(date: Date, timeZone: string) {
  const local = getLocalDateParts(date, timeZone);
  const followingDate = new Date(
    Date.UTC(local.year, local.month - 1, local.day + 1),
  );
  const start = zonedDateTimeToUtc(
    { year: local.year, month: local.month, day: local.day },
    timeZone,
  );
  const end = zonedDateTimeToUtc(
    {
      year: followingDate.getUTCFullYear(),
      month: followingDate.getUTCMonth() + 1,
      day: followingDate.getUTCDate(),
    },
    timeZone,
  );

  return {
    start,
    end,
    dateKey: `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`,
    dayOfWeek: new Date(
      Date.UTC(local.year, local.month - 1, local.day),
    ).getUTCDay(),
    minutesSinceMidnight: local.hour * 60 + local.minute,
  };
}

export function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function resolveAttendanceStartTime(settings: AttendanceSettings) {
  const candidates = [
    settings.attendance?.startTime,
    settings.attendanceStartTime,
    settings.schoolDayStartTime,
  ];

  for (const candidate of candidates) {
    if (parseTimeToMinutes(candidate) !== null) return candidate as string;
  }

  return null;
}

export function resolveAttendanceEndTime(settings: AttendanceSettings) {
  const candidates = [
    settings.attendance?.endTime,
    settings.attendanceEndTime,
    settings.schoolDayEndTime,
  ];

  for (const candidate of candidates) {
    if (parseTimeToMinutes(candidate) !== null) return candidate as string;
  }

  return null;
}

export function resolveSchoolDays(settings: AttendanceSettings) {
  const configured = settings.attendance?.schoolDays ?? settings.schoolDays;
  if (!Array.isArray(configured)) return [1, 2, 3, 4, 5];

  const days = Array.from(
    new Set(
      configured.filter(
        (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6,
      ),
    ),
  );
  return days.length > 0 ? days : [1, 2, 3, 4, 5];
}

/** Ordered YYYY-MM-DD keys for school days in [from, to] inclusive (UTC-day
 * arithmetic — matches how `SchoolEntry.date`/`StudentAttendanceDay.date`
 * are stored, both `@db.Date` truncated to UTC midnight). Shared by every
 * attendance rate/count calculation so "which days count" never drifts
 * between them — a weekend row must never be silently included by one and
 * excluded by another. */
export function schoolDayKeys(
  from: string,
  to: string,
  schoolDays: number[],
): string[] {
  const keys: string[] = [];
  const cur = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  while (cur <= end) {
    if (schoolDays.includes(cur.getUTCDay())) {
      keys.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}
