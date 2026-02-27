import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateNotificationDto,
  NotificationTargetType,
  NotificationFiltersDto,
} from './dto/create-notification.dto';
import { PushService } from '../push/push.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Create a platform notification and distribute to recipients
   */
  async createNotification(data: CreateNotificationDto, senderId: string, senderTenantId?: string) {
    // Determine recipients based on target type
    let recipientUserIds: string[] = [];

    switch (data.targetType) {
      case NotificationTargetType.ALL:
        const allUsers = await this.prisma.user.findMany({
          where: {
            status: 'ACTIVE',
            ...(senderTenantId ? { tenantId: senderTenantId } : {}),
          },
          select: { id: true },
        });
        recipientUserIds = allUsers.map((u) => u.id);
        break;

      case NotificationTargetType.TENANT:
        const tenantIdForQuery = data.targetId || senderTenantId;
        if (tenantIdForQuery) {
          const tenantUsers = await this.prisma.user.findMany({
            where: { tenantId: tenantIdForQuery, status: 'ACTIVE' },
            select: { id: true },
          });
          recipientUserIds = tenantUsers.map((u) => u.id);
        }
        break;

      case NotificationTargetType.ROLE:
        if (data.targetId) {
          const roleUsers = await this.prisma.user.findMany({
            where: {
              role: data.targetId as any,
              status: 'ACTIVE',
              ...(senderTenantId ? { tenantId: senderTenantId } : {}),
            },
            select: { id: true },
          });
          recipientUserIds = roleUsers.map((u) => u.id);
        }
        break;

      case NotificationTargetType.USER_TYPE:
        if (data.targetId) {
          const typeUsers = await this.prisma.user.findMany({
            where: {
              userType: data.targetId as any,
              status: 'ACTIVE',
              ...(senderTenantId ? { tenantId: senderTenantId } : {}),
            },
            select: { id: true },
          });
          recipientUserIds = typeUsers.map((u) => u.id);
        }
        break;

      case NotificationTargetType.USER:
        if (data.targetId || data.targetIds?.length) {
          const requestedIds = data.targetId
            ? [data.targetId]
            : (data.targetIds ?? []);
          const users = await this.prisma.user.findMany({
            where: {
              id: { in: requestedIds },
              ...(senderTenantId ? { tenantId: senderTenantId } : {}),
            },
            select: { id: true },
          });
          recipientUserIds = users.map((u) => u.id);
        }
        break;
    }

    // Always include the sender so they can see their own notification
    recipientUserIds.push(senderId);
    const uniqueRecipientIds = Array.from(new Set(recipientUserIds));

    const recipients = await this.prisma.user.findMany({
      where: { id: { in: uniqueRecipientIds } },
      select: { id: true, tenantId: true },
    });

    // Create notifications for each recipient
    const notifications = await Promise.all(
      recipients.map((recipient) =>
        this.prisma.notification.create({
          data: {
            tenantId: recipient.tenantId || senderTenantId || '',
            userId: recipient.id,
            title: data.title,
            message: data.message,
            type: data.type || 'GENERAL',
            data: {
              ...data.data,
              targetType: data.targetType,
              senderId,
            },
          },
        }),
      ),
    );

    // Create recipient records for tracking read status
    await Promise.all(
      notifications.map((notification) =>
        this.prisma.notificationRecipient.create({
          data: {
            notificationId: notification.id,
            userId: notification.userId,
            isRead: false,
          },
        }),
      ),
    );

    // Send push notifications to all recipients (fire-and-forget)
    const recipientIds = recipients.map((r) => r.id);
    this.pushService
      .sendToUsers(recipientIds, data.title, data.message, {
        type: data.type || 'GENERAL',
        notificationIds: notifications.map((n) => n.id),
      })
      .catch((err) =>
        this.logger.warn(`Push notifications failed: ${err.message}`),
      );

    return {
      success: true,
      recipientCount: recipients.length,
      notificationIds: notifications.map((n) => n.id),
    };
  }

  /**
   * Get all notifications with filters (for admin)
   */
  async getNotifications(
    tenantId: string,
    filters: NotificationFiltersDto,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { tenantId };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          recipients: {
            select: {
              isRead: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    // Group notifications by title+message+type to show as single notification with recipient count
    const groupedMap = new Map<string, any>();

    notifications.forEach((notification) => {
      const key = `${notification.title}|${notification.message}|${notification.type}|${notification.createdAt.toISOString().split('T')[0]}`;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          createdAt: notification.createdAt,
          recipientCount: 1,
          readCount: notification.recipients.filter((r) => r.isRead).length,
          data: notification.data,
        });
      } else {
        const existing = groupedMap.get(key);
        existing.recipientCount++;
        existing.readCount += notification.recipients.filter(
          (r) => r.isRead,
        ).length;
      }
    });

    return {
      notifications: Array.from(groupedMap.values()),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(tenantId: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSent,
      sentToday,
      sentLast7Days,
      totalRecipients,
      readRecipients,
      byType,
    ] = await Promise.all([
      this.prisma.notification.count({ where: { tenantId } }),
      this.prisma.notification.count({
        where: { tenantId, createdAt: { gte: today } },
      }),
      this.prisma.notification.count({
        where: { tenantId, createdAt: { gte: last7Days } },
      }),
      this.prisma.notificationRecipient.count({
        where: { notification: { tenantId } },
      }),
      this.prisma.notificationRecipient.count({
        where: { isRead: true, notification: { tenantId } },
      }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where: { tenantId },
        _count: { id: true },
      }),
    ]);

    const deliveryRate =
      totalRecipients > 0
        ? Math.round((readRecipients / totalRecipients) * 100)
        : 0;

    return {
      totalSent,
      sentToday,
      sentLast7Days,
      deliveryRate,
      readRate: deliveryRate,
      byType: byType.reduce(
        (acc, item) => {
          acc[item.type] = item._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  /**
   * Get notifications for a specific user
   */
  async getUserNotifications(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ) {
    const limit = options.limit || 20;

    const recipients = await this.prisma.notificationRecipient.findMany({
      where: {
        userId,
        ...(options.unreadOnly ? { isRead: false } : {}),
      },
      include: {
        notification: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await this.prisma.notificationRecipient.count({
      where: { userId, isRead: false },
    });

    return {
      notifications: recipients.map((r) => ({
        id: r.id,
        notificationId: r.notificationId,
        title: r.notification?.title,
        message: r.notification?.message,
        type: r.notification?.type,
        data: r.notification?.data,
        isRead: r.isRead,
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
      unreadCount,
    };
  }

  /**
   * Mark a notification as read for a user
   */
  async markAsRead(recipientId: string, userId: string) {
    const recipient = await this.prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId },
    });

    if (!recipient) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notificationRecipient.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { markedAsRead: result.count };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(id: string, tenantId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Delete recipients first (cascade should handle this, but being explicit)
    await this.prisma.notificationRecipient.deleteMany({
      where: { notificationId: id },
    });

    return this.prisma.notification.delete({
      where: { id },
    });
  }

  /**
   * Dismiss a notification for a user (deletes their recipient record)
   */
  async dismissNotification(recipientId: string, userId: string) {
    const recipient = await this.prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId },
    });

    if (!recipient) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notificationRecipient.delete({
      where: { id: recipientId },
    });

    return { success: true };
  }

  /**
   * Clear all notifications for a user (marks all as read and deletes recipient records)
   */
  async clearAllNotifications(userId: string) {
    const result = await this.prisma.notificationRecipient.deleteMany({
      where: { userId },
    });

    return { cleared: result.count };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notificationRecipient.count({
      where: { userId, isRead: false },
    });

    return { unreadCount: count };
  }
}
