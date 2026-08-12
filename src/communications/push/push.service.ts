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

    // If registering with a known deviceId, deactivate stale tokens for that
    // device first — Expo can re-issue a new token after reinstall/update,
    // leaving the old one active and causing duplicate pushes.
    if (deviceId) {
      await this.prisma.pushToken.updateMany({
        where: {
          userId,
          deviceId,
          isActive: true,
          NOT: { token },
        },
        data: { isActive: false },
      });
    }

    // Atomic upsert — a manual findUnique-then-create/update here is
    // subject to a TOCTOU race (two concurrent registrations for the same
    // token both pass the "doesn't exist yet" check before either commits,
    // then the second create() hits the unique constraint on `token`).
    return this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, deviceId, isActive: true },
      create: { userId, token, platform, deviceId, isActive: true },
    });
  }

  /**
   * Unregister (deactivate) a push token. Scoped to the caller's own
   * userId — without this, any authenticated user who obtained/guessed
   * another user's token string could deactivate their push notifications.
   */
  async unregisterToken(token: string, userId: string) {
    const existing = await this.prisma.pushToken.findUnique({
      where: { token },
    });

    if (existing && existing.userId === userId) {
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

        // Check for errors. Only DeviceNotRegistered identifies a bad device
        // token. InvalidCredentials is an app-level APNs/FCM configuration
        // problem and must not disable valid tokens for every user.
        for (let i = 0; i < ticketChunk.length; i++) {
          const ticket = ticketChunk[i];
          const token = String(chunk[i]?.to || 'unknown');
          if (ticket.status === 'error') {
            this.logger.warn(
              `Push error for token ${token}: ${ticket.message}`,
            );

            if (ticket.details?.error === 'DeviceNotRegistered') {
              await this.prisma.pushToken.update({
                where: { token },
                data: { isActive: false },
              });
              this.logger.log(`Deactivated unregistered token: ${token}`);
            } else if (ticket.details?.error === 'InvalidCredentials') {
              this.logger.error(
                'Push provider credentials are invalid or missing; keeping the device token active so delivery resumes after APNs/FCM credentials are repaired.',
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(`Expo push chunk failed: ${error.message}`);
      }
    }
  }
}
