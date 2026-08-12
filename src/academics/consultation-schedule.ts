export type ConsultationSeed = {
  studentId: string;
  studentName: string;
  studentCode: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  performance: number;
  sectionId: string | null;
  sectionName: string;
  durationMinutes: number;
  location: string;
};

export type ConsultationItem = {
  studentId: string;
  studentName: string;
  studentCode: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  performance: number;
  sectionId: string | null;
  sectionName: string;
};

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = ((totalMinutes % 60) + 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Builds the tenant-wide consultation schedule.
 *
 * Every teacher starts at `baseMinutes` (e.g. 08:00) and runs a *continuous*
 * back-to-back queue of their students (no idle gaps unless a teacher's only
 * remaining students are all temporarily busy with another teacher — an
 * unavoidable consequence of a student meeting several teachers in sequence).
 *
 * A global greedy strategy keeps teachers collision-free and balanced:
 *  - at each step the earliest-free teacher is served, which equalises end
 *    times so teachers finish at roughly the same moment;
 *  - a student is never booked into two overlapping sessions, because a
 *    student's next-available minute is tracked and a teacher simply takes its
 *    highest-priority *free* student when its cursor arrives.
 */
export function buildConsultationSchedule({
  baseMinutes,
  seeds,
  date,
  breakStartMinutes = null,
  breakDurationMinutes = 0,
}: {
  baseMinutes: number;
  seeds: ConsultationSeed[];
  date?: string;
  /** Global break start (minutes since midnight); sessions pause here. */
  breakStartMinutes?: number | null;
  /** Break length in minutes; 0 / null / omitted means no break. */
  breakDurationMinutes?: number | null;
}) {
  // Group seeds by teacher, merging duplicate (student, teacher) entries
  // (a student appears at most once per teacher; combine their subjects).
  const grouped = new Map<string, ConsultationSeed[]>();
  for (const seed of seeds) {
    const existing = grouped.get(seed.teacherId) ?? [];
    const mergedForStudent = existing.find(
      (item) => item.studentId === seed.studentId,
    );
    if (mergedForStudent) {
      mergedForStudent.subject = [mergedForStudent.subject, seed.subject]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' · ');
      continue;
    }
    existing.push(seed);
    grouped.set(seed.teacherId, existing);
  }

  type TeacherQueue = {
    teacherId: string;
    pending: ConsultationSeed[];
  };

  const queues: TeacherQueue[] = [];
  for (const [teacherId, list] of grouped.entries()) {
    const pending = [...list].sort((a, b) => {
      if (a.performance !== b.performance)
        return a.performance - b.performance;
      if (a.studentName !== b.studentName)
        return a.studentName.localeCompare(b.studentName);
      return a.subject.localeCompare(b.subject);
    });
    queues.push({ teacherId, pending });
  }

  const teacherCursor = new Map<string, number>();
  for (const q of queues) teacherCursor.set(q.teacherId, baseMinutes);
  const studentBusyUntil = new Map<string, number>();

  // Global break: every teacher pauses for it and sessions resume afterwards.
  const hasBreak = !!breakStartMinutes && (breakDurationMinutes ?? 0) > 0;
  const breakEnd = hasBreak
    ? (breakStartMinutes as number) + (breakDurationMinutes as number)
    : 0;
  const resolveStart = (start: number, duration: number): number => {
    if (!hasBreak) return start;
    const bStart = breakStartMinutes as number;
    // If the session would overlap the break window, move it to start after
    // the break so the whole day pauses together.
    if (start < breakEnd && start + duration > bStart) return breakEnd;
    return start;
  };

  const items: ConsultationItem[] = [];
  const totalPending = queues.reduce((n, q) => n + q.pending.length, 0);

  let scheduled = 0;
  while (scheduled < totalPending) {
    // Serve the earliest-free teacher first — keeps every teacher moving and
    // balances end times so they finish at roughly the same moment.
    let pick: TeacherQueue | null = null;
    for (const q of queues) {
      if (q.pending.length === 0) continue;
      if (!pick) {
        pick = q;
        continue;
      }
      const cPick = teacherCursor.get(pick.teacherId)!;
      const cQ = teacherCursor.get(q.teacherId)!;
      if (cQ < cPick || (cQ === cPick && q.teacherId < pick.teacherId))
        pick = q;
    }
    if (!pick) break;

    const cursor = teacherCursor.get(pick.teacherId)!;

    // Take this teacher's highest-priority student who is free right now, so
    // the teacher's queue stays continuous.
    let chosenIdx = -1;
    for (let i = 0; i < pick.pending.length; i++) {
      const s = pick.pending[i];
      if ((studentBusyUntil.get(s.studentId) ?? 0) <= cursor) {
        chosenIdx = i;
        break;
      }
    }

    if (chosenIdx === -1) {
      // Every remaining student for this teacher is busy elsewhere. Advance
      // the teacher's cursor to the moment its earliest student becomes free
      // (a forced, rare gap — otherwise the teacher would be idle forever).
      let nextFree = Infinity;
      for (const s of pick.pending) {
        const free = studentBusyUntil.get(s.studentId) ?? 0;
        if (free < nextFree) nextFree = free;
      }
      teacherCursor.set(pick.teacherId, Math.max(nextFree, cursor + 1));
      continue;
    }

    const seed = pick.pending.splice(chosenIdx, 1)[0];
    const startMinutes = resolveStart(cursor, seed.durationMinutes);
    const endMinutes = startMinutes + seed.durationMinutes;
    studentBusyUntil.set(seed.studentId, endMinutes);
    teacherCursor.set(pick.teacherId, endMinutes);
    scheduled++;

    items.push({
      studentId: seed.studentId,
      studentName: seed.studentName,
      studentCode: seed.studentCode,
      teacherId: pick.teacherId,
      teacherName: seed.teacherName,
      subject: seed.subject,
      date: date ?? '',
      startTime: formatTime(startMinutes),
      endTime: formatTime(endMinutes),
      location: seed.location,
      performance: seed.performance,
      sectionId: seed.sectionId,
      sectionName: seed.sectionName,
    });
  }

  return items.sort((a, b) =>
    `${a.teacherId}:${a.startTime}`.localeCompare(
      `${b.teacherId}:${b.startTime}`,
    ),
  );
}
