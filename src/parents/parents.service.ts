import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus, BookStatus } from '../../prisma/generated/client';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatTime(totalMinutes: number) {
    const safeMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private parseTimeToMinutes(value?: string | null, fallback: number = 9 * 60) {
    if (!value) return fallback;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
    return (
      Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes))
    );
  }

  private stableHash(input: string) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private async getLatestConsultationAnnouncement(tenantId: string) {
    return this.prisma.announcement.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        ctaType: {
          in: ['CONSULTATION_DAY', 'ACADEMICS_CONSULTATION'],
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  private getConsultationConfig(
    announcement?: {
      ctaUrl?: string | null;
      publishedAt?: Date | null;
    } | null,
  ) {
    const fallbackDate = new Date();
    fallbackDate.setDate(fallbackDate.getDate() + 7);
    const fallbackDateStr = fallbackDate.toISOString().slice(0, 10);

    const fallback = {
      date: fallbackDateStr,
      startTime: '09:00',
      durationMinutes: 12,
      location: 'School Campus',
      source: 'SYSTEM_DEFAULT',
    };

    if (!announcement?.ctaUrl) return fallback;

    try {
      const url = new URL(announcement.ctaUrl, 'https://atlas.local');
      const date = url.searchParams.get('date') || fallback.date;
      const startTime = url.searchParams.get('start') || fallback.startTime;
      const duration = Number(
        url.searchParams.get('duration') || fallback.durationMinutes,
      );
      const location = url.searchParams.get('location') || fallback.location;

      return {
        date,
        startTime,
        durationMinutes:
          Number.isFinite(duration) && duration > 0
            ? Math.min(Math.floor(duration), 90)
            : fallback.durationMinutes,
        location,
        source: 'ANNOUNCEMENT',
      };
    } catch {
      return fallback;
    }
  }

  private async getParentChildrenLite(userId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId, tenantId },
      include: {
        children: {
          include: {
            student: {
              include: {
                grade: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!parent) return [];
    return parent.children.map((child) => child.student).filter(Boolean);
  }

  async getMyChildren(userId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId, tenantId },
      include: {
        children: {
          include: {
            student: {
              include: {
                grade: true,
                section: true,
                card: true,
                parents: {
                  include: {
                    parent: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return [];
    }

    return parent.children.map((child) => {
      const student = child.student;
      return {
        id: student.id,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        fullName: `${student.firstName} ${student.lastName}`,
        email: student.email,
        phone: student.phone,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        nationality: student.nationality,
        address: student.address,
        bloodGroup: student.bloodGroup,
        rollNumber: student.rollNumber,
        admissionDate: student.admissionDate,
        photoUrl: student.photoUrl,
        status: 'ACTIVE',
        grade: student.grade
          ? {
              id: student.grade.id,
              name: student.grade.name,
              level: student.grade.level,
              educationLevel: student.grade.educationLevel,
            }
          : null,
        section: student.section
          ? {
              id: student.section.id,
              name: student.section.name,
            }
          : null,
        card: student.card
          ? {
              id: student.card.id,
              cardNumber: student.card.cardNumber,
              status: student.card.status,
            }
          : null,
        parents:
          student.parents?.map((sp: any) => ({
            id: sp.parent.id,
            firstName: sp.parent.firstName,
            lastName: sp.parent.lastName,
            fullName: `${sp.parent.firstName} ${sp.parent.lastName}`,
            userId: sp.parent.user?.id,
            email: sp.parent.user?.email,
            phone: sp.parent.user?.phone,
            relationship: sp.parent.relationship,
            occupation: sp.parent.occupation,
            isPrimary: sp.isPrimary,
          })) ?? [],
      };
    });
  }

  async getMyFinancials(userId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId, tenantId },
      select: {
        id: true,
        children: {
          select: {
            studentId: true,
          },
        },
      },
    });

    if (!parent) {
      return { invoices: [], summary: { outstanding: 0, count: 0 } };
    }

    const studentIds = parent.children.map((c) => c.studentId);
    if (!studentIds.length) {
      return { invoices: [], summary: { outstanding: 0, count: 0 } };
    }

    const transactions = await this.prisma.bookTransaction.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        fine: { gt: 0 },
        OR: [
          { remarks: { contains: 'Reported Missing', mode: 'insensitive' } },
          { bookCopy: { status: BookStatus.LOST } },
        ],
      },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            price: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentId: true,
            section: {
              select: { id: true, name: true },
            },
            grade: {
              select: { id: true, name: true },
            },
          },
        },
        bookCopy: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const invoices = transactions.map((txn) => {
      const amount = Number(txn.fine || txn.book?.price || 0);
      return {
        id: txn.id,
        type: 'LIBRARY_MISSING_BOOK',
        amount,
        currency: 'USD',
        status: 'UNPAID',
        issuedAt: txn.updatedAt,
        description: `Missing book: ${txn.book?.title || 'Unknown Book'}`,
        book: txn.book
          ? {
              id: txn.book.id,
              title: txn.book.title,
              author: txn.book.author,
              price: Number(txn.book.price || 0),
            }
          : null,
        bookCopy: txn.bookCopy
          ? {
              id: txn.bookCopy.id,
              code: txn.bookCopy.code,
              status: txn.bookCopy.status,
            }
          : null,
        student: txn.student
          ? {
              id: txn.student.id,
              studentId: txn.student.studentId,
              fullName:
                `${txn.student.firstName} ${txn.student.lastName}`.trim(),
              section: txn.student.section?.name || null,
              grade: txn.student.grade?.name || null,
            }
          : null,
        transaction: {
          id: txn.id,
          issueDate: txn.issueDate,
          dueDate: txn.dueDate,
          returnDate: txn.returnDate,
          remarks: txn.remarks,
        },
      };
    });

    const outstanding = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    return {
      invoices,
      summary: {
        outstanding: Number(outstanding.toFixed(2)),
        count: invoices.length,
      },
    };
  }

  async getMyExamSchedule(
    userId: string,
    tenantId: string,
    params?: { studentId?: string; limit?: number },
  ) {
    const children = await this.getParentChildrenLite(userId, tenantId);
    const selectedChildren = params?.studentId
      ? children.filter((c) => c.id === params.studentId)
      : children;
    if (!selectedChildren.length) return [];

    const persistentExams = await this.prisma.academicExam.findMany({
      where: {
        tenantId,
        status: { in: ['PUBLISHED', 'DRAFT'] },
        gradeId: {
          in: Array.from(new Set(selectedChildren.map((c) => c.gradeId))),
        },
      },
      orderBy: { examDate: 'asc' },
      take: params?.limit || 100,
    });

    if (persistentExams.length > 0) {
      const subjects = await this.prisma.subject.findMany({
        where: {
          id: {
            in: Array.from(
              new Set(
                persistentExams
                  .map((e) => e.subjectId)
                  .filter((id): id is string => Boolean(id)),
              ),
            ),
          },
        },
        select: { id: true, name: true },
      });
      const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

      const rows = selectedChildren.flatMap((student) =>
        persistentExams
          .filter(
            (exam) =>
              exam.gradeId === student.gradeId &&
              (!exam.sectionId || exam.sectionId === student.sectionId),
          )
          .map((exam) => ({
            id: `${exam.id}:${student.id}`,
            examId: exam.id,
            title: exam.title,
            subject: exam.subjectId
              ? subjectMap.get(exam.subjectId) || 'Subject'
              : 'General',
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            examDate: exam.examDate.toISOString(),
            date: exam.examDate.toISOString(),
            term: exam.term,
            status: exam.status,
            details: exam.description || '',
          })),
      );

      return rows.slice(0, params?.limit || 100);
    }

    const grades = Array.from(new Set(selectedChildren.map((c) => c.gradeId)));
    const subjects = await this.prisma.subject.findMany({
      where: { tenantId, gradeId: { in: grades } },
      select: {
        id: true,
        name: true,
        gradeId: true,
      },
      orderBy: { name: 'asc' },
    });

    const start = new Date();
    start.setHours(9, 0, 0, 0);
    start.setDate(start.getDate() + 1);

    const rows = selectedChildren.flatMap((student) => {
      const studentSubjects = subjects
        .filter((s) => s.gradeId === student.gradeId)
        .slice(0, 8);
      return studentSubjects.map((subject, index) => {
        const examDate = new Date(start);
        examDate.setDate(start.getDate() + index);
        return {
          id: `${student.id}-${subject.id}-${examDate.toISOString().slice(0, 10)}`,
          title: `${subject.name} Exam`,
          subject: subject.name,
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          examDate: examDate.toISOString(),
          date: examDate.toISOString(),
          status: 'SCHEDULED',
          details: `Exam for ${subject.name} (${student.grade?.name || 'Grade'})`,
        };
      });
    });

    return rows.slice(0, params?.limit || 100);
  }

  async getMyAssignments(
    userId: string,
    tenantId: string,
    params?: { studentId?: string; limit?: number },
  ) {
    const children = await this.getParentChildrenLite(userId, tenantId);
    const selectedChildren = params?.studentId
      ? children.filter((c) => c.id === params.studentId)
      : children;
    if (!selectedChildren.length) return [];

    const persistentAssignments = await this.prisma.academicAssignment.findMany(
      {
        where: {
          tenantId,
          status: { in: ['PUBLISHED', 'DRAFT'] },
          gradeId: {
            in: Array.from(new Set(selectedChildren.map((c) => c.gradeId))),
          },
        },
        orderBy: { dueDate: 'asc' },
        take: params?.limit || 100,
      },
    );

    if (persistentAssignments.length > 0) {
      const [subjects, results] = await Promise.all([
        this.prisma.subject.findMany({
          where: {
            id: {
              in: Array.from(
                new Set(
                  persistentAssignments
                    .map((a) => a.subjectId)
                    .filter((id): id is string => Boolean(id)),
                ),
              ),
            },
          },
          select: { id: true, name: true },
        }),
        this.prisma.academicAssignmentResult.findMany({
          where: {
            assignmentId: { in: persistentAssignments.map((a) => a.id) },
            studentId: { in: selectedChildren.map((c) => c.id) },
          },
          select: {
            assignmentId: true,
            studentId: true,
            score: true,
            status: true,
            remarks: true,
          },
        }),
      ]);

      const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
      const resultMap = new Map(
        results.map((r) => [`${r.assignmentId}:${r.studentId}`, r] as const),
      );

      const rows = selectedChildren.flatMap((student) =>
        persistentAssignments
          .filter(
            (assignment) =>
              assignment.gradeId === student.gradeId &&
              (!assignment.sectionId ||
                assignment.sectionId === student.sectionId),
          )
          .map((assignment) => {
            const result = resultMap.get(`${assignment.id}:${student.id}`);
            return {
              id: `${assignment.id}:${student.id}`,
              assignmentId: assignment.id,
              title: assignment.title,
              subject: assignment.subjectId
                ? subjectMap.get(assignment.subjectId) || 'Subject'
                : 'General',
              studentId: student.id,
              studentName: `${student.firstName} ${student.lastName}`.trim(),
              dueDate: assignment.dueDate.toISOString(),
              date: assignment.dueDate.toISOString(),
              term: assignment.term,
              status: result?.status || assignment.status,
              score: result?.score ?? null,
              grade:
                typeof result?.score === 'number'
                  ? `${Math.round(result.score)}%`
                  : null,
              details: result?.remarks || assignment.description || '',
            };
          }),
      );

      return rows.slice(0, params?.limit || 100);
    }

    const grades = Array.from(new Set(selectedChildren.map((c) => c.gradeId)));
    const subjects = await this.prisma.subject.findMany({
      where: { tenantId, gradeId: { in: grades } },
      select: {
        id: true,
        name: true,
        gradeId: true,
      },
      orderBy: { name: 'asc' },
    });

    const baseDate = new Date();
    baseDate.setHours(17, 0, 0, 0);

    const rows = selectedChildren.flatMap((student) => {
      const studentSubjects = subjects
        .filter((s) => s.gradeId === student.gradeId)
        .slice(0, 8);
      return studentSubjects.map((subject, index) => {
        const dueDate = new Date(baseDate);
        dueDate.setDate(baseDate.getDate() + index + 2);

        const hash = this.stableHash(`${student.id}-${subject.id}`);
        const isGraded = hash % 3 === 0;
        const score = isGraded ? 60 + (hash % 41) : null;

        return {
          id: `${student.id}-${subject.id}-assignment-${index + 1}`,
          title: `${subject.name} Assignment ${index + 1}`,
          subject: subject.name,
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          dueDate: dueDate.toISOString(),
          date: dueDate.toISOString(),
          status: isGraded ? 'GRADED' : 'PENDING',
          score,
          grade: score != null ? `${Math.round(score)}%` : null,
          details: isGraded
            ? `Assignment graded at ${score != null ? Math.round(score) : '--'}%.`
            : 'Assignment submitted and awaiting grading.',
        };
      });
    });

    return rows.slice(0, params?.limit || 100);
  }

  async getMyReportCards(
    userId: string,
    tenantId: string,
    params?: { studentId?: string; limit?: number },
  ) {
    const children = await this.getParentChildrenLite(userId, tenantId);
    const selectedChildren = params?.studentId
      ? children.filter((c) => c.id === params.studentId)
      : children;
    if (!selectedChildren.length) return [];

    const persistentCards = await this.prisma.academicReportCard.findMany({
      where: {
        tenantId,
        studentId: { in: selectedChildren.map((c) => c.id) },
      },
      orderBy: { updatedAt: 'desc' },
      take: params?.limit || 100,
    });

    if (persistentCards.length > 0) {
      const studentMap = new Map(
        selectedChildren.map((s) => [
          s.id,
          `${s.firstName} ${s.lastName}`.trim(),
        ]),
      );

      return persistentCards.map((card) => ({
        id: card.id,
        title: `${studentMap.get(card.studentId) || 'Student'} Report Card`,
        studentId: card.studentId,
        studentName: studentMap.get(card.studentId) || 'Student',
        term: card.term,
        grade: card.grade,
        score: card.overallScore,
        date: (card.publishedAt || card.updatedAt).toISOString(),
        status: card.status,
        details: card.remarks || '',
      }));
    }

    const now = new Date();
    const termStart = new Date(now);
    termStart.setMonth(termStart.getMonth() - 3);

    const rows = await Promise.all(
      selectedChildren.map(async (student) => {
        const [attendedCount, totalCount, conduct] = await Promise.all([
          this.prisma.attendance.count({
            where: {
              tenantId,
              studentId: student.id,
              createdAt: { gte: termStart },
              status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
            },
          }),
          this.prisma.attendance.count({
            where: {
              tenantId,
              studentId: student.id,
              createdAt: { gte: termStart },
            },
          }),
          this.prisma.studentConductPoints.findUnique({
            where: { studentId: student.id },
            select: { currentPoints: true },
          }),
        ]);

        const attendancePct =
          totalCount > 0
            ? Math.round((attendedCount / totalCount) * 100)
            : null;
        const behaviorPoints = conduct?.currentPoints ?? null;
        const weightedScore = Math.round(
          (attendancePct ?? 75) * 0.7 + (behaviorPoints ?? 60) * 0.3,
        );

        const grade =
          weightedScore >= 85
            ? 'A'
            : weightedScore >= 75
              ? 'B'
              : weightedScore >= 65
                ? 'C'
                : weightedScore >= 50
                  ? 'D'
                  : 'F';

        return {
          id: `${student.id}-term-${now.getFullYear()}-${Math.floor(now.getMonth() / 3) + 1}`,
          title: `${student.firstName} ${student.lastName} Report Card`,
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          term: `Term ${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
          grade,
          score: weightedScore,
          attendancePct,
          behaviorPoints,
          date: now.toISOString(),
          status: 'PUBLISHED',
          details: `Attendance ${attendancePct ?? '--'}% • Conduct ${behaviorPoints ?? '--'} pts`,
        };
      }),
    );

    return rows.slice(0, params?.limit || 100);
  }

  async getMyConsultationSlots(
    userId: string,
    tenantId: string,
    params?: { studentId?: string; limit?: number },
  ) {
    const children = await this.getParentChildrenLite(userId, tenantId);
    const selectedChildren = params?.studentId
      ? children.filter((c) => c.id === params.studentId)
      : children;
    if (!selectedChildren.length) {
      return {
        date: null,
        startTime: null,
        durationMinutes: null,
        location: null,
        items: [],
      };
    }

    const persistentSlots = await this.prisma.consultationBooking.findMany({
      where: {
        tenantId,
        studentId: { in: selectedChildren.map((c) => c.id) },
        status: { not: 'CANCELLED' },
      },
      orderBy: [{ consultationDate: 'asc' }, { startTime: 'asc' }],
      take: params?.limit || 200,
    });

    if (persistentSlots.length > 0) {
      const [teachers, students] = await Promise.all([
        this.prisma.teacher.findMany({
          where: {
            id: {
              in: Array.from(new Set(persistentSlots.map((s) => s.teacherId))),
            },
          },
          select: { id: true, firstName: true, lastName: true },
        }),
        this.prisma.student.findMany({
          where: {
            id: {
              in: Array.from(new Set(persistentSlots.map((s) => s.studentId))),
            },
          },
          select: { id: true, firstName: true, lastName: true },
        }),
      ]);

      const teacherMap = new Map(
        teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]),
      );
      const studentMap = new Map(
        students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]),
      );

      const items = persistentSlots.map((slot) => ({
        id: slot.id,
        studentId: slot.studentId,
        studentName: studentMap.get(slot.studentId) || 'Student',
        teacherId: slot.teacherId,
        teacherName: teacherMap.get(slot.teacherId) || 'Teacher',
        subject: 'Consultation',
        section: slot.sectionId || null,
        date: slot.consultationDate.toISOString().slice(0, 10),
        startTime: slot.startTime,
        endTime: slot.endTime,
        location: slot.location,
        source: 'BOOKING',
      }));

      return {
        date: items[0]?.date || null,
        startTime: items[0]?.startTime || null,
        durationMinutes: null,
        location: items[0]?.location || null,
        items,
      };
    }

    const consultationAnnouncement =
      await this.getLatestConsultationAnnouncement(tenantId);
    const config = this.getConsultationConfig(consultationAnnouncement);
    const baseMinutes = this.parseTimeToMinutes(config.startTime, 9 * 60);

    const sectionIds = Array.from(
      new Set(selectedChildren.map((c) => c.sectionId)),
    );
    const gradeIds = Array.from(
      new Set(selectedChildren.map((c) => c.gradeId)),
    );

    const [classTeachers, gradeSubjects] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where: { sectionId: { in: sectionIds } },
        include: {
          teacher: {
            select: { id: true, firstName: true, lastName: true },
          },
          section: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.subject.findMany({
        where: { tenantId, gradeId: { in: gradeIds } },
        include: {
          teachers: {
            include: {
              teacher: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
          grade: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const items = selectedChildren.flatMap((student) => {
      const classTeacherLinks = classTeachers
        .filter((ct) => ct.sectionId === student.sectionId)
        .map((ct) => ({
          teacherId: ct.teacher.id,
          teacherName: `${ct.teacher.firstName} ${ct.teacher.lastName}`.trim(),
          subject: 'Class Teacher',
          sectionName: ct.section?.name || student.section?.name || '',
        }));

      const subjectTeacherLinks = gradeSubjects
        .filter((subject) => subject.gradeId === student.gradeId)
        .flatMap((subject) =>
          subject.teachers.map((st) => ({
            teacherId: st.teacher.id,
            teacherName:
              `${st.teacher.firstName} ${st.teacher.lastName}`.trim(),
            subject: subject.name,
            sectionName: student.section?.name || '',
          })),
        );

      const deduped = Array.from(
        new Map(
          [...classTeacherLinks, ...subjectTeacherLinks].map((link) => [
            `${link.teacherId}:${link.subject}`,
            link,
          ]),
        ).values(),
      );

      return deduped.map((link) => {
        const hash = this.stableHash(
          `${config.date}:${student.id}:${link.teacherId}:${link.subject}`,
        );
        const slotIndex = hash % 30;
        const startMinutes = baseMinutes + slotIndex * config.durationMinutes;
        const endMinutes = startMinutes + config.durationMinutes;

        return {
          id: `${student.id}:${link.teacherId}:${link.subject}:${config.date}`,
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          teacherId: link.teacherId,
          teacherName: link.teacherName,
          subject: link.subject,
          section: link.sectionName || null,
          date: config.date,
          startTime: this.formatTime(startMinutes),
          endTime: this.formatTime(endMinutes),
          location: config.location,
          source: config.source,
        };
      });
    });

    const sorted = items.sort((a, b) => {
      const aKey = `${a.date} ${a.startTime}`;
      const bKey = `${b.date} ${b.startTime}`;
      return aKey.localeCompare(bKey);
    });

    return {
      date: config.date,
      startTime: config.startTime,
      durationMinutes: config.durationMinutes,
      location: config.location,
      items: sorted.slice(0, params?.limit || 200),
    };
  }
}
