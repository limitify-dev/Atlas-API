import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcademicRecordStatus,
  AssignmentResultStatus,
  ConsultationStatus,
  Role,
} from '../../prisma/generated/client';
import {
  CreateAcademicExamDto,
  CreateAcademicCourseDto,
  CreateAssignmentDto,
  CreateConsultationBookingDto,
  CreateReportCardDto,
  ListAcademicsQueryDto,
  UpsertTeacherAlignmentDto,
  UpdateAcademicExamDto,
  UpdateAcademicCourseDto,
  UpdateAssignmentDto,
  UpdateConsultationBookingDto,
  UpdateReportCardDto,
  UpsertAssignmentResultsDto,
} from './dto';

@Injectable()
export class AcademicsService {
  private static readonly UNASSIGNED_TEACHER_ID = 'UNASSIGNED';

  constructor(private readonly prisma: PrismaService) {}

  private isTeacher(user: { role?: string; userType?: string }) {
    return (
      String(user?.role || '').toUpperCase() === Role.TEACHER &&
      String(user?.userType || '').toUpperCase() === 'TEACHER'
    );
  }

  private isAdminLike(user: { role?: string }) {
    const role = String(user?.role || '').toUpperCase();
    return role === Role.ADMIN || role === Role.SUPER_ADMIN || role === 'DOS';
  }

  private ensureTeacherOrAdmin(user: { role?: string; userType?: string }) {
    if (!this.isTeacher(user) && !this.isAdminLike(user)) {
      throw new ForbiddenException(
        'Only teachers and admins can manage academics',
      );
    }
  }

