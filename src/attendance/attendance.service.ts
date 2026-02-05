import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentsByClassroom(
    tenantId: string,
    sectionId?: string,
    gradeId?: string,
    date?: string,
  ) {
    const where: any = { tenantId };

    if (sectionId) {
      where.sectionId = sectionId;
    } else if (gradeId) {
      where.gradeId = gradeId;
    }

    // Parse date and create date range for filtering (start of day to end of day)
    let startOfDay: Date | undefined;
    let endOfDay: Date | undefined;

    if (date) {
      const targetDate = new Date(date);
      startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
    }

    const students = await this.prisma.student.findMany({
      where,
      include: {
        section: {
          include: {
            grade: true,
          },
        },
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
    });

    // Group students by section/classroom
    const groupedBySection = students.reduce((acc: any, student: any) => {
      const sectionKey = student.section.id;
      if (!acc[sectionKey]) {
        acc[sectionKey] = {
          section: student.section,
          students: [],
        };
      }

      acc[sectionKey].students.push({
        ...student,
        attendance: student.attendances?.[0] || null,
      });

      return acc;
    }, {});

    return Object.values(groupedBySection);
  }

  async markAttendance(data: {
    tenantId: string;
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    isManual: boolean;
    checkInTime?: string;
    checkInDateTime?: Date;
    remarks?: string;
  }) {
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Check if attendance already exists for today
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        tenantId: data.tenantId,
        studentId: data.studentId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    let attendance: any;

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

    // Parse the current datetime
    const checkInDateTime = dateEntry;

    // Format check-in time for display (HH:mm) - use UTC to avoid timezone conversion
    const hour = checkInDateTime.getUTCHours();
    const minute = checkInDateTime.getUTCMinutes();
    const checkInTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Determine if late (after 8:00 AM) - use UTC hours
    const isLate = hour > 8 || (hour === 8 && minute > 0);

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
      // Teacher check-in (auto only) - use date from request body
      const startOfDay = new Date(dateEntry);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(dateEntry);
      endOfDay.setUTCHours(23, 59, 59, 999);

      // Check if teacher already checked in today
      const existingAttendance = await this.prisma.teacherAttendance.findFirst({
        where: {
          tenantId: data.tenantId,
          teacherId: card.teacherId!,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      let teacherAttendance: any;

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
  ) {
    const where: any = {
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
      remarks?: string;
    }>,
  ) {
    const results: any = [];

    for (const record of records) {
      const result = await this.markAttendance({
        tenantId,
        studentId: record.studentId,
        status: record.status,
        isManual: true,
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
    const where: any = {
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
    // Parse date and create date range for filtering (start of day to end of day)
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const stats = await this.prisma.attendance.groupBy({
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

    const totalStudents = await this.prisma.student.count({
      where: { tenantId },
    });

    const statsMap = stats.reduce((acc: any, stat) => {
      acc[stat.status.toLowerCase()] = stat._count.status;
      return acc;
    }, {});

    const markedCount = stats.reduce(
      (sum, stat) => sum + stat._count.status,
      0,
    );

    return {
      present: statsMap.present || 0,
      absent: statsMap.absent || 0,
      late: statsMap.late || 0,
      excused: statsMap.excused || 0,
      total: totalStudents,
      markedCount: markedCount,
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

    const statsMap = stats.reduce((acc: any, stat) => {
      acc[stat.status.toLowerCase()] = stat._count.status;
      return acc;
    }, {});

    const markedCount = stats.reduce(
      (sum, stat) => sum + stat._count.status,
      0,
    );

    return {
      present: statsMap.present || 0,
      absent: statsMap.absent || 0,
      late: statsMap.late || 0,
      excused: statsMap.excused || 0,
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
