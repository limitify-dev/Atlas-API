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

    return this.prisma.promotion.findMany({
      where,
      include: {
        _count: { select: { sections: true, students: true } },
      },
      orderBy: [{ entryYear: 'desc' }, { name: 'asc' }],
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
          orderBy: [
            { grade: { level: 'asc' } },
            { name: 'asc' },
          ],
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

  /** Returns all students who belong to this promotion, grouped by their current section */
  async getRoster(tenantId: string, id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, tenantId },
    });
    if (!promotion) throw new NotFoundException('Promotion not found.');

    const students = await this.prisma.student.findMany({
      where: { tenantId, promotionId: id },
      include: {
        section: { select: { id: true, name: true } },
        grade: { select: { id: true, name: true, level: true } },
        user: { select: { id: true, avatar: true, status: true } },
      },
      orderBy: [{ grade: { level: 'asc' } }, { lastName: 'asc' }],
    });

    // Group by section for a structured roster view
    const bySectionMap = new Map<
      string,
      { section: { id: string; name: string }; students: typeof students }
    >();

    for (const student of students) {
      const key = student.sectionId;
      if (!bySectionMap.has(key)) {
        bySectionMap.set(key, {
          section: student.section,
          students: [],
        });
      }
      bySectionMap.get(key)!.students.push(student);
    }

    return {
      promotion,
      totalStudents: students.length,
      classrooms: Array.from(bySectionMap.values()),
    };
  }
}
