import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a push token for a user
   */
  async registerToken(
    userId: string,
    token: string,
    platform: 'EXPO' | 'FCM_WEB',
    deviceId?: string,
  ) {
    // Validate Expo token format
    if (platform === 'EXPO' && !Expo.isExpoPushToken(token)) {
      this.logger.warn(`Invalid Expo push token: ${String(token)}`);
      throw new Error('Invalid Expo push token');
    }

    // Upsert: if token already exists, update it; otherwise create
    const existing = await this.prisma.pushToken.findUnique({
      where: { token },
    });

    if (existing) {
      return this.prisma.pushToken.update({
        where: { token },
        data: { userId, platform, deviceId, isActive: true },
      });
    }

    return this.prisma.pushToken.create({
      data: { userId, token, platform, deviceId, isActive: true },
    });
  }

  /**
   * Unregister (deactivate) a push token
   */
  async unregisterToken(token: string) {
    const existing = await this.prisma.pushToken.findUnique({
      where: { token },
    });

    if (existing) {
      await this.prisma.pushToken.update({
        where: { token },
        data: { isActive: false },
      });
    }

    return { success: true };
  }

  /**
   * Send push notification to a single user (all their active devices)
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId, isActive: true },
    });

    if (tokens.length === 0) {
      this.logger.debug(`No active push tokens for user ${userId}`);
      return;
    }

    const expoTokens = tokens.filter((t) => t.platform === 'EXPO');

    if (expoTokens.length > 0) {
      await this.sendExpoNotifications(
        expoTokens.map((t) => t.token),
        title,
        body,
        data,
      );
    }

    // FCM_WEB push can be added here in the future
  }

  /**
   * Send push notifications to multiple users
   */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueUserIds.length) return;

    const tokens = await this.prisma.pushToken.findMany({
      where: {
        userId: { in: uniqueUserIds },
        isActive: true,
        platform: 'EXPO',
      },
      select: { token: true },
    });

    const expoTokens = Array.from(new Set(tokens.map((t) => t.token)));
    if (!expoTokens.length) {
      this.logger.debug('No active Expo push tokens for target users');
      return;
    }

    await this.sendExpoNotifications(expoTokens, title, body, data);
  }

  /**
   * Send Expo push notifications
   */
  private async sendExpoNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const dataType = String(data?.type || '').toLowerCase();
    const channelId =
      dataType === 'announcement'
        ? 'announcements'
        : dataType === 'chat_message'
          ? 'messages'
          : dataType === 'library_missing_invoice'
            ? 'financials'
            : 'default';

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      priority: 'high',
      channelId,
      data,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);

        // Check for errors and deactivate invalid tokens
        for (let i = 0; i < ticketChunk.length; i++) {
          const ticket = ticketChunk[i];
          if (ticket.status === 'error') {
            this.logger.warn(
              `Push error for token ${tokens[i]}: ${ticket.message}`,
            );

            // Deactivate token if it's invalid
            if (
              ticket.details?.error === 'DeviceNotRegistered' ||
              ticket.details?.error === 'InvalidCredentials'
            ) {
              await this.prisma.pushToken.update({
                where: { token: tokens[i] },
                data: { isActive: false },
              });
              this.logger.log(`Deactivated invalid token: ${tokens[i]}`);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Expo push chunk failed: ${error.message}`);
      }
    }
  }
}
