import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { PushService } from '../push/push.service';
import {
  AnnouncementFiltersDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto';
import {
  AnnouncementStatus,
  Prisma,
  Role,
} from '../../../prisma/generated/client';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly pushService: PushService,
  ) {}

  async uploadImage(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const fileName = `banner-${Date.now()}.${fileExt}`;
    const filePath = `${tenantId}/announcements/${userId}/${fileName}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('atlas-profiles')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Banner image upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = this.supabase.client.storage
      .from('atlas-profiles')
      .getPublicUrl(filePath);

    return { imageUrl: urlData.publicUrl };
  }

  async create(tenantId: string, userId: string, dto: CreateAnnouncementDto) {
    const status = (dto.status as AnnouncementStatus) || 'ACTIVE';
    const announcement = await this.prisma.announcement.create({
      data: {
        tenantId,
        publishedBy: userId,
        title: dto.title,
        content: dto.content,
        imageUrl: dto.imageUrl || null,
        ctaLabel: dto.ctaLabel || null,
        ctaType: dto.ctaType || null,
        ctaUrl: dto.ctaUrl || null,
        priority: dto.priority || 'NORMAL',
        audience: dto.audience || 'ALL',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isPinned: dto.isPinned || false,
        status,
        // publishedAt should represent when the announcement became active.
        publishedAt: status === 'ACTIVE' ? new Date() : undefined,
      },
      include: {
        publisher: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create NotificationRecipient records for target users
    const targetUsers = await this.getTargetUsers(
      tenantId,
      announcement.audience,
    );

    if (targetUsers.length > 0) {
      await this.prisma.notificationRecipient.createMany({
        data: targetUsers.map((user) => ({
          announcementId: announcement.id,
          userId: user.id,
        })),
        skipDuplicates: true,
      });
    }

    if (announcement.status === 'ACTIVE' && targetUsers.length > 0) {
      await this.sendAnnouncementPush(
        announcement,
        targetUsers.map((u) => u.id),
      );
    }

    return announcement;
  }

  async findAll(
    tenantId: string,
    filters: AnnouncementFiltersDto,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.AnnouncementWhereInput = { tenantId };

    if (filters.status) {
      where.status = filters.status as AnnouncementStatus;
    }
    if (filters.audience) {
      where.audience = filters.audience;
    }
    if (filters.priority) {
      where.priority = filters.priority;
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [announcements, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        include: {
          publisher: {
            select: { id: true, name: true, email: true },
          },
          recipients: {
            select: { isRead: true },
          },
          _count: {
            select: { recipients: true },
          },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    const data = announcements.map((announcement) => {
      const viewedCount =
        announcement.recipients?.filter((r) => r.isRead).length ?? 0;
      const { recipients: _recipients, ...rest } = announcement;
      return {
        ...rest,
        recipientCount: announcement._count?.recipients ?? 0,
        viewedCount,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findForUser(
    userId: string,
    tenantId: string,
    userRole: string,
    filters: AnnouncementFiltersDto,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const audienceFilter = this.getAudienceFilterForRole(userRole);

    const where: Prisma.AnnouncementWhereInput = {
      tenantId,
      status: AnnouncementStatus.ACTIVE,
      audience: { in: audienceFilter },
    };

    if (filters.status) {
      where.status = filters.status as AnnouncementStatus;
    }
    if (filters.priority) {
      where.priority = filters.priority;
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [announcements, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        include: {
          publisher: {
            select: { id: true, name: true, email: true },
          },
          recipients: {
            where: { userId },
            select: { isRead: true, readAt: true },
          },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    const data = announcements.map((announcement) => {
      const recipient = announcement.recipients?.[0];
      const { recipients: _r, ...announcementWithoutRecipients } = announcement;
      return {
        ...announcementWithoutRecipients,
        isRead: recipient?.isRead || false,
        readAt: recipient?.readAt || null,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, tenantId },
      include: {
        publisher: {
          select: { id: true, name: true, email: true },
        },
        recipients: {
          select: { isRead: true },
        },
        _count: {
          select: { recipients: true },
        },
      },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const viewedCount = announcement.recipients.filter(
      (r: { isRead: boolean }) => r.isRead,
    ).length;
    const { recipients: _recipients3, ...rest } = announcement;
    return {
      ...rest,
      recipientCount: announcement._count?.recipients ?? 0,
      viewedCount,
    };
  }

  async update(id: string, tenantId: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    const data: Prisma.AnnouncementUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl || null;
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel || null;
    if (dto.ctaType !== undefined) data.ctaType = dto.ctaType || null;
    if (dto.ctaUrl !== undefined) data.ctaUrl = dto.ctaUrl || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (dto.expiresAt !== undefined)
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.isPinned !== undefined) data.isPinned = dto.isPinned;
    if (dto.status !== undefined) {
      data.status = dto.status as AnnouncementStatus;
    }
    if (
      dto.status !== undefined &&
      dto.status === 'ACTIVE' &&
      existing.status !== 'ACTIVE'
    ) {
      // Reset publish time when moving into ACTIVE state.
      data.publishedAt = new Date();
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data,
      include: {
        publisher: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (existing.status !== 'ACTIVE' && updated.status === 'ACTIVE') {
      const targetUsers = await this.getTargetUsers(tenantId, updated.audience);
      if (targetUsers.length > 0) {
        await this.sendAnnouncementPush(
          updated,
          targetUsers.map((u) => u.id),
        );
      }
    }

    return updated;
  }

  async delete(id: string, tenantId: string) {
    const existing = await this.prisma.announcement.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    await this.prisma.announcement.delete({ where: { id } });

    return { message: 'Announcement deleted successfully' };
  }

  async setPin(id: string, tenantId: string, isPinned?: boolean) {
    const existing = await this.prisma.announcement.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    return this.prisma.announcement.update({
      where: { id },
      data: { isPinned: isPinned ?? !existing.isPinned },
      include: {
        publisher: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async markAsRead(announcementId: string, userId: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true },
    });

    if (!announcement) {
      // Gracefully ignore stale/invalid IDs to avoid FK violations.
      return {
        success: false,
        message: 'Announcement not found',
      };
    }

    const recipient = await this.prisma.notificationRecipient.findFirst({
      where: { announcementId, userId },
    });

    if (!recipient) {
      // Create recipient record if it doesn't exist
      return this.prisma.notificationRecipient.create({
        data: {
          announcementId,
          userId,
          isRead: true,
          readAt: new Date(),
        },
      });
    }

    if (recipient.isRead) {
      return recipient;
    }

    return this.prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getStats(tenantId: string) {
    const [active, expired, pinned, totalViews] = await Promise.all([
      this.prisma.announcement.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.announcement.count({
        where: { tenantId, status: 'EXPIRED' },
      }),
      this.prisma.announcement.count({ where: { tenantId, isPinned: true } }),
      this.prisma.notificationRecipient.count({
        where: {
          isRead: true,
          announcement: { tenantId },
        },
      }),
    ]);

    return { active, expired, pinned, totalViews };
  }

  private async getTargetUsers(tenantId: string, audience: string) {
    const where: {
      tenantId: string;
      role?: Role | { in: Role[] };
    } = { tenantId };

    switch (audience) {
      case 'PARENTS':
        where.role = Role.STAFF;
        break;
      case 'STUDENTS':
        where.role = Role.STAFF;
        break;
      case 'STAFF':
        where.role = { in: [Role.ADMIN, Role.STAFF, Role.TEACHER] };
        break;
      case 'ALL':
      default:
        break;
    }

    return this.prisma.user.findMany({
      where,
      select: { id: true },
    });
  }

  private getAudienceFilterForRole(role: string): string[] {
    switch (role) {
      case 'ADMIN':
      case 'SUPER_ADMIN':
      case 'DOS':
      case 'DM':
        return ['ALL', 'STAFF', 'PARENTS', 'STUDENTS'];
      case 'TEACHER':
        return ['ALL', 'STAFF'];
      case 'PARENT':
        return ['ALL', 'PARENTS'];
      case 'STUDENT':
        return ['ALL', 'STUDENTS'];
      default:
        return ['ALL'];
    }
  }

  private async sendAnnouncementPush(
    announcement: {
      id?: string;
      title: string;
      content: string;
      imageUrl: string | null;
      ctaLabel: string | null;
      ctaType: string | null;
      ctaUrl: string | null;
      publishedAt: string | Date | null;
    },
    userIds: string[],
  ) {
    const title = announcement.title || 'New Announcement';
    const content = String(announcement.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    const body =
      content.length > 160
        ? `${content.slice(0, 157).trimEnd()}...`
        : content || 'Tap to view.';

    try {
      await this.pushService.sendToUsers(userIds, title, body, {
        type: 'announcement',
        announcementId: announcement.id,
        title: announcement.title || '',
        content: announcement.content || '',
        imageUrl: announcement.imageUrl || '',
        ctaLabel: announcement.ctaLabel || '',
        ctaType: announcement.ctaType || '',
        ctaUrl: announcement.ctaUrl || '',
        publishedAt:
          announcement.publishedAt instanceof Date
            ? announcement.publishedAt.toISOString()
            : String(announcement.publishedAt || ''),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Announcement push failed: ${message}`);
    }
  }
}
