import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  BookStatus,
  InvoiceStatus,
} from '../../prisma/generated/client';

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
              code: student.grade.code,
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

  async getMyFinancials(
    userId: string,
    tenantId: string,
    filters?: { status?: string },
  ) {
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

    // Fetch tenant settings to get the configured currency
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const defaultCurrency = (tenant?.settings as any)?.currency || 'USD';

    // Fetch library fines (existing logic)
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

    const libraryInvoices = transactions.map((txn) => {
      const amount = Number(txn.fine || txn.book?.price || 0);
      return {
        id: txn.id,
        type: 'LIBRARY_MISSING_BOOK' as const,
        amount,
        currency: defaultCurrency,
        status: 'UNPAID' as const,
        issuedAt: txn.updatedAt,
        description: `Missing Book: ${txn.book?.title || 'Unknown Book'}`,
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

    // Fetch school fee invoices for these students with student details
    const feeInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        status: {
          not: InvoiceStatus.CANCELLED,
          ...(filters?.status && { equals: filters.status as InvoiceStatus }),
        },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentId: true,
            section: { select: { id: true, name: true } },
            grade: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const feeInvoiceItems = feeInvoices.map((inv: any) => {
      const amount = Number(inv.amount || 0);
      const amountPaid = Number(inv.amountPaid || 0);
      const outstanding = Math.max(0, amount - amountPaid);
      const student = inv.student;

      // Use grace period extended date if available
      const displayDueDate = inv.gracePeriodApproved
        ? inv.gracePeriodApproved
        : inv.dueDate;

      return {
        id: inv.id,
        type: 'SCHOOL_FEES' as const,
        amount,
        currency: inv.currency || 'USD',
        status: inv.status || 'UNPAID',
        issuedAt: inv.createdAt,
        description: inv.title || inv.description || 'School Fee',
        feeDescription: inv.description,
        term: inv.term,
        category: inv.category,
        dueDate: displayDueDate,
        gracePeriodApproved: inv.gracePeriodApproved,
        amountPaid,
        amountOutstanding: outstanding,
        student: student
          ? {
              id: student.id,
              studentId: student.studentId,
              fullName: `${student.firstName} ${student.lastName}`.trim(),
              section: student.section?.name || null,
              grade: student.grade?.name || null,
            }
          : {
              id: inv.studentId,
              studentId: inv.studentId,
              fullName: 'Student',
              section: null,
              grade: null,
            },
        transaction: {
          id: inv.id,
          issueDate: inv.createdAt,
          dueDate: inv.dueDate,
          returnDate: null,
          remarks: null,
        },
      };
    });

    const allInvoices = [...libraryInvoices, ...feeInvoiceItems] as any[];
    const totalOutstanding = allInvoices.reduce(
      (sum: number, inv: any) =>
        sum + (inv.amountOutstanding || inv.amount || 0),
      0,
    );

    return {
      invoices: allInvoices,
      summary: {
        outstanding: Number(totalOutstanding.toFixed(2)),
        count: allInvoices.length,
        currency: defaultCurrency,
      },
    };
  }

  /**
   * Classroom context for each child: their grade & section, class teacher
   * (homeroom), and the courses (subjects) they take with each subject's
   * teacher and contact details. Scoped strictly to each child's classroom.
   */
  async getMyClassroom(
    userId: string,
    tenantId: string,
    params?: { studentId?: string },
  ) {
    const children = await this.getParentChildrenLite(userId, tenantId);
    const selected = params?.studentId
      ? children.filter((c) => c.id === params.studentId)
      : children;
    if (!selected.length) return [];

    const sectionIds = Array.from(new Set(selected.map((c) => c.sectionId)));
    const gradeIds = Array.from(new Set(selected.map((c) => c.gradeId)));

    const teacherSelect = {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      specialization: true,
      department: true,
      user: { select: { email: true, phone: true, avatar: true } },
    } as const;

    const [classTeachers, subjects] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where: { sectionId: { in: sectionIds }, isPrimary: true },
        include: { teacher: { select: teacherSelect } },
      }),
      this.prisma.subject.findMany({
        where: { tenantId, gradeId: { in: gradeIds } },
        include: {
          teachers: { include: { teacher: { select: teacherSelect } } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const fmtTeacher = (t: any) =>
      t
        ? {
            id: t.id,
            name: `${t.firstName} ${t.lastName}`.trim(),
            specialization: t.specialization ?? t.department ?? null,
            photoUrl: t.photoUrl ?? t.user?.avatar ?? null,
            email: t.user?.email ?? null,
            phone: t.user?.phone ?? null,
          }
        : null;

    const classTeacherBySection = new Map(
      classTeachers.map((ct) => [ct.sectionId, ct.teacher]),
    );
    const subjectsByGrade = new Map<string, typeof subjects>();
    for (const s of subjects) {
      const arr = subjectsByGrade.get(s.gradeId) ?? [];
      arr.push(s);
      subjectsByGrade.set(s.gradeId, arr);
    }

    return selected.map((child: any) => ({
      studentId: child.id,
      studentName: `${child.firstName} ${child.lastName}`.trim(),
      studentCode: child.studentId,
      grade: child.grade,
      section: child.section,
      classTeacher: fmtTeacher(classTeacherBySection.get(child.sectionId)),
      courses: (subjectsByGrade.get(child.gradeId) ?? []).map((s) => ({
        subjectId: s.id,
        name: s.name,
        code: s.code,
        teachers: s.teachers
          .map((st) => fmtTeacher(st.teacher))
          .filter(Boolean),
      })),
    }));
  }

  /**
   * Child's academic performance summary: graded subject percentages (from
   * report cards / StudentGrade), an overall average, and assignment stats.
   */
  async getMyPerformance(
    userId: string,
    tenantId: string,
    params?: { studentId?: string; term?: string },
  ) {
    const children = await this.getParentChildrenLite(userId, tenantId);
    const selected = params?.studentId
      ? children.filter((c) => c.id === params.studentId)
      : children;
    if (!selected.length) return [];

    const childIds = selected.map((c) => c.id);

    const [grades, assignmentResults] = await Promise.all([
      this.prisma.studentGrade.findMany({
        where: {
          tenantId,
          studentId: { in: childIds },
          ...(params?.term ? { term: { contains: params.term } } : {}),
        },
        include: { subject: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.academicAssignmentResult.findMany({
        where: { studentId: { in: childIds } },
        select: { studentId: true, score: true, status: true },
      }),
    ]);

    return selected.map((child: any) => {
      const childGrades = grades.filter((g) => g.studentId === child.id);
      const subjects = childGrades.map((g) => ({
        subjectId: g.subjectId,
        name: g.subject?.name ?? 'Subject',
        percentage: g.percentage,
        term: g.term,
        comment: g.comment ?? null,
      }));
      const overallAverage = subjects.length
        ? Math.round(
            (subjects.reduce((sum, s) => sum + s.percentage, 0) /
              subjects.length) *
              10,
          ) / 10
        : null;

      const childResults = assignmentResults.filter(
        (r) => r.studentId === child.id && typeof r.score === 'number',
      );
      const assignmentAverage = childResults.length
        ? Math.round(
            (childResults.reduce((sum, r) => sum + (r.score ?? 0), 0) /
              childResults.length) *
              10,
          ) / 10
        : null;

      return {
        studentId: child.id,
        studentName: `${child.firstName} ${child.lastName}`.trim(),
        grade: child.grade,
        section: child.section,
        overallAverage,
        gradedSubjects: subjects.length,
        subjects,
        assignments: {
          graded: childResults.length,
          averageScore: assignmentAverage,
        },
      };
    });
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

    return [];
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

    return [];
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
