import { AttendanceStatus } from '../../../prisma/generated/client';

export class AttendanceMarkedEvent {
  static readonly EVENT = 'attendance.marked';

  constructor(
    public readonly tenantId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly status: AttendanceStatus,
    public readonly date: Date,
    /** Pre-resolved parent userIds — attendance service looks these up before emitting */
    public readonly parentUserIds: string[],
    /**
     * Set only for a live gate/device check-in (recordScan) — a pre-formatted,
     * tenant-timezone-local "h:mm AM/PM" string. Distinguishes "child just
     * arrived" (send regardless of status) from a staff manual entry (only
     * alert on ABSENT/LATE) — see DomainEventHandler.handleAttendanceMarked.
     */
    public readonly checkInTimeLabel?: string,
  ) {}
}

export class TeacherAttendanceMarkedEvent {
  static readonly EVENT = 'teacher.attendance.marked';

  constructor(
    public readonly tenantId: string,
    public readonly teacherId: string,
    public readonly status: AttendanceStatus,
    public readonly date: Date,
  ) {}
}
