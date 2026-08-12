import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { AttendanceMarkedEvent } from '../domain-events/events';
import { AttendanceStatus, Prisma } from '../../prisma/generated/client';
import type { AttendanceWhereInput } from '../../prisma/generated/models/Attendance';
import type { AttendanceGetPayload } from '../../prisma/generated/models/Attendance';
import type { StudentGetPayload } from '../../prisma/generated/models/Student';
import type { TeacherAttendanceGetPayload } from '../../prisma/generated/models/TeacherAttendance';
import {
  AttendanceSettings,
  getLocalDateParts,
  getTenantDateRange,
  getTenantDayRange,
  parseTimeToMinutes,
  resolveAttendanceEndTime,
  resolveAttendanceStartTime,
  resolveSchoolDays,
} from './attendance-day';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly cache: CacheService,
  ) {}

  private normalizeSettings(settings: unknown): AttendanceSettings {
    return settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as AttendanceSettings)
      : {};
  }

  async getAttendanceSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, settings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = this.normalizeSettings(tenant.settings);
    return {
      timezone: tenant.timezone || 'UTC',
      startTime: resolveAttendanceStartTime(settings),
      endTime: resolveAttendanceEndTime(settings),
      schoolDays: resolveSchoolDays(settings),
      configured:
        resolveAttendanceStartTime(settings) !== null &&
        resolveAttendanceEndTime(settings) !== null,
    };
  }

  async updateAttendanceSettings(
    tenantId: string,
    schedule: {
      startTime: string;
      endTime: string;
      schoolDays?: number[];
      timezone?: string;
    },
  ) {
    const startMinutes = parseTimeToMinutes(schedule.startTime);
    const endMinutes = parseTimeToMinutes(schedule.endTime);
    if (
      startMinutes === null ||
      endMinutes === null ||
      startMinutes >= endMinutes
    ) {
      throw new BadRequestException(
        'School start time must be earlier than school end time',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (schedule.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', {
          timeZone: schedule.timezone,
        }).format();
      } catch {
        throw new BadRequestException('Enter a valid IANA timezone');
      }
    }

    const current = this.normalizeSettings(tenant.settings);
    const schoolDays = resolveSchoolDays({
      schoolDays: schedule.schoolDays,
    });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(schedule.timezone && { timezone: schedule.timezone }),
        settings: {
          ...current,
          attendance: {
            ...(current.attendance ?? {}),
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            schoolDays,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return this.getAttendanceSettings(tenantId);
  }

  /**
   * Notify parents that a student was marked LATE or ABSENT.
   * Emits AttendanceMarkedEvent with pre-resolved parent userIds.
   */
  private async emitAttendanceMarked(
    tenantId: string,
    studentId: string,
    status: AttendanceStatus,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        parents: { include: { parent: { include: { user: true } } } },
      },
    });
    if (!student) return;

    const parentUserIds = student.parents
      .map((sp) => sp.parent?.user?.id)
      .filter((id): id is string => Boolean(id));

    this.events.emit(
      new AttendanceMarkedEvent(
        tenantId,
        studentId,
        `${student.firstName} ${student.lastName}`,
        status,
        new Date(),
        parentUserIds,
      ),
    );
  }

  async getStudentsByClassroom(
    tenantId: string,
    sectionId?: string,
    gradeId?: string,
    date?: string,
  ) {
    const where: {
      tenantId: string;
      sectionId?: string;
      gradeId?: string;
    } = { tenantId };

    if (sectionId) {
      where.sectionId = sectionId;
    } else if (gradeId) {
      where.gradeId = gradeId;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone || 'UTC';
    const dayRange = date
      ? getTenantDateRange(date.slice(0, 10), timezone)
      : getTenantDayRange(new Date(), timezone);

    const students = await this.prisma.student.findMany({
      where,
      include: {
        section: {
          include: {
            grade: true,
          },
        },
        attendances: {
          where: {
            createdAt: {
              gte: dayRange.start,
              lt: dayRange.end,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        card: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    type StudentWithLatestAttendance = StudentGetPayload<{
      include: {
        section: {
          include: {
            grade: true;
          };
        };
        attendances: true;
        card: true;
      };
    }>;
    type AttendanceRecord = StudentWithLatestAttendance['attendances'][number];
    type GroupedStudent = Omit<StudentWithLatestAttendance, 'attendances'> & {
      attendance: AttendanceRecord | null;
    };
    type GroupedBySection = Record<
      string,
      {
        section: StudentWithLatestAttendance['section'];
        students: GroupedStudent[];
      }
    >;

    // Group students by section/classroom
    const groupedBySection = students.reduce<GroupedBySection>(
      (acc, student) => {
        const sectionKey = String(student.section.id);
        if (!acc[sectionKey]) {
          acc[sectionKey] = {
            section: student.section,
            students: [],
          };
        }

        const { attendances, ...studentWithoutAttendances } = student;
        acc[sectionKey].students.push({
          ...studentWithoutAttendances,
          attendance: attendances[0] ?? null,
        });

        return acc;
      },
      {},
    );

    return Object.values(groupedBySection);
  }

  async markAttendance(data: {
    tenantId: string;
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    isManual: boolean;
    date?: string;
    checkInTime?: string;
    checkInDateTime?: Date;
    remarks?: string;
  }) {
    type AttendanceWithStudentSection = AttendanceGetPayload<{
      include: {
        student: {
          include: {
            section: true;
          };
        };
      };
    }>;

    const student = await this.prisma.student.findFirst({
      where: { id: data.studentId, tenantId: data.tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: data.tenantId },
      select: { timezone: true },
    });
    const dayRange = data.date
      ? getTenantDateRange(data.date.slice(0, 10), tenant?.timezone || 'UTC')
      : getTenantDayRange(
          data.checkInDateTime ?? new Date(),
          tenant?.timezone || 'UTC',
        );

    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        tenantId: data.tenantId,
        studentId: data.studentId,
        createdAt: {
          gte: dayRange.start,
          lt: dayRange.end,
        },
      },
      include: {
        student: {
          include: {
            section: true,
          },
        },
      },
    });

    let attendance: AttendanceWithStudentSection;

    if (existingAttendance) {
      // Only allow updates for manual attendance
      // Auto check-in should not overwrite existing records
      if (!data.isManual) {
        // Return existing attendance without updating
        return {
          ...existingAttendance,
          method: 'auto',
          checkInTime: existingAttendance.checkInTime?.toISOString() || null,
          alreadyRecorded: true,
        };
      }

      // Update existing attendance for today (manual only)
      attendance = await this.prisma.attendance.update({
        where: {
          id: existingAttendance.id,
        },
        data: {
          status: data.status as AttendanceStatus,
          checkInTime: data.checkInDateTime || existingAttendance.checkInTime,
          remarks: `Manual entry${data.remarks ? `: ${data.remarks}` : ''}`,
        },
        include: {
          student: {
            include: {
              section: true,
            },
          },
        },
      });
    } else {
      // Create new attendance record
      attendance = await this.prisma.attendance.create({
        data: {
          tenantId: data.tenantId,
          studentId: data.studentId,
          status: data.status as AttendanceStatus,
          checkInTime: data.checkInDateTime || null,
          createdAt: data.date
            ? new Date(
                dayRange.start.getTime() +
                  (dayRange.end.getTime() - dayRange.start.getTime()) / 2,
              )
            : undefined,
          remarks: data.isManual
            ? `Manual entry${data.remarks ? `: ${data.remarks}` : ''}`
            : data.remarks || 'Auto check-in',
        },
        include: {
          student: {
            include: {
              section: true,
            },
          },
        },
      });
    }

    // Notify parents only for LATE / ABSENT, and only when the status is new
    // or actually changed (re-saving the same status must not re-notify).
    const statusChanged =
      !existingAttendance ||
      existingAttendance.status !== (data.status as AttendanceStatus);
    if (statusChanged && (data.status === 'ABSENT' || data.status === 'LATE')) {
      await this.emitAttendanceMarked(
        data.tenantId,
        data.studentId,
        data.status as AttendanceStatus,
      );
    }

    return {
      ...attendance,
      method: data.isManual ? 'manual' : 'auto',
      checkInTime: data.checkInTime,
    };
  }

  async autoCheckIn(data: {
    cardNumber: string;
    tenantId: string;
    date: string;
    location?: string;
  }) {
    type TeacherAttendanceWithTeacher = TeacherAttendanceGetPayload<{
      include: {
        teacher: true;
      };
    }>;

    const dateEntry = new Date(data.date);
    // Find the card
    const card = await this.prisma.card.findFirst({
      where: {
        cardNumber: data.cardNumber,
        tenantId: data.tenantId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          include: {
            section: true,
          },
        },
        teacher: true,
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found or inactive');
    }

    const checkInDateTime = dateEntry;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: data.tenantId },
      select: { timezone: true, settings: true },
    });
    const timezone = tenant?.timezone || 'UTC';
    const settings = this.normalizeSettings(tenant?.settings);
    const local = getLocalDateParts(checkInDateTime, timezone);
    const hour = local.hour;
    const minute = local.minute;
    const checkInTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const startMinutes = parseTimeToMinutes(
      resolveAttendanceStartTime(settings),
    );
    const isLate = startMinutes !== null && hour * 60 + minute > startMinutes;

    const status: AttendanceStatus = isLate ? 'LATE' : 'PRESENT';

    if (card.student) {
      // Student check-in
      const attendance = await this.markAttendance({
        tenantId: data.tenantId,
        studentId: card.studentId!,
        status,
        isManual: false,
        checkInTime,
        checkInDateTime: checkInDateTime,
        remarks: `Auto check-in at ${data.location || 'entrance'}`,
      });

      // Log the card usage
      await this.prisma.cardLog.create({
        data: {
          tenantId: data.tenantId,
          cardId: card.id,
          action: 'SCANNED',
          location: data.location || 'entrance',
          description: `Student attendance check-in - ${status}`,
        },
      });

      // Update card last used
      await this.prisma.card.update({
        where: { id: card.id },
        data: { lastUsedAt: checkInDateTime },
      });

      return {
        success: true,
        type: 'student',
        attendance,
        checkInTime,
        status,
      };
    } else if (card.teacher) {
      const dayRange = getTenantDayRange(dateEntry, timezone);

      // Check if teacher already checked in today
      const existingAttendance = await this.prisma.teacherAttendance.findFirst({
        where: {
          tenantId: data.tenantId,
          teacherId: card.teacherId!,
          createdAt: {
            gte: dayRange.start,
            lt: dayRange.end,
          },
        },
      });

      let teacherAttendance: TeacherAttendanceWithTeacher;

      if (existingAttendance) {
        // Update existing attendance (check-out)
        teacherAttendance = await this.prisma.teacherAttendance.update({
          where: {
            id: existingAttendance.id,
          },
          data: {
            checkOutTime: checkInDateTime,
            remarks: `Check-out at ${data.location || 'entrance'}`,
          },
          include: {
            teacher: true,
          },
        });
      } else {
        // Create new attendance record (check-in)
        teacherAttendance = await this.prisma.teacherAttendance.create({
          data: {
            tenantId: data.tenantId,
            teacherId: card.teacherId!,
            status,
            checkInTime: checkInDateTime,
            remarks: `Check-in at ${data.location || 'entrance'}`,
          },
          include: {
            teacher: true,
          },
        });
      }

      await this.prisma.cardLog.create({
        data: {
          tenantId: data.tenantId,
          cardId: card.id,
          action: 'SCANNED',
          location: data.location || 'entrance',
          description: `Teacher ${existingAttendance ? 'check-out' : 'check-in'} at ${checkInTime} - ${status}`,
        },
      });

      await this.prisma.card.update({
        where: { id: card.id },
        data: { lastUsedAt: checkInDateTime },
      });

      return {
        success: true,
        type: 'teacher',
        attendance: teacherAttendance,
        teacher: card.teacher,
        checkInTime,
        status,
        action: existingAttendance ? 'checkout' : 'checkin',
      };
    }

    throw new BadRequestException(
      'Card is not associated with a student or teacher',
    );
  }

  /**
   * Get attendance records (flat list) with pagination
   */
  async getAttendanceRecords(
    tenantId: string,
    date?: string,
    sectionId?: string,
    gradeId?: string,
    page: number = 1,
    limit: number = 100,
    studentId?: string,
  ) {
    const where: AttendanceWhereInput = {
      tenantId,
    };

    if (studentId) {
      where.studentId = studentId;
    } else if (sectionId) {
      where.student = { sectionId };
    } else if (gradeId) {
      where.student = { gradeId };
    }

    // Add date filtering if provided
    if (date) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const dayRange = getTenantDateRange(
        date.slice(0, 10),
        tenant?.timezone || 'UTC',
      );

      where.createdAt = {
        gte: dayRange.start,
        lt: dayRange.end,
      };
    }

    const [attendances, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          student: {
            include: {
              section: {
                include: {
                  grade: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data: attendances,
      total,
      page,
      limit,
    };
  }

  /**
   * Bulk mark attendance for multiple students
   */
  async markBulkAttendance(
    tenantId: string,
    records: Array<{
      studentId: string;
      status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      date?: string;
      remarks?: string;
    }>,
  ) {
    const results: Array<
      Awaited<ReturnType<AttendanceService['markAttendance']>>
    > = [];

    for (const record of records) {
      const result = await this.markAttendance({
        tenantId,
        studentId: record.studentId,
        status: record.status,
        isManual: true,
        date: record.date,
        remarks: record.remarks,
      });
      results.push(result);
    }

    return {
      success: true,
      count: results.length,
      data: results,
    };
  }

  async getAttendanceReport(
    tenantId: string,
    sectionId?: string,
    gradeId?: string,
    date?: string,
  ) {
    const where: AttendanceWhereInput = {
      tenantId,
    };

    if (sectionId) {
      where.student = { sectionId };
    } else if (gradeId) {
      where.student = { gradeId };
    }

    // Add date filtering if provided
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const attendances = await this.prisma.attendance.findMany({
      where,
      include: {
        student: {
          include: {
            section: {
              include: {
                grade: true,
              },
            },
          },
        },
      },
      orderBy: {
        student: {
          lastName: 'asc',
        },
      },
    });

    return attendances;
  }

  async getAttendanceStats(tenantId: string, date?: string) {
    return this.cache.getOrSet(
      `attendance:stats:${tenantId}:${date ?? 'today'}`,
      30,
      () => this.computeAttendanceStats(tenantId, date),
    );
  }

  private async computeAttendanceStats(tenantId: string, date?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone || 'UTC';
    const dayRange = date
      ? getTenantDateRange(date.slice(0, 10), timezone)
      : getTenantDayRange(new Date(), timezone);

    const stats = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: {
          gte: dayRange.start,
          lt: dayRange.end,
        },
      },
      _count: {
        status: true,
      },
    });

    const totalStudents = await this.prisma.student.count({
      where: { tenantId },
    });

    const statsMap: Record<'present' | 'absent' | 'late' | 'excused', number> =
      {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };

    for (const stat of stats) {
      if (stat.status === 'PRESENT') statsMap.present = stat._count.status;
      if (stat.status === 'ABSENT') statsMap.absent = stat._count.status;
      if (stat.status === 'LATE') statsMap.late = stat._count.status;
      if (stat.status === 'EXCUSED') statsMap.excused = stat._count.status;
    }

    const markedCount = stats.reduce(
      (sum, stat) => sum + stat._count.status,
      0,
    );
    const notMarkedCount = Math.max(totalStudents - markedCount, 0);
    const attendanceRate =
      totalStudents > 0 ? (statsMap.present / totalStudents) * 100 : 0;

    return {
      present: statsMap.present,
      absent: statsMap.absent,
      late: statsMap.late,
      excused: statsMap.excused,
      // Keep `total` for existing mobile consumers and expose the documented
      // fields used by both admin attendance dashboards.
      total: totalStudents,
      totalStudents,
      markedCount,
      notMarkedCount,
      attendanceRate: Math.round(attendanceRate * 10) / 10,
      date: date ?? dayRange.dateKey,
    };
  }

  // Teacher Attendance Methods
  async getTeacherAttendanceReport(tenantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const attendances = await this.prisma.teacherAttendance.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        teacher: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return attendances;
  }

  async getTeacherAttendanceStats(tenantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const stats = await this.prisma.teacherAttendance.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      _count: {
        status: true,
      },
    });

    const totalTeachers = await this.prisma.teacher.count({
      where: { tenantId },
    });

    const statsMap: Record<'present' | 'absent' | 'late' | 'excused', number> =
      {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };

    for (const stat of stats) {
      if (stat.status === 'PRESENT') statsMap.present = stat._count.status;
      if (stat.status === 'ABSENT') statsMap.absent = stat._count.status;
      if (stat.status === 'LATE') statsMap.late = stat._count.status;
      if (stat.status === 'EXCUSED') statsMap.excused = stat._count.status;
    }

    const markedCount = stats.reduce(
      (sum, stat) => sum + stat._count.status,
      0,
    );

    return {
      present: statsMap.present,
      absent: statsMap.absent,
      late: statsMap.late,
      excused: statsMap.excused,
      total: totalTeachers,
      markedCount: markedCount,
    };
  }

  async getAllTeachers(
    tenantId: string,
    date?: string,
    page: number = 1,
    pageSize: number = 10,
  ) {
    let startOfDay: Date | undefined;
    let endOfDay: Date | undefined;

    if (date) {
      const targetDate = new Date(date);
      startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
    }

    const skip = (page - 1) * pageSize;

    const teachers = await this.prisma.teacher.findMany({
      where: { tenantId },
      include: {
        attendances:
          startOfDay && endOfDay
            ? {
                where: {
                  createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                  },
                },
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
              }
            : {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
              },
        card: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip,
      take: pageSize,
    });

    return teachers.map((teacher) => ({
      ...teacher,
      attendance: teacher.attendances[0] || null,
    }));
  }
}
