import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { EducationLevel, Prisma } from '../../prisma/generated/client';

const SECTION_INCLUDE = {
  grade: { select: { id: true, name: true, level: true, educationLevel: true } },
  promotion: { select: { id: true, name: true, entryYear: true } },
  combination: { select: { id: true, name: true, code: true } },
  _count: { select: { students: true } },
} as const;

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSectionDto) {
    const existingSection = await this.prisma.section.findFirst({
      where: { tenantId, gradeId: dto.gradeId, name: dto.name },
    });
    if (existingSection) {
      throw new ConflictException(
        `Section "${dto.name}" already exists for this grade.`,
      );
    }

    const grade = await this.prisma.grade.findUnique({
      where: { id: dto.gradeId },
      select: { educationLevel: true },
    });
    if (!grade) throw new NotFoundException(`Grade ${dto.gradeId} not found.`);

    if (grade.educationLevel === EducationLevel.ADVANCED) {
      if (!dto.combinationId) {
        throw new BadRequestException(
          'A subject combination is required for Advanced Level sections.',
        );
      }
      const combination = await this.prisma.combination.findUnique({
        where: { id: dto.combinationId, tenantId },
      });
      if (!combination) {
        throw new BadRequestException(`Combination ${dto.combinationId} not found.`);
      }
    } else if (dto.combinationId) {
      throw new BadRequestException(
        `Subject combinations are only allowed for Advanced Level sections.`,
      );
    }

    // Validate promotion belongs to tenant
    if (dto.promotionId) {
      const promotion = await this.prisma.promotion.findFirst({
        where: { id: dto.promotionId, tenantId },
      });
      if (!promotion) {
        throw new NotFoundException(`Promotion ${dto.promotionId} not found.`);
      }
    }

    try {
      return await this.prisma.section.create({
        data: { ...dto, tenantId },
        include: SECTION_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('A section with this name already exists for this grade.');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid grade, combination, or promotion ID.');
        }
      }
      throw error;
    }
  }

  async findAll(
    tenantId: string,
    filters?: { gradeId?: string; promotionId?: string; isActive?: boolean },
  ) {
    const where: any = { tenantId };
    if (filters?.gradeId) where.gradeId = filters.gradeId;
    if (filters?.promotionId) where.promotionId = filters.promotionId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    return this.prisma.section.findMany({
      where,
      include: SECTION_INCLUDE,
      orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: {
        ...SECTION_INCLUDE,
        students: {
          include: {
            user: { select: { id: true, avatar: true, status: true } },
          },
          orderBy: { lastName: 'asc' },
        },
        classes: {
          include: {
            teacher: {
              select: { id: true, firstName: true, lastName: true, photoUrl: true },
            },
          },
        },
      },
    });

    if (!section || section.tenantId !== tenantId) {
      throw new NotFoundException(`Section ${id} not found.`);
    }

    return section;
  }

  async update(tenantId: string, id: string, dto: UpdateSectionDto) {
    await this.findOne(tenantId, id);

    if ((dto as any).promotionId) {
      const promotion = await this.prisma.promotion.findFirst({
        where: { id: (dto as any).promotionId, tenantId },
      });
      if (!promotion) throw new NotFoundException('Promotion not found.');
    }

    return this.prisma.section.update({
      where: { id },
      data: dto,
      include: SECTION_INCLUDE,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    try {
      return await this.prisma.section.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Cannot delete this classroom: students are still assigned to it.',
        );
      }
      throw error;
    }
  }

  // ─── BULK STUDENT ASSIGNMENT ─────────────────────────────────────────────────

  /**
   * Assign multiple students to this section at once.
   * Students are moved from wherever they currently are; their gradeId is also
   * updated to match the section's grade.
   */
  async assignStudents(
    tenantId: string,
    sectionId: string,
    studentIds: string[],
  ) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId },
      select: { id: true, gradeId: true, promotionId: true },
    });
    if (!section) throw new NotFoundException('Section not found.');

    const uniqueIds = [...new Set(studentIds)];

    // Verify all students belong to this tenant
    const students = await this.prisma.student.findMany({
      where: { id: { in: uniqueIds }, tenantId },
      select: { id: true },
    });
    if (students.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more student IDs are invalid or do not belong to this school.',
      );
    }

    // Move all students to the section in one query
    await this.prisma.student.updateMany({
      where: { id: { in: uniqueIds }, tenantId },
      data: {
        sectionId,
        gradeId: section.gradeId,
        // Stamp promotionId if the section belongs to a promotion and student has none
        ...(section.promotionId ? { promotionId: section.promotionId } : {}),
      },
    });

    return {
      sectionId,
      assigned: uniqueIds.length,
      message: `${uniqueIds.length} student(s) assigned to this classroom.`,
    };
  }

  /**
   * Remove a single student from the section (does not delete the student).
   * gradeId is kept; sectionId is cleared to null via a direct update.
   * NOTE: sectionId is required on Student so this is intentionally left for
   *       the caller to re-assign the student to another section immediately.
   */
  async removeStudent(tenantId: string, sectionId: string, studentId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId },
    });
    if (!section) throw new NotFoundException('Section not found.');

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId, sectionId },
    });
    if (!student) {
      throw new NotFoundException(
        'Student not found in this classroom.',
      );
    }

    // Section is required on Student — removing means clearing it.
    // The schema makes sectionId non-nullable, so this is a soft-unassign:
    // the admin must immediately reassign the student to another section.
    // We throw a clear error instead of leaving the student in an invalid state.
    throw new BadRequestException(
      'Students must always be assigned to a classroom. Reassign the student to a different classroom instead of removing them.',
    );
  }
}
