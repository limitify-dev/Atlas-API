import { buildConsultationSchedule } from './consultation-schedule';

describe('buildConsultationSchedule', () => {
  it('starts each teacher queue at the consultation start time and merges duplicate teacher entries for the same student', () => {
    const items = buildConsultationSchedule({
      baseMinutes: 8 * 60,
      seeds: [
        {
          studentId: 's1',
          studentName: 'Aldrick KALISA MPANO',
          studentCode: 'ST001',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 64,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 1',
        },
        {
          studentId: 's1',
          studentName: 'Aldrick KALISA MPANO',
          studentCode: 'ST001',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Physics',
          performance: 58,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 1',
        },
        {
          studentId: 's2',
          studentName: 'Jane Doe',
          studentCode: 'ST002',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 72,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 1',
        },
        {
          studentId: 's3',
          studentName: 'John Smith',
          studentCode: 'ST003',
          teacherId: 't2',
          teacherName: 'Ms. B',
          subject: 'Math',
          performance: 80,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 20,
          location: 'Room 2',
        },
      ],
    });

    expect(items.filter((item) => item.teacherId === 't1')).toHaveLength(2);
    expect(
      items.filter((item) => item.teacherId === 't1' && item.studentId === 's1'),
    ).toHaveLength(1);
    expect(
      items.find((item) => item.teacherId === 't1' && item.studentId === 's1')
        ?.subject,
    ).toBe('Class Teacher · Physics');
    expect(
      items.find((item) => item.teacherId === 't1' && item.studentId === 's1')
        ?.startTime,
    ).toBe('08:00');
    expect(
      items.find((item) => item.teacherId === 't1' && item.studentId === 's2')
        ?.startTime,
    ).toBe('08:15');
    expect(
      items.find((item) => item.teacherId === 't2' && item.studentId === 's3')
        ?.startTime,
    ).toBe('08:00');
  });

  it('never schedules the same student in two overlapping sessions across teachers', () => {
    const items = buildConsultationSchedule({
      baseMinutes: 9 * 60,
      seeds: [
        {
          studentId: 's1',
          studentName: 'Aldrick KALISA MPANO',
          studentCode: 'ST001',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 50,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 1',
        },
        {
          studentId: 's1',
          studentName: 'Aldrick KALISA MPANO',
          studentCode: 'ST001',
          teacherId: 't2',
          teacherName: 'Ms. B',
          subject: 'Math',
          performance: 50,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 2',
        },
      ],
    });

    const sessions = items
      .filter((i) => i.studentId === 's1')
      .map((i) => ({ start: i.startTime, end: i.endTime }));

    expect(sessions).toHaveLength(2);
    expect(sessions[0].start).not.toBe(sessions[1].start);
    expect(sessions[0].start).toBe('09:00');
    expect(sessions[1].start).toBe('09:15');
  });

  it('starts every teacher at the same base time and keeps each teacher continuous when student sets are disjoint', () => {
    const items = buildConsultationSchedule({
      baseMinutes: 8 * 60,
      seeds: [
        {
          studentId: 's1',
          studentName: 'A',
          studentCode: 'ST001',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 50,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 1',
        },
        {
          studentId: 's2',
          studentName: 'B',
          studentCode: 'ST002',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 60,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 1',
        },
        {
          studentId: 's3',
          studentName: 'C',
          studentCode: 'ST003',
          teacherId: 't2',
          teacherName: 'Ms. B',
          subject: 'Math',
          performance: 50,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 15,
          location: 'Room 2',
        },
      ],
    });

    for (const teacherId of ['t1', 't2']) {
      const teacherItems = items
        .filter((i) => i.teacherId === teacherId)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      expect(teacherItems[0].startTime).toBe('08:00');
      for (let i = 1; i < teacherItems.length; i++) {
        expect(teacherItems[i].startTime).toBe(teacherItems[i - 1].endTime);
      }
    }
  });

  it('pauses every teacher for the global break and resumes sessions afterwards', () => {
    const items = buildConsultationSchedule({
      baseMinutes: 9 * 60, // 09:00
      breakStartMinutes: 9 * 60 + 30, // 09:30
      breakDurationMinutes: 30, // until 10:00
      seeds: [
        {
          studentId: 's1',
          studentName: 'A',
          studentCode: 'ST001',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 50,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 20,
          location: 'Room 1',
        },
        {
          studentId: 's2',
          studentName: 'B',
          studentCode: 'ST002',
          teacherId: 't1',
          teacherName: 'Mr. A',
          subject: 'Class Teacher',
          performance: 60,
          sectionId: 'sec-1',
          sectionName: 'Grade 8A',
          durationMinutes: 20,
          location: 'Room 1',
        },
      ],
    });

    const t1 = items
      .filter((i) => i.teacherId === 't1')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    expect(t1[0].startTime).toBe('09:00');
    expect(t1[0].endTime).toBe('09:20');
    // The second session would have overlapped the 09:30–10:00 break, so it is
    // pushed to start exactly after the break.
    expect(t1[1].startTime).toBe('10:00');
    expect(t1[1].endTime).toBe('10:20');
    // No session runs during the break window.
    for (const i of t1) {
      const start = i.startTime;
      const end = i.endTime;
      const inBreak =
        start < '10:00' && end > '09:30';
      expect(inBreak).toBe(false);
    }
  });
});
