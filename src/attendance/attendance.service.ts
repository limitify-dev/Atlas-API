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
  ) {
    const where: any = { tenantId };

    if (sectionId) {
      where.sectionId = sectionId;
    } else if (gradeId) {
      where.gradeId = gradeId;
    }

    const students = await this.prisma.student.findMany({
      where,
      include: {
        section: {
          include: {
            grade: true,
          },
        },
        attendances: true,
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

    const attendance = await this.prisma.attendance.upsert({
      where: {
        tenantId_studentId: {
          tenantId: data.tenantId,
          studentId: data.studentId,
        },
      },
      update: {
        status: data.status as AttendanceStatus,
        checkInTime: data.checkInDateTime || null,
        remarks: data.remarks || null,
      },
      create: {
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

    return {
      ...attendance,
      method: data.isManual ? 'manual' : 'auto',
      checkInTime: data.checkInTime,
    };
  }

  async autoCheckIn(data: {
    cardNumber: string;
    tenantId: string;
    location?: string;
  }) {
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
    const checkInDateTime = new Date();

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
      // Teacher check-in (auto only)
      await this.prisma.cardLog.create({
        data: {
          tenantId: data.tenantId,
          cardId: card.id,
          action: 'SCANNED',
          location: data.location || 'entrance',
          description: `Teacher check-in at ${checkInTime} - ${status}`,
        },
      });

      await this.prisma.card.update({
        where: { id: card.id },
        data: { lastUsedAt: checkInDateTime },
      });

      return {
        success: true,
        type: 'teacher',
        teacher: card.teacher,
        checkInTime,
        status,
      };
    }

    throw new BadRequestException(
      'Card is not associated with a student or teacher',
    );
  }

  async getAttendanceReport(
    tenantId: string,
    sectionId?: string,
    gradeId?: string,
  ) {
    const where: any = {
      tenantId,
    };

    if (sectionId) {
      where.student = { sectionId };
    } else if (gradeId) {
      where.student = { gradeId };
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

  async getAttendanceStats(tenantId: string) {
    const stats = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: {
        tenantId,
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
}
