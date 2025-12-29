import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

    const students = await this.prisma.student.findMany({
      where,
      include: {
        section: {
          include: {
            grade: true,
          },
        },
        attendances: date
          ? {
              where: {
                date: new Date(date),
              },
            }
          : undefined,
        card: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
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
    date: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    isManual: boolean;
    checkInTime?: string;
    remarks?: string;
  }) {
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const attendanceDate = new Date(data.date);
    attendanceDate.setHours(0, 0, 0, 0);

    const attendance = await this.prisma.attendance.upsert({
      where: {
        tenantId_studentId_date: {
          tenantId: data.tenantId,
          studentId: data.studentId,
          date: attendanceDate,
        },
      },
      update: {
        status: data.status as AttendanceStatus,
        remarks: data.remarks || null,
      },
      create: {
        tenantId: data.tenantId,
        studentId: data.studentId,
        date: attendanceDate,
        status: data.status as AttendanceStatus,
        remarks: data.isManual
          ? `Manual entry${data.remarks ? `: ${data.remarks}` : ''}`
          : `Auto check-in at ${data.checkInTime || new Date().toLocaleTimeString()}`,
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

    const now = new Date();
    const checkInTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Determine if late (after 8:00 AM)
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isLate = hour > 8 || (hour === 8 && minute > 0);

    const status: AttendanceStatus = isLate ? 'LATE' : 'PRESENT';

    if (card.student) {
      // Student check-in
      const attendance = await this.markAttendance({
        tenantId: data.tenantId,
        studentId: card.studentId!,
        date: today.toISOString(),
        status,
        isManual: false,
        checkInTime,
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
        data: { lastUsedAt: now },
      });

      return {
        success: true,
        type: 'student',
        attendance,
        student: card.student,
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
        data: { lastUsedAt: now },
      });

      return {
        success: true,
        type: 'teacher',
        teacher: card.teacher,
        checkInTime,
        status,
      };
    }

    throw new BadRequestException('Card is not associated with a student or teacher');
  }

  async getAttendanceReport(
    tenantId: string,
    date: string,
    sectionId?: string,
    gradeId?: string,
  ) {
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const where: any = {
      tenantId,
      date: attendanceDate,
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

  async getAttendanceStats(tenantId: string, date?: string) {
    const attendanceDate = date ? new Date(date) : new Date();
    attendanceDate.setHours(0, 0, 0, 0);

    const stats = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: {
        tenantId,
        date: attendanceDate,
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

    const markedCount = stats.reduce((sum, stat) => sum + stat._count.status, 0);
    const pendingCount = totalStudents - markedCount;

    return {
      present: statsMap.present || 0,
      absent: statsMap.absent || 0,
      late: statsMap.late || 0,
      excused: statsMap.excused || 0,
      pending: pendingCount,
      total: totalStudents,
      date: attendanceDate,
    };
  }
}
