import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

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
