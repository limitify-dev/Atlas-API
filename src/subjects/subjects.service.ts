import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto } from './dto';

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
