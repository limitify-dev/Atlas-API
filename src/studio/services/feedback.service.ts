import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FeedbackCategory,
  FeedbackStatus,
} from '../../../prisma/generated/client';
import { UpdateFeedbackDto } from '../dto';

interface FeedbackFilters {
  tenantId?: string;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FeedbackFilters = {}) {
    return this.prisma.feedback.findMany({
      where: {
        ...(filters.tenantId && { tenantId: filters.tenantId }),
        ...(filters.category && { category: filters.category }),
        ...(filters.status && { status: filters.status }),
      },
      include: {
        user: { select: { id: true, name: true, role: true, userType: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!item) throw new NotFoundException('Feedback not found.');
    return item;
  }

  async updateStatus(id: string, dto: UpdateFeedbackDto) {
    await this.findOne(id);
    return this.prisma.feedback.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === FeedbackStatus.RESOLVED && {
          resolvedAt: new Date(),
        }),
      },
    });
  }

  async getStats() {
    const [total, byStatus, byCategory] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.feedback.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
    ]);
    return { total, byStatus, byCategory };
  }
}
