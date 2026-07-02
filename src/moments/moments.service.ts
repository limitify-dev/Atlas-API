import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMomentDto, MomentFiltersDto, UpdateMomentDto } from './dto';

const MOMENT_SELECT = {
  id: true,
  tenantId: true,
  teacherId: true,
  title: true,
  caption: true,
  sectionId: true,
  classLabel: true,
  photoUrls: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  teacher: {
    select: { id: true, name: true, avatar: true },
  },
  likes: {
    select: { userId: true },
  },
};

function formatMoment(m: any, requestingUserId?: string) {
  return {
    ...m,
    likeCount: m.likes?.length ?? 0,
    likedByMe: requestingUserId
      ? (m.likes ?? []).some((l: any) => l.userId === requestingUserId)
      : false,
    likes: undefined,
  };
}

@Injectable()
export class MomentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    teacherId: string,
    dto: CreateMomentDto,
  ) {
    const moment = await this.prisma.moment.create({
      data: {
        tenantId,
        teacherId,
        title: dto.title,
        caption: dto.caption,
        sectionId: dto.sectionId,
        classLabel: dto.classLabel,
        photoUrls: dto.photoUrls,
        status: dto.status ?? 'PUBLISHED',
      },
      select: MOMENT_SELECT,
    });
    return formatMoment(moment, teacherId);
  }

  async findAll(
    tenantId: string,
    filters: MomentFiltersDto,
    requestingUserId?: string,
  ) {
    const moments = await this.prisma.moment.findMany({
      where: {
        tenantId,
        status: 'PUBLISHED',
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      },
      select: MOMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return moments.map((m) => formatMoment(m, requestingUserId));
  }

  async findOne(tenantId: string, id: string, requestingUserId?: string) {
    const moment = await this.prisma.moment.findFirst({
      where: { id, tenantId },
      select: MOMENT_SELECT,
    });
    if (!moment) throw new NotFoundException('Moment not found.');
    return formatMoment(moment, requestingUserId);
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateMomentDto,
    userRole?: string,
  ) {
    const existing = await this.prisma.moment.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Moment not found.');
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && existing.teacherId !== userId) {
      throw new ForbiddenException('You can only edit your own moments.');
    }
    const moment = await this.prisma.moment.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
        ...(dto.photoUrls !== undefined ? { photoUrls: dto.photoUrls } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: MOMENT_SELECT,
    });
    return formatMoment(moment, userId);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.moment.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Moment not found.');
    if (existing.teacherId !== userId) {
      throw new ForbiddenException('You can only delete your own moments.');
    }
    await this.prisma.moment.delete({ where: { id } });
    return { id, deleted: true };
  }

  async toggleLike(tenantId: string, userId: string, momentId: string) {
    const moment = await this.prisma.moment.findFirst({
      where: { id: momentId, tenantId },
    });
    if (!moment) throw new NotFoundException('Moment not found.');

    const existing = await this.prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId, userId } },
    });

    if (existing) {
      await this.prisma.momentLike.delete({
        where: { momentId_userId: { momentId, userId } },
      });
      return { liked: false };
    } else {
      await this.prisma.momentLike.create({ data: { momentId, userId } });
      return { liked: true };
    }
  }
}