  private async resolveTeacherIdForUser(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
  ) {
    if (this.isTeacher(user)) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true },
      });
      return teacher?.id || null;
    }
    return null;
  }

  private async ensureTeacherAlignment(
    tenantId: string,
    teacherId: string,
    sectionId: string,
    subjectId: string,
  ) {
    const [classLink, subjectLink] = await Promise.all([
      this.prisma.classTeacher.findFirst({
        where: { teacherId, sectionId },
        select: { id: true },
      }),
      this.prisma.subjectTeacher.findFirst({
        where: { teacherId, subjectId },
        select: { id: true },
      }),
    ]);

    if (!classLink || !subjectLink) {
      throw new BadRequestException(
        'Teacher must be aligned to both the selected classroom and subject before creating a course',
      );
    }

    const [section, subject] = await Promise.all([
      this.prisma.section.findFirst({
        where: { id: sectionId, tenantId },
        select: { gradeId: true },
      }),
      this.prisma.subject.findFirst({
        where: { id: subjectId, tenantId },
        select: { gradeId: true },
      }),
    ]);

    if (!section) throw new NotFoundException('Section not found');
    if (!subject) throw new NotFoundException('Subject not found');
    if (section.gradeId !== subject.gradeId) {
      throw new BadRequestException(
        'Selected subject grade does not match section grade',
      );
    }
  }

  private buildCourseCodeBase(input: string) {
    const words = String(input || '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return 'COURSE';
    if (words.length === 1) return words[0].slice(0, 8);
    return words
      .map((word) => word[0])
      .join('')
      .slice(0, 8);
  }

  private async generateUniqueSubjectCode(tenantId: string, baseInput: string) {
    const base = this.buildCourseCodeBase(baseInput);
    for (let i = 0; i < 100; i++) {
      const candidate = i === 0 ? base : `${base}${i + 1}`;
      const exists = await this.prisma.subject.findFirst({
        where: { tenantId, code: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException(
      'Unable to generate unique subject code for course',
    );
  }

  private async resolveOrCreateCourseSubject(
    tenantId: string,
    sectionId: string,
    title: string,
    explicitSubjectId?: string,
    explicitCode?: string,
  ) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId },
      select: { id: true, gradeId: true },
    });
    if (!section) throw new NotFoundException('Section not found');

    if (explicitSubjectId) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: explicitSubjectId, tenantId },
        select: { id: true, gradeId: true },
      });
      if (!subject) throw new NotFoundException('Subject not found');
      if (subject.gradeId !== section.gradeId) {
        throw new BadRequestException('Subject grade must match section grade');
      }
      return subject.id;
    }

    const existingByName = await this.prisma.subject.findFirst({
      where: {
        tenantId,
        gradeId: section.gradeId,
        name: { equals: title, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingByName) return existingByName.id;

    const generatedCode = explicitCode
      ? await this.generateUniqueSubjectCode(tenantId, explicitCode)
      : await this.generateUniqueSubjectCode(tenantId, title);

    const created = await this.prisma.subject.create({
      data: {
        tenantId,
        gradeId: section.gradeId,
        name: title,
        code: generatedCode,
        description: `Course subject for ${title}`,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async syncTeacherCourseLinks(
    tenantId: string,
    teacherId: string,
    sectionId: string,
    subjectId: string,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    await this.prisma.classTeacher.upsert({
      where: { teacherId_sectionId: { teacherId, sectionId } },
      update: {},
      create: { teacherId, sectionId, isPrimary: false },
    });

    await this.prisma.subjectTeacher.upsert({
      where: { teacherId_subjectId: { teacherId, subjectId } },
      update: {},
      create: { teacherId, subjectId },
    });
  }

  private parseTimeToMinutes(value: string) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) throw new BadRequestException('Time must be in HH:mm format');
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      throw new BadRequestException('Invalid time value');
    }
    return h * 60 + m;
  }

  private toStatus(value?: string): AcademicRecordStatus | undefined {
    if (!value) return undefined;
    if (value === 'DRAFT') return AcademicRecordStatus.DRAFT;
    if (value === 'PUBLISHED') return AcademicRecordStatus.PUBLISHED;
    if (value === 'ARCHIVED') return AcademicRecordStatus.ARCHIVED;
    return undefined;
  }

  private toResultStatus(value?: string): AssignmentResultStatus | undefined {
    if (!value) return undefined;
    if (value === 'PENDING') return AssignmentResultStatus.PENDING;
    if (value === 'GRADED') return AssignmentResultStatus.GRADED;
    if (value === 'MISSING') return AssignmentResultStatus.MISSING;
    return undefined;
  }

  private toConsultStatus(value?: string): ConsultationStatus | undefined {
    if (!value) return undefined;
    if (value === 'SCHEDULED') return ConsultationStatus.SCHEDULED;
    if (value === 'COMPLETED') return ConsultationStatus.COMPLETED;
    if (value === 'CANCELLED') return ConsultationStatus.CANCELLED;
    if (value === 'NO_SHOW') return ConsultationStatus.NO_SHOW;
    return undefined;
  }

  async getTeacherAlignment(tenantId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const [classLinks, subjectLinks] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where: { teacherId },
        include: {
          section: {
            select: {
              id: true,
              name: true,
              gradeId: true,
              grade: { select: { id: true, name: true, code: true } },
            },
          },
        },
      }),
      this.prisma.subjectTeacher.findMany({
        where: { teacherId },
        include: {
          subject: {
            select: { id: true, name: true, code: true, gradeId: true },
          },
        },
      }),
    ]);

    return {
      teacher: {
        id: teacher.id,
        name: `${teacher.firstName} ${teacher.lastName}`.trim(),
      },
      sectionIds: classLinks.map((link) => link.sectionId),
      subjectIds: subjectLinks.map((link) => link.subjectId),
      sections: classLinks.map((link) => ({
        ...link.section,
        isPrimary: link.isPrimary,
      })),
      subjects: subjectLinks.map((link) => link.subject),
      // Sections where this teacher is the class teacher (homeroom)
      primarySectionIds: classLinks
        .filter((link) => link.isPrimary)
        .map((link) => link.sectionId),
    };
  }

  async upsertTeacherAlignment(
    tenantId: string,
    teacherId: string,
    dto: UpsertTeacherAlignmentDto,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const uniqueSectionIds = Array.from(
      new Set((dto.sectionIds || []).filter(Boolean)),
    );
    const uniqueSubjectIds = Array.from(
      new Set((dto.subjectIds || []).filter(Boolean)),
    );

    const [sections, subjects] = await Promise.all([
      uniqueSectionIds.length
        ? this.prisma.section.findMany({
            where: { tenantId, id: { in: uniqueSectionIds } },
            select: { id: true, gradeId: true },
          })
        : Promise.resolve([] as Array<{ id: string; gradeId: string }>),
      uniqueSubjectIds.length
        ? this.prisma.subject.findMany({
            where: { tenantId, id: { in: uniqueSubjectIds } },
            select: { id: true, gradeId: true },
          })
        : Promise.resolve([] as Array<{ id: string; gradeId: string }>),
    ]);

    if (sections.length !== uniqueSectionIds.length) {
      throw new BadRequestException(
        'One or more section IDs are invalid for this tenant',
      );
    }
    if (subjects.length !== uniqueSubjectIds.length) {
      throw new BadRequestException(
        'One or more subject IDs are invalid for this tenant',
      );
    }

    if (sections.length && subjects.length) {
      const sectionGrades = new Set(sections.map((section) => section.gradeId));
      const misaligned = subjects.find(
        (subject) => !sectionGrades.has(subject.gradeId),
      );
      if (misaligned) {
        throw new BadRequestException(
          'All selected subjects must match at least one selected classroom grade',
        );
      }
    }

    // Preserve any existing class-teacher (isPrimary) designations for sections
    // that remain assigned, so re-saving the alignment doesn't wipe them.
    const existingPrimaries = await this.prisma.classTeacher.findMany({
      where: { teacherId, isPrimary: true },
      select: { sectionId: true },
    });
    const primarySet = new Set(existingPrimaries.map((p) => p.sectionId));

    await this.prisma.$transaction(async (tx) => {
      await tx.classTeacher.deleteMany({ where: { teacherId } });
      await tx.subjectTeacher.deleteMany({ where: { teacherId } });

      if (uniqueSectionIds.length) {
        await tx.classTeacher.createMany({
          data: uniqueSectionIds.map((sectionId) => ({
            teacherId,
            sectionId,
            isPrimary: primarySet.has(sectionId),
          })),
          skipDuplicates: true,
        });
      }

      if (uniqueSubjectIds.length) {
        await tx.subjectTeacher.createMany({
          data: uniqueSubjectIds.map((subjectId) => ({ teacherId, subjectId })),
          skipDuplicates: true,
        });
      }
    });

    return this.getTeacherAlignment(tenantId, teacherId);
  }
  /**
   * Gets the current teacher's subject IDs for a specific section.
   * Used to filter the subject selector to only subjects the teacher teaches.
   */
  async getMySubjectsForSection(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    sectionId: string,
  ) {
    if (!this.isTeacher(user)) {
      throw new ForbiddenException('Only teachers can access this endpoint');
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId, userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher record not found');
    }

    const subjectLinks = await this.prisma.subjectTeacher.findMany({
      where: { teacherId: teacher.id },
      select: { subjectId: true },
    });

    return { subjectIds: subjectLinks.map((l) => l.subjectId) };
  }


  /**
   * Sets (or clears) the class teacher (homeroom) of a section. A section has at
   * most one class teacher, so any other teacher's designation is cleared.
   */
  async setClassTeacher(
    tenantId: string,
    sectionId: string,
    teacherId: string | null,
  ) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Classroom (section) not found');

    if (teacherId) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { id: teacherId, tenantId },
        select: { id: true },
      });
      if (!teacher) throw new NotFoundException('Teacher not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Clear any current class teacher for this section
      await tx.classTeacher.updateMany({
        where: { sectionId },
        data: { isPrimary: false },
      });
      if (teacherId) {
        // Make this teacher the class teacher (ensure the link exists)
        await tx.classTeacher.upsert({
          where: { teacherId_sectionId: { teacherId, sectionId } },
          update: { isPrimary: true },
          create: { teacherId, sectionId, isPrimary: true },
        });
      }
    });

    return { sectionId, teacherId, classTeacher: !!teacherId };
  }

  async createCourse(
    tenantId: string,
    userId: string,
    dto: CreateAcademicCourseDto,
  ) {
    const subjectId = await this.resolveOrCreateCourseSubject(
      tenantId,
      dto.sectionId,
      dto.title,
      dto.subjectId,
      dto.code,
    );

    const teacherId =
      dto.teacherId?.trim() || AcademicsService.UNASSIGNED_TEACHER_ID;
    if (teacherId !== AcademicsService.UNASSIGNED_TEACHER_ID) {
      await this.syncTeacherCourseLinks(
        tenantId,
        teacherId,
        dto.sectionId,
        subjectId,
      );
    }

    return this.prisma.academicCourse.create({
      data: {
        tenantId,
        teacherId,
        sectionId: dto.sectionId,
        subjectId,
        title: dto.title,
        code: dto.code,
        term: dto.term,
        description: dto.description,
        status: this.toStatus(dto.status) || AcademicRecordStatus.DRAFT,
        createdBy: userId,
      },
    });
  }

  async listCourses(
    tenantId: string,
    user: { role?: string; userType?: string },
    query: ListAcademicsQueryDto,
  ) {
    const teacherIdFromUser = await this.resolveTeacherIdForUser(
      tenantId,
      user,
    );

    return this.prisma.academicCourse.findMany({
      where: {
        tenantId,
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.term ? { term: query.term } : {}),
        ...(teacherIdFromUser ? { teacherId: teacherIdFromUser } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: query.limit || 200,
    });
  }

  async updateCourse(
    tenantId: string,
    id: string,
    dto: UpdateAcademicCourseDto,
  ) {
    const existing = await this.prisma.academicCourse.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Course not found');

    const sectionId = dto.sectionId ?? existing.sectionId;
    const title = dto.title ?? existing.title;
    const subjectId =
      dto.subjectId !== undefined ||
      dto.sectionId !== undefined ||
      dto.title !== undefined
        ? await this.resolveOrCreateCourseSubject(
            tenantId,
            sectionId,
            title,
            dto.subjectId ?? existing.subjectId,
            dto.code ?? existing.code ?? undefined,
          )
        : existing.subjectId;

    const teacherId =
      dto.teacherId !== undefined
        ? dto.teacherId?.trim() || AcademicsService.UNASSIGNED_TEACHER_ID
        : existing.teacherId || AcademicsService.UNASSIGNED_TEACHER_ID;
    if (teacherId !== AcademicsService.UNASSIGNED_TEACHER_ID) {
      await this.syncTeacherCourseLinks(
        tenantId,
        teacherId,
        sectionId,
        subjectId,
      );
    }

    return this.prisma.academicCourse.update({
      where: { id },
      data: {
        ...(dto.teacherId !== undefined ? { teacherId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.subjectId !== undefined ||
        dto.sectionId !== undefined ||
        dto.title !== undefined
          ? { subjectId }
          : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.term !== undefined ? { term: dto.term } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.status !== undefined
          ? { status: this.toStatus(dto.status) }
          : {}),
      },
    });
  }

  async deleteCourse(tenantId: string, id: string) {
    const existing = await this.prisma.academicCourse.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Course not found');

    const assignmentsCount = await this.prisma.academicAssignment.count({
      where: { tenantId, courseId: id },
    });
    if (assignmentsCount > 0) {
      throw new BadRequestException(
        'Cannot delete a course that already has linked assignments',
      );
    }

    await this.prisma.academicCourse.delete({ where: { id } });
    return { success: true };
  }

  async createExam(
    tenantId: string,
    userId: string,
    dto: CreateAcademicExamDto,
  ) {
    return this.prisma.academicExam.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        term: dto.term,
        examDate: new Date(dto.examDate),
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        createdBy: userId,
        status: this.toStatus(dto.status) || AcademicRecordStatus.DRAFT,
      },
    });
  }

  async listExams(tenantId: string, query: ListAcademicsQueryDto) {
    return this.prisma.academicExam.findMany({
      where: {
        tenantId,
        ...(query.gradeId ? { gradeId: query.gradeId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.term ? { term: query.term } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              examDate: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { examDate: 'asc' },
      take: query.limit || 200,
    });
  }

  async updateExam(tenantId: string, id: string, dto: UpdateAcademicExamDto) {
    const existing = await this.prisma.academicExam.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Exam not found');

    return this.prisma.academicExam.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.term !== undefined ? { term: dto.term } : {}),
        ...(dto.examDate !== undefined
          ? { examDate: new Date(dto.examDate) }
          : {}),
        ...(dto.gradeId !== undefined ? { gradeId: dto.gradeId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.status !== undefined
          ? { status: this.toStatus(dto.status) }
          : {}),
      },
    });
  }

  async deleteExam(tenantId: string, id: string) {
    const existing = await this.prisma.academicExam.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Exam not found');
    await this.prisma.academicExam.delete({ where: { id } });
    return { success: true };
  }

  async createAssignment(
    tenantId: string,
    user: { id: string; role?: string; userType?: string },
    dto: CreateAssignmentDto,
  ) {
    this.ensureTeacherOrAdmin(user);

    let gradeId = dto.gradeId;
    let sectionId = dto.sectionId;
    let subjectId = dto.subjectId;
    const courseId = dto.courseId;

    if (courseId) {
      const course = await this.prisma.academicCourse.findFirst({
        where: { id: courseId, tenantId },
      });
      if (!course) throw new NotFoundException('Course not found');

      if (this.isTeacher(user)) {
        const teacherId = await this.resolveTeacherIdForUser(tenantId, user);
        if (!teacherId || course.teacherId !== teacherId) {
          throw new ForbiddenException(
            'Teachers can only create assignments for their own courses',
          );
        }
      }

      if (!gradeId) {
        const section = await this.prisma.section.findFirst({
          where: { id: course.sectionId, tenantId },
          select: { gradeId: true },
        });
        gradeId = section?.gradeId ?? gradeId;
      }
      sectionId = sectionId || course.sectionId;
      subjectId = subjectId || course.subjectId;

      if (sectionId && sectionId !== course.sectionId) {
        throw new BadRequestException(
          'Assignment section must match selected course section',
        );
      }
      if (subjectId && subjectId !== course.subjectId) {
        throw new BadRequestException(
          'Assignment subject must match selected course subject',
        );
      }
    }

    if (!gradeId) {
      throw new BadRequestException(
        'gradeId is required (directly or via selected course)',
      );
    }

    return this.prisma.academicAssignment.create({
      data: {
        tenantId,
        courseId,
        title: dto.title,
        description: dto.description,
        term: dto.term,
        dueDate: new Date(dto.dueDate),
        gradeId,
        sectionId,
        subjectId,
        maxScore: dto.maxScore || 100,
        createdBy: user.id,
        status: this.toStatus(dto.status) || AcademicRecordStatus.DRAFT,
      },
    });
  }

  async listAssignments(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    query: ListAcademicsQueryDto,
  ) {
    const createdByFilter = this.isTeacher(user) ? { createdBy: user.id } : {};
    return this.prisma.academicAssignment.findMany({
      where: {
        tenantId,
        ...createdByFilter,
        ...(query.gradeId ? { gradeId: query.gradeId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.term ? { term: query.term } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              dueDate: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { dueDate: 'asc' },
      take: query.limit || 200,
    });
  }

  async updateAssignment(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    id: string,
    dto: UpdateAssignmentDto,
  ) {
    const existing = await this.prisma.academicAssignment.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    if (this.isTeacher(user) && existing.createdBy !== user.id) {
      throw new ForbiddenException('You can only edit assignments you created');
    }

    const nextCourseId =
      dto.courseId !== undefined ? dto.courseId : existing.courseId;
    let nextSectionId =
      dto.sectionId !== undefined ? dto.sectionId : existing.sectionId;
    let nextSubjectId =
      dto.subjectId !== undefined ? dto.subjectId : existing.subjectId;
    let nextGradeId =
      dto.gradeId !== undefined ? dto.gradeId : existing.gradeId;

    if (nextCourseId) {
      const course = await this.prisma.academicCourse.findFirst({
        where: { id: nextCourseId, tenantId },
      });
      if (!course) throw new NotFoundException('Course not found');

      nextSectionId = nextSectionId || course.sectionId;
      nextSubjectId = nextSubjectId || course.subjectId;

      if (nextSectionId && nextSectionId !== course.sectionId) {
        throw new BadRequestException(
          'Assignment section must match selected course section',
        );
      }
      if (nextSubjectId && nextSubjectId !== course.subjectId) {
        throw new BadRequestException(
          'Assignment subject must match selected course subject',
        );
      }

      if (!nextGradeId) {
        const section = await this.prisma.section.findFirst({
          where: { id: course.sectionId, tenantId },
          select: { gradeId: true },
        });
        nextGradeId = section?.gradeId || nextGradeId;
      }
    }

    const shouldSetGrade =
      dto.gradeId !== undefined || dto.courseId !== undefined;
    const shouldSetSection =
      dto.sectionId !== undefined || dto.courseId !== undefined;
    const shouldSetSubject =
      dto.subjectId !== undefined || dto.courseId !== undefined;

    return this.prisma.academicAssignment.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.term !== undefined ? { term: dto.term } : {}),
        ...(dto.courseId !== undefined ? { courseId: dto.courseId } : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: new Date(dto.dueDate) }
          : {}),
        ...(shouldSetGrade ? { gradeId: nextGradeId } : {}),
        ...(shouldSetSection ? { sectionId: nextSectionId } : {}),
        ...(shouldSetSubject ? { subjectId: nextSubjectId } : {}),
        ...(dto.maxScore !== undefined ? { maxScore: dto.maxScore } : {}),
        ...(dto.status !== undefined
          ? { status: this.toStatus(dto.status) }
          : {}),
      },
    });
  }

  async deleteAssignment(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    id: string,
  ) {
    const existing = await this.prisma.academicAssignment.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    if (this.isTeacher(user) && existing.createdBy !== user.id) {
      throw new ForbiddenException(
        'You can only delete assignments you created',
      );
    }

    await this.prisma.$transaction([
      this.prisma.academicAssignmentResult.deleteMany({
        where: { assignmentId: id },
      }),
      this.prisma.academicAssignment.delete({ where: { id } }),
    ]);

    return { success: true };
  }

  async upsertAssignmentResults(
    tenantId: string,
    user: { id: string; role?: string; userType?: string },
    assignmentId: string,
    dto: UpsertAssignmentResultsDto,
  ) {
    const assignment = await this.prisma.academicAssignment.findFirst({
      where: { id: assignmentId, tenantId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (this.isTeacher(user) && assignment.createdBy !== user.id) {
      throw new ForbiddenException(
        'You can only grade assignments you created',
      );
    }

    const results = await Promise.all(
      dto.items.map((item) =>
        this.prisma.academicAssignmentResult.upsert({
          where: {
            assignmentId_studentId: {
              assignmentId,
              studentId: item.studentId,
            },
          },
          update: {
            score: item.score,
            remarks: item.remarks,
            status:
              this.toResultStatus(item.status) ||
              (item.score != null
                ? AssignmentResultStatus.GRADED
                : AssignmentResultStatus.PENDING),
            gradedAt:
              item.score != null || item.status === 'GRADED'
                ? new Date()
                : undefined,
            submittedAt: new Date(),
          },
          create: {
            tenantId,
            assignmentId,
            studentId: item.studentId,
            score: item.score,
            remarks: item.remarks,
            status:
              this.toResultStatus(item.status) ||
              (item.score != null
                ? AssignmentResultStatus.GRADED
                : AssignmentResultStatus.PENDING),
            gradedAt:
              item.score != null || item.status === 'GRADED'
                ? new Date()
                : undefined,
            submittedAt: new Date(),
            createdBy: user.id,
          },
        }),
      ),
    );

    return { success: true, count: results.length, data: results };
  }

  async getAssignmentResults(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    assignmentId: string,
  ) {
    const assignment = await this.prisma.academicAssignment.findFirst({
      where: { id: assignmentId, tenantId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (this.isTeacher(user) && assignment.createdBy !== user.id) {
      throw new ForbiddenException(
        'You can only view results for assignments you created',
      );
    }
    return this.prisma.academicAssignmentResult.findMany({
      where: { tenantId, assignmentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStudentsInSection(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    sectionId: string,
  ) {
    // If teacher, verify they are assigned to the section
    if (this.isTeacher(user)) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true },
      });
      if (!teacher) throw new ForbiddenException('Teacher record not found');
      const classLink = await this.prisma.classTeacher.findFirst({
        where: { teacherId: teacher.id, sectionId },
        select: { id: true },
      });
      const section = await this.prisma.section.findFirst({
        where: { id: sectionId, tenantId },
        select: { gradeId: true },
      });
      const subjectLink = section
        ? await this.prisma.subjectTeacher.findFirst({
            where: {
              teacherId: teacher.id,
              subject: { gradeId: section.gradeId },
            },
            select: { id: true },
          })
        : null;
      if (!classLink && !subjectLink) {
        throw new ForbiddenException(
          'You are not assigned to the requested section',
        );
      }
    }

    return this.prisma.student.findMany({
      where: { tenantId, sectionId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentId: true,
        photoUrl: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async bulkUpsertStudentGrades(
    tenantId: string,
    user: { id: string; role?: string; userType?: string },
    dto: {
      subjectId: string;
      sectionId: string;
      term: string;
      grades: Array<{
        studentId: string;
        percentage: number;
        comment?: string;
      }>;
    },
  ) {
    if (this.isTeacher(user)) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true },
      });
      if (!teacher) throw new ForbiddenException('Teacher record not found');

      const [classLink, subjectLink] = await Promise.all([
        this.prisma.classTeacher.findFirst({
          where: { teacherId: teacher.id, sectionId: dto.sectionId },
          select: { id: true },
        }),
        this.prisma.subjectTeacher.findFirst({
          where: { teacherId: teacher.id, subjectId: dto.subjectId },
          select: { id: true },
        }),
      ]);
      if (!classLink) {
        throw new ForbiddenException(
          'You are not assigned to the requested section',
        );
      }
      if (!subjectLink) {
        throw new ForbiddenException(
          'You are not assigned to the requested subject',
        );
      }
    }

    const results = await Promise.all(
      dto.grades.map((g) =>
        this.prisma.studentGrade.upsert({
          where: {
            tenantId_studentId_subjectId_term: {
              tenantId,
              studentId: g.studentId,
              subjectId: dto.subjectId,
              term: dto.term,
            },
          },
          update: {
            percentage: g.percentage,
            comment: g.comment ?? null,
            gradedBy: user.id,
          },
          create: {
            tenantId,
            studentId: g.studentId,
            subjectId: dto.subjectId,
            term: dto.term,
            percentage: g.percentage,
            comment: g.comment ?? null,
            gradedBy: user.id,
          },
        }),
      ),
    );

    return { success: true, count: results.length, data: results };
  }

  async listStudentGrades(
    tenantId: string,
    user: { id?: string; role?: string; userType?: string },
    query: { subjectId?: string; sectionId?: string; term?: string },
  ) {
    if (this.isTeacher(user)) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true },
      });
      if (!teacher) throw new ForbiddenException('Teacher record not found');

      if (query.subjectId) {
        const subjectLink = await this.prisma.subjectTeacher.findFirst({
          where: { teacherId: teacher.id, subjectId: query.subjectId },
          select: { id: true },
        });
        if (!subjectLink) {
          throw new ForbiddenException(
            'You are not assigned to the requested subject',
          );
        }
      }
      if (query.sectionId) {
        const classLink = await this.prisma.classTeacher.findFirst({
          where: { teacherId: teacher.id, sectionId: query.sectionId },
          select: { id: true },
        });
        if (!classLink) {
          throw new ForbiddenException(
            'You are not assigned to the requested section',
          );
        }
      }
    }

    // If sectionId is provided, resolve students in that section first
    let studentIds: string[] | undefined;
    if (query.sectionId) {
      const students = await this.prisma.student.findMany({
        where: { tenantId, sectionId: query.sectionId },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    }

    return this.prisma.studentGrade.findMany({
      where: {
        tenantId,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.term ? { term: query.term } : {}),
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async createReportCard(
    tenantId: string,
    userId: string,
    dto: CreateReportCardDto,
  ) {
    const metadata = dto.metadata as Record<string, any> | undefined;
    return this.prisma.academicReportCard.upsert({
      where: {
        tenantId_studentId_term: {
          tenantId,
          studentId: dto.studentId,
          term: dto.term,
        },
      },
      update: {
        overallScore: dto.overallScore,
        grade: dto.grade,
        remarks: dto.remarks,
        metadata: metadata ?? undefined,
        publishedBy: userId,
        status: this.toStatus(dto.status) || AcademicRecordStatus.DRAFT,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : undefined,
      },
      create: {
        tenantId,
        studentId: dto.studentId,
        term: dto.term,
        overallScore: dto.overallScore,
        grade: dto.grade,
        remarks: dto.remarks,
        metadata: metadata ?? undefined,
        publishedBy: userId,
        status: this.toStatus(dto.status) || AcademicRecordStatus.DRAFT,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
      },
    });
  }

  async listReportCards(tenantId: string, query: ListAcademicsQueryDto) {
    return this.prisma.academicReportCard.findMany({
      where: {
        tenantId,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.term ? { term: query.term } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: query.limit || 200,
    });
  }

  async updateReportCard(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateReportCardDto,
  ) {
    const existing = await this.prisma.academicReportCard.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Report card not found');

    const metadata = dto.metadata as Record<string, any> | undefined;
    return this.prisma.academicReportCard.update({
      where: { id },
      data: {
        ...(dto.studentId !== undefined ? { studentId: dto.studentId } : {}),
        ...(dto.term !== undefined ? { term: dto.term } : {}),
        ...(dto.overallScore !== undefined
          ? { overallScore: dto.overallScore }
          : {}),
        ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        ...(dto.metadata !== undefined
          ? {
              metadata: metadata ?? undefined,
            }
          : {}),
        ...(dto.status !== undefined
          ? { status: this.toStatus(dto.status) }
          : {}),
        ...(dto.status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
        publishedBy: userId,
      },
    });
  }

  async deleteReportCard(tenantId: string, id: string) {
    const existing = await this.prisma.academicReportCard.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Report card not found');
    await this.prisma.academicReportCard.delete({ where: { id } });
    return { success: true };
  }

  private async ensureConsultationNoConflict(
    tenantId: string,
    dto: CreateConsultationBookingDto,
    excludeId?: string,
  ) {
    const start = this.parseTimeToMinutes(dto.startTime);
    const end = this.parseTimeToMinutes(dto.endTime);
    if (end <= start)
      throw new BadRequestException('End time must be after start time');

    const sameDay = new Date(dto.consultationDate);
    sameDay.setHours(0, 0, 0, 0);
    const nextDay = new Date(sameDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const existing = await this.prisma.consultationBooking.findMany({
      where: {
        tenantId,
        consultationDate: { gte: sameDay, lt: nextDay },
        status: { not: ConsultationStatus.CANCELLED },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ teacherId: dto.teacherId }, { studentId: dto.studentId }],
      },
      select: {
        id: true,
        teacherId: true,
        studentId: true,
        startTime: true,
        endTime: true,
      },
    });

    const overlap = existing.find((slot) => {
      const slotStart = this.parseTimeToMinutes(slot.startTime);
      const slotEnd = this.parseTimeToMinutes(slot.endTime);
      return start < slotEnd && slotStart < end;
    });

    if (overlap) {
      throw new BadRequestException(
        'Conflicting consultation slot detected for teacher or student',
      );
    }
  }

  async createConsultationBooking(
    tenantId: string,
    user: { id: string; role?: string; userType?: string },
    dto: CreateConsultationBookingDto,
  ) {
    let resolvedTeacherId = dto.teacherId;
    if (!resolvedTeacherId && this.isTeacher(user)) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { tenantId, userId: user.id },
        select: { id: true },
      });
      resolvedTeacherId = teacher?.id;
    }
    if (!resolvedTeacherId) {
      throw new BadRequestException('teacherId is required');
    }

    const normalized: CreateConsultationBookingDto = {
      ...dto,
      teacherId: resolvedTeacherId,
    };

    await this.ensureConsultationNoConflict(tenantId, normalized);

    return this.prisma.consultationBooking.create({
      data: {
        tenantId,
        consultationDate: new Date(normalized.consultationDate),
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        studentId: normalized.studentId,
        teacherId: normalized.teacherId!,
        parentId: normalized.parentId,
        sectionId: normalized.sectionId,
        location: normalized.location,
        announcementId: normalized.announcementId,
        notes: normalized.notes,
        status:
          this.toConsultStatus(normalized.status) ||
          ConsultationStatus.SCHEDULED,
        createdBy: user.id,
      },
    });
  }

  async listConsultationBookings(
    tenantId: string,
    query: ListAcademicsQueryDto,
  ) {
    return this.prisma.consultationBooking.findMany({
      where: {
        tenantId,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              consultationDate: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ consultationDate: 'asc' }, { startTime: 'asc' }],
      take: query.limit || 300,
    });
  }

  async updateConsultationBooking(
    tenantId: string,
    id: string,
    dto: UpdateConsultationBookingDto,
  ) {
    const existing = await this.prisma.consultationBooking.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      throw new NotFoundException('Consultation booking not found');

    const merged: CreateConsultationBookingDto = {
      consultationDate:
        dto.consultationDate || existing.consultationDate.toISOString(),
      startTime: dto.startTime || existing.startTime,
      endTime: dto.endTime || existing.endTime,
      studentId: dto.studentId || existing.studentId,
      teacherId: dto.teacherId || existing.teacherId,
      parentId: dto.parentId ?? existing.parentId ?? undefined,
      sectionId: dto.sectionId ?? existing.sectionId ?? undefined,
      location: dto.location ?? existing.location ?? undefined,
      announcementId:
        dto.announcementId ?? existing.announcementId ?? undefined,
      notes: dto.notes ?? existing.notes ?? undefined,
      status: (dto.status as ConsultationStatus) ?? existing.status,
    };

    await this.ensureConsultationNoConflict(tenantId, merged, id);

    return this.prisma.consultationBooking.update({
      where: { id },
      data: {
        consultationDate: new Date(merged.consultationDate),
        startTime: merged.startTime,
        endTime: merged.endTime,
        studentId: merged.studentId,
        teacherId: merged.teacherId,
        parentId: merged.parentId,
        sectionId: merged.sectionId,
        location: merged.location,
        announcementId: merged.announcementId,
        notes: merged.notes,
        status: this.toConsultStatus(merged.status),
      },
    });
  }

  async deleteConsultationBooking(tenantId: string, id: string) {
    const existing = await this.prisma.consultationBooking.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      throw new NotFoundException('Consultation booking not found');
    await this.prisma.consultationBooking.delete({ where: { id } });
    return { success: true };
  }

  async exportConsultationBookingsIcs(
    tenantId: string,
    query: ListAcademicsQueryDto,
  ) {
    const bookings = await this.listConsultationBookings(tenantId, query);

    const students = await this.prisma.student.findMany({
      where: {
        id: { in: Array.from(new Set(bookings.map((b) => b.studentId))) },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    const teachers = await this.prisma.teacher.findMany({
      where: {
        id: { in: Array.from(new Set(bookings.map((b) => b.teacherId))) },
      },
      select: { id: true, firstName: true, lastName: true },
    });

    const studentMap = new Map(
      students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]),
    );
    const teacherMap = new Map(
      teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]),
    );

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Atlas//Consultations//EN',
    ];

    bookings.forEach((booking) => {
      const date = new Date(booking.consultationDate);
      const [sh, sm] = booking.startTime.split(':').map((v) => Number(v));
      const [eh, em] = booking.endTime.split(':').map((v) => Number(v));

      const start = new Date(date);
      start.setHours(sh || 0, sm || 0, 0, 0);
      const end = new Date(date);
      end.setHours(eh || 0, em || 0, 0, 0);

      const fmt = (d: Date) =>
        `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00Z`;

      const summary = `Consultation: ${studentMap.get(booking.studentId) || booking.studentId} with ${teacherMap.get(booking.teacherId) || booking.teacherId}`;
      const description = `Status: ${booking.status}${booking.notes ? `\\nNotes: ${booking.notes}` : ''}`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${booking.id}@atlas`);
      lines.push(`DTSTAMP:${fmt(new Date())}`);
      lines.push(`DTSTART:${fmt(start)}`);
      lines.push(`DTEND:${fmt(end)}`);
      lines.push(`SUMMARY:${summary.replace(/,/g, '\\,')}`);
      lines.push(`DESCRIPTION:${description.replace(/,/g, '\\,')}`);
      if (booking.location)
        lines.push(`LOCATION:${String(booking.location).replace(/,/g, '\\,')}`);
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
