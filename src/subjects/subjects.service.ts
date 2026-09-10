import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkCreateSubjectsDto,
  CreateSubjectDto,
  UpdateSubjectDto,
} from './dto';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSubjectDto) {
    const grade = await this.prisma.grade.findFirst({
      where: { id: dto.gradeId, tenantId },
    });
    if (!grade) throw new NotFoundException('Grade not found');

    const existing = await this.prisma.subject.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `A subject with code "${dto.code}" already exists.`,
      );
    }

    return this.prisma.subject.create({
      data: { tenantId, ...dto },
      include: {
        grade: { select: { id: true, name: true, code: true } },
      },
    });
  }

  /**
   * Create many subjects at once. Rows with a missing field, an unknown grade,
   * or a duplicate code (against existing subjects or earlier rows in the batch)
   * are skipped and reported back; everything else is created.
   */
  async bulkCreate(tenantId: string, dto: BulkCreateSubjectsDto) {
    const grades = await this.prisma.grade.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const gradeIds = new Set(grades.map((g) => g.id));

    const existing = await this.prisma.subject.findMany({
      where: { tenantId },
      select: { code: true },
    });
    const usedCodes = new Set(existing.map((s) => s.code.toUpperCase()));

    const created: Awaited<ReturnType<typeof this.create>>[] = [];
    const errors: { row: number; name: string; code: string; message: string }[] =
      [];

    for (let i = 0; i < dto.subjects.length; i++) {
      const raw = dto.subjects[i];
      const row = i + 1;
      const name = raw.name?.trim();
      const code = raw.code?.trim().toUpperCase();
      const gradeId = raw.gradeId;

      if (!name || !code || !gradeId) {
        errors.push({
          row,
          name: name ?? '',
          code: code ?? '',
          message: 'Name, code and grade are required.',
        });
        continue;
      }
      if (!gradeIds.has(gradeId)) {
        errors.push({ row, name, code, message: 'Grade not found.' });
        continue;
      }
      if (usedCodes.has(code)) {
        errors.push({
          row,
          name,
          code,
          message: `A subject with code "${code}" already exists.`,
        });
        continue;
      }

      try {
        const subject = await this.prisma.subject.create({
          data: {
            tenantId,
            name,
            code,
            gradeId,
            description: raw.description?.trim() || null,
          },
          include: { grade: { select: { id: true, name: true, code: true } } },
        });
        usedCodes.add(code);
        created.push(subject);
      } catch (e) {
        errors.push({
          row,
          name,
          code,
          message: e instanceof Error ? e.message : 'Failed to create subject.',
        });
      }
    }

    return {
      created,
      createdCount: created.length,
      errors,
      errorCount: errors.length,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateSubjectDto) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    if (dto.gradeId && dto.gradeId !== subject.gradeId) {
      const grade = await this.prisma.grade.findFirst({
        where: { id: dto.gradeId, tenantId },
      });
      if (!grade) throw new NotFoundException('Grade not found');
    }

    if (dto.code && dto.code !== subject.code) {
      const conflict = await this.prisma.subject.findFirst({
        where: { tenantId, code: dto.code, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(
          `A subject with code "${dto.code}" already exists.`,
        );
      }
    }

    return this.prisma.subject.update({
      where: { id },
      data: dto,
      include: {
        grade: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    await this.prisma.subject.delete({ where: { id } });
    return { id, deleted: true };
  }

  async findAll(tenantId: string, gradeId?: string) {
    return this.prisma.subject.findMany({
      where: {
        tenantId,
        ...(gradeId ? { gradeId } : {}),
      },
      include: {
        grade: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId },
      include: {
        grade: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    return subject;
  }
}
