import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePromotionDto,
  PromotionFiltersDto,
  UpdatePromotionDto,
} from './dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePromotionDto) {
    const existing = await this.prisma.promotion.findFirst({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `A promotion named "${dto.name}" already exists in this school.`,
      );
    }

    return this.prisma.promotion.create({
      data: { tenantId, ...dto },
      include: { _count: { select: { sections: true, students: true } } },
    });
  }

  async findAll(tenantId: string, filters: PromotionFiltersDto) {
    const where: any = { tenantId };
    if (filters.entryYear !== undefined) where.entryYear = filters.entryYear;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    const promotions = await this.prisma.promotion.findMany({
      where,
      include: {
        sections: {
          select: { _count: { select: { students: true } } },
        },
        _count: { select: { sections: true, students: true } },
      },
      orderBy: [{ entryYear: 'desc' }, { name: 'asc' }],
    });

    // Compute student count from enrolled section members (ground truth),
    // falling back to the denormalized promotionId count if sections are empty.
    return promotions.map((p) => {
      const sectionStudentTotal = p.sections.reduce(
        (sum, s) => sum + s._count.students,
        0,
      );
      return {
        ...p,
        _count: {
          sections: p._count.sections,
          students:
            sectionStudentTotal > 0 ? sectionStudentTotal : p._count.students,
        },
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, tenantId },
      include: {
        sections: {
          include: {
            grade: { select: { id: true, name: true, level: true } },
            _count: { select: { students: true } },
          },
          orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
        },
        _count: { select: { sections: true, students: true } },
      },
    });

    if (!promotion) throw new NotFoundException('Promotion not found.');
    return promotion;
  }

  async update(tenantId: string, id: string, dto: UpdatePromotionDto) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, tenantId },
    });
    if (!promotion) throw new NotFoundException('Promotion not found.');

    if (dto.name && dto.name !== promotion.name) {
      const conflict = await this.prisma.promotion.findFirst({
        where: { tenantId, name: dto.name, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(
          `A promotion named "${dto.name}" already exists.`,
        );
      }
    }

    return this.prisma.promotion.update({
      where: { id },
      data: dto,
      include: { _count: { select: { sections: true, students: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { sections: true, students: true } } },
    });
    if (!promotion) throw new NotFoundException('Promotion not found.');

    if (promotion._count.sections > 0 || promotion._count.students > 0) {
      throw new ConflictException(
        `Cannot delete promotion: it still has ${promotion._count.sections} classroom(s) and ${promotion._count.students} student(s) assigned to it. Reassign them first.`,
      );
    }

    return this.prisma.promotion.delete({ where: { id } });
  }

  /**
   * Returns students grouped by section for this promotion.
   * Uses section membership (sectionId) as the source of truth rather than
   * the denormalized student.promotionId field, so it works correctly even
   * before a full promotionId back-fill has been run.
   */
  async getRoster(tenantId: string, id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, tenantId },
      include: {
        sections: {
          select: {
            id: true,
            name: true,
            grade: {
              select: { id: true, name: true, code: true, level: true },
            },
            _count: { select: { students: true } },
          },
          orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
        },
      },
    });
    if (!promotion) throw new NotFoundException('Promotion not found.');

    const totalStudents = promotion.sections.reduce(
      (sum, s) => sum + s._count.students,
      0,
    );

    return {
      promotion: {
        id: promotion.id,
        name: promotion.name,
        entryYear: promotion.entryYear,
      },
      totalStudents,
      classrooms: promotion.sections.map((s) => ({
        section: { id: s.id, name: s.name, grade: s.grade },
        studentCount: s._count.students,
      })),
    };
  }

  /** Returns the paginated student list for a specific section within a promotion */
  async getSectionRoster(
    tenantId: string,
    promotionId: string,
    sectionId: string,
    page: number,
    limit: number,
  ) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id: promotionId, tenantId },
    });
    if (!promotion) throw new NotFoundException('Promotion not found.');

    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId, promotionId },
    });
    if (!section) throw new NotFoundException('Section not in this promotion.');

    const [students, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where: { tenantId, sectionId },
        select: {
          id: true,
          studentId: true,
          firstName: true,
          lastName: true,
          gender: true,
          admissionDate: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.student.count({ where: { tenantId, sectionId } }),
    ]);

    return { students, total, page, limit };
  }
}
