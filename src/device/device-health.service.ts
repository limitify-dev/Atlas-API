import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import {
  DeviceOfflineEvent,
  DeviceRecoveredEvent,
} from '../domain-events/events';
import { offlineGraceMs } from './device.service';

/**
 * Periodic network-availability sweep for smart-attendance devices.
 *
 * A device that has been silent past its offline grace window (a multiple of
 * its heartbeat interval) is flipped ACTIVE → OFFLINE; one that checks back in
 * is flipped OFFLINE → ACTIVE. Both transitions are logged to `device_logs`
 * and raise a domain event so tenant admins get a push.
 *
 * Heartbeats already flip a device to ACTIVE inline; this sweep is the
 * backstop (scan-only devices never heartbeat) and the source of the
 * offline/recovered notifications.
 */
@Injectable()
export class DeviceHealthService {
  private readonly logger = new Logger(DeviceHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'device-offline-sweep' })
  async sweep(): Promise<{ markedOffline: number; recovered: number }> {
    const now = new Date();

    const candidates = await this.prisma.device.findMany({
      where: { status: { in: ['ACTIVE', 'OFFLINE'] } },
      select: {
        id: true,
        tenantId: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        expectedOnline: true,
        heartbeatIntervalSec: true,
      },
    });

    const goneOffline: typeof candidates = [];
    const recovered: typeof candidates = [];

    for (const d of candidates) {
      const grace = offlineGraceMs(d.heartbeatIntervalSec);
      const reference = d.lastSeenAt ?? d.createdAt;
      const silentMs = now.getTime() - reference.getTime();

      if (d.status === 'ACTIVE' && d.expectedOnline && silentMs > grace) {
        goneOffline.push(d);
      } else if (
        d.status === 'OFFLINE' &&
        d.lastSeenAt &&
        now.getTime() - d.lastSeenAt.getTime() <=
          d.heartbeatIntervalSec * 1000 * 1.5
      ) {
        recovered.push(d);
      }
    }

    if (!goneOffline.length && !recovered.length) {
      return { markedOffline: 0, recovered: 0 };
    }

    const adminsByTenant = await this.resolveAdmins([
      ...goneOffline.map((d) => d.tenantId),
      ...recovered.map((d) => d.tenantId),
    ]);

    for (const d of goneOffline) {
      await this.prisma.device.update({
        where: { id: d.id },
        data: { status: 'OFFLINE' },
      });
      await this.prisma.deviceLog.create({
        data: {
          tenantId: d.tenantId,
          deviceId: d.id,
          action: 'STATUS_CHANGED',
          description: `Marked OFFLINE — no contact for ${Math.round(
            (now.getTime() - (d.lastSeenAt ?? d.createdAt).getTime()) / 1000,
          )}s`,
        },
      });
      this.events.emit(
        new DeviceOfflineEvent(
          d.tenantId,
          d.id,
          d.name,
          d.lastSeenAt,
          adminsByTenant.get(d.tenantId) ?? [],
        ),
      );
    }

    for (const d of recovered) {
      await this.prisma.device.update({
        where: { id: d.id },
        data: { status: 'ACTIVE' },
      });
      const offlineForMs = d.lastSeenAt
        ? now.getTime() - d.lastSeenAt.getTime()
        : 0;
      await this.prisma.deviceLog.create({
        data: {
          tenantId: d.tenantId,
          deviceId: d.id,
          action: 'STATUS_CHANGED',
          description: 'Recovered — device is reporting again',
        },
      });
      this.events.emit(
        new DeviceRecoveredEvent(
          d.tenantId,
          d.id,
          d.name,
          offlineForMs,
          adminsByTenant.get(d.tenantId) ?? [],
        ),
      );
    }

    this.logger.log(
      `device sweep: ${goneOffline.length} offline, ${recovered.length} recovered`,
    );
    return { markedOffline: goneOffline.length, recovered: recovered.length };
  }

  private async resolveAdmins(
    tenantIds: string[],
  ): Promise<Map<string, string[]>> {
    const unique = [...new Set(tenantIds)];
    if (!unique.length) return new Map();

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: { in: unique },
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true, tenantId: true },
    });

    const map = new Map<string, string[]>();
    for (const u of users) {
      if (!u.tenantId) continue;
      const list = map.get(u.tenantId) ?? [];
      list.push(u.id);
      map.set(u.tenantId, list);
    }
    return map;
  }
}
