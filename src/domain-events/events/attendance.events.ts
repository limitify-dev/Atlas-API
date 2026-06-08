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
