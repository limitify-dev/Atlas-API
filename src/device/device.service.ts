import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeviceStatus,
  DeviceType,
  DeviceDirection,
  Prisma,
} from '../../prisma/generated/client';
import * as crypto from 'crypto';

/** A device with no contact for longer than this × heartbeatIntervalSec reads as offline. */
export const OFFLINE_HEARTBEAT_MULTIPLIER = 2.5;

/** Floor for the offline grace window, so very short intervals still tolerate jitter. */
export const OFFLINE_MIN_GRACE_MS = 90_000;

/** Milliseconds a device may be silent before the sweep flips it OFFLINE. */
export function offlineGraceMs(heartbeatIntervalSec: number): number {
  return Math.max(
    OFFLINE_MIN_GRACE_MS,
    heartbeatIntervalSec * 1000 * OFFLINE_HEARTBEAT_MULTIPLIER,
  );
}

@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a secure API key
   */
  private generateApiKey(): string {
    return `atlas_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Hash an API key for storage
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Register a new device and generate API key
   */
  async registerDevice(data: {
    tenantId: string;
    name: string;
    deviceType: DeviceType;
    location?: string;
    description?: string;
    direction?: DeviceDirection;
    heartbeatIntervalSec?: number;
    createdBy: string;
  }) {
    // Check if device with same name already exists for this tenant
    const existingDevice = await this.prisma.device.findFirst({
      where: {
        tenantId: data.tenantId,
        name: data.name,
      },
    });

    if (existingDevice) {
      throw new BadRequestException(
        `A device with the name "${data.name}" already exists for this tenant. Please use a different name or regenerate the API key for the existing device.`,
      );
    }

    // Generate API key
    const apiKey = this.generateApiKey();
    const apiKeyHash = this.hashApiKey(apiKey);

    // Create device
    const device = await this.prisma.device.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        deviceType: data.deviceType,
        location: data.location,
        description: data.description,
        direction: data.direction ?? 'BIDIRECTIONAL',
        heartbeatIntervalSec: data.heartbeatIntervalSec ?? 60,
        apiKey: apiKeyHash,
        apiKeyHash: apiKeyHash,
        status: 'INACTIVE',
        createdBy: data.createdBy,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Log the registration
    await this.prisma.deviceLog.create({
      data: {
        tenantId: data.tenantId,
        deviceId: device.id,
        action: 'REGISTERED',
        description: `Device registered by user ${data.createdBy}`,
      },
    });

    // Return device with plain API key (only shown once!)
    return {
      ...device,
      apiKeyPlain: apiKey, // This is the only time we return the plain key
    };
  }

  /**
   * Get all devices for a tenant
   */
  async getDevicesByTenant(tenantId: string) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { logs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return devices;
  }

  /**
   * Get a single device by ID
   */
  async getDeviceById(deviceId: string, tenantId: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        tenantId,
      },
      include: {
        logs: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { logs: true },
        },
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  /**
   * Regenerate API key for a device
   */
  async regenerateApiKey(deviceId: string, tenantId: string, userId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // Generate new API key
    const newApiKey = this.generateApiKey();
    const newApiKeyHash = this.hashApiKey(newApiKey);

    // Update device
    const updatedDevice = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        apiKey: newApiKeyHash,
        apiKeyHash: newApiKeyHash,
        status: 'INACTIVE', // Deactivate until new key is verified
        updatedAt: new Date(),
      },
    });

    // Log the regeneration
    await this.prisma.deviceLog.create({
      data: {
        tenantId,
        deviceId,
        action: 'API_KEY_REGENERATED',
        description: `API key regenerated by user ${userId}`,
      },
    });

    return {
      ...updatedDevice,
      apiKeyPlain: newApiKey, // Return plain key only once
    };
  }

  /**
   * Update device details
   */
  async updateDevice(
    deviceId: string,
    tenantId: string,
    data: {
      name?: string;
      location?: string;
      description?: string;
      status?: DeviceStatus;
      direction?: DeviceDirection;
      heartbeatIntervalSec?: number;
      expectedOnline?: boolean;
      networkName?: string;
      lastHeartbeatAt?: Date;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // If updating name, check for duplicates
    if (data.name && data.name !== device.name) {
      const existingDevice = await this.prisma.device.findFirst({
        where: {
          tenantId,
          name: data.name,
          id: { not: deviceId }, // Exclude current device
        },
      });

      if (existingDevice) {
        throw new BadRequestException(
          `A device with the name "${data.name}" already exists for this tenant. Please use a different name.`,
        );
      }
    }

    const updatedDevice = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    // Log status changes
    if (data.status && data.status !== device.status) {
      await this.prisma.deviceLog.create({
        data: {
          tenantId,
          deviceId,
          action: 'STATUS_CHANGED',
          description: `Status changed from ${device.status} to ${data.status}`,
        },
      });
    }

    return updatedDevice;
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string, tenantId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    await this.prisma.device.delete({
      where: { id: deviceId },
    });

    return { message: 'Device deleted successfully' };
  }

  /**
   * Authenticate device using API key
   */
  async authenticateDevice(apiKey: string, options?: { allowInactive?: boolean }) {
    const apiKeyHash = this.hashApiKey(apiKey);

    const device = await this.prisma.device.findUnique({
      where: { apiKey: apiKeyHash },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (!device) {
      throw new UnauthorizedException('Invalid API key');
    }

    // A freshly (re)generated device starts INACTIVE and only ever becomes
    // ACTIVE by calling /device-api/register with that same key — so that one
    // route has to accept a matching INACTIVE key, or a device could never
    // activate itself. SUSPENDED is a deliberate admin action and always
    // rejects, register included, so a suspended device can't reactivate
    // itself. OFFLINE is the opposite of deliberate — DeviceHealthService's
    // sweep sets it automatically after a silent stretch and is meant to
    // clear itself the moment the device is heard from again (see that
    // service's docstring) — so it's allowed through everywhere, not just
    // register, otherwise a device that ever goes quiet for one sweep cycle
    // can never make another successful call to prove it's back.
    const activatable = device.status === 'INACTIVE' && options?.allowInactive;
    const recoverable = device.status === 'OFFLINE';
    if (device.status !== 'ACTIVE' && !activatable && !recoverable) {
      throw new UnauthorizedException(
        `Device is ${device.status.toLowerCase()}`,
      );
    }

    if (device.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tenant account is not active');
    }

    // Update last seen — and if it was OFFLINE, this very call is the
    // "checked back in" signal DeviceHealthService's sweep would otherwise
    // wait up to a minute to notice, so recover it immediately.
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        ...(recoverable ? { status: 'ACTIVE' as const } : {}),
      },
    });

    return device;
  }

  /**
   * Log device activity
   */
  async logDeviceActivity(
    deviceId: string,
    action: string,
    description?: string,
    ipAddress?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    await this.prisma.deviceLog.create({
      data: {
        tenantId: device.tenantId,
        deviceId,
        action,
        description,
        ipAddress,
        metadata,
      },
    });

    // Update device IP if provided
    if (ipAddress && ipAddress !== device.ipAddress) {
      await this.prisma.device.update({
        where: { id: deviceId },
        data: { ipAddress },
      });
    }
  }

  /**
   * Get device logs
   */
  async getDeviceLogs(deviceId: string, tenantId: string, limit: number = 100) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const logs = await this.prisma.deviceLog.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs;
  }

  /**
   * Get device statistics for a tenant
   */
  async getDeviceStats(tenantId: string) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId },
    });

    const stats = {
      total: devices.length,
      active: devices.filter((d) => d.status === 'ACTIVE').length,
      inactive: devices.filter((d) => d.status === 'INACTIVE').length,
      suspended: devices.filter((d) => d.status === 'SUSPENDED').length,
      offline: devices.filter((d) => d.status === 'OFFLINE').length,
      byType: {} as Record<string, number>,
      recentlyActive: 0,
    };

    // Count by type
    devices.forEach((device) => {
      stats.byType[device.deviceType] =
        (stats.byType[device.deviceType] || 0) + 1;
    });

    // Count recently active (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    stats.recentlyActive = devices.filter(
      (d) => d.lastSeenAt && d.lastSeenAt > fiveMinutesAgo,
    ).length;

    return stats;
  }

  /**
   * Derive the *live* availability of a device from its stored status and how
   * long it has been silent — so the UI is accurate between offline sweeps.
   * `ONLINE` = seen within its heartbeat window; `DEGRADED` = silent but still
   * inside the offline grace period; `OFFLINE` = past the grace period;
   * `NEVER` = provisioned but never connected. SUSPENDED/INACTIVE pass through.
   */
  deriveAvailability(
    device: {
      status: DeviceStatus;
      lastSeenAt: Date | null;
      heartbeatIntervalSec: number;
    },
    now: Date = new Date(),
  ): 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'NEVER' | 'SUSPENDED' | 'INACTIVE' {
    if (device.status === 'SUSPENDED') return 'SUSPENDED';
    if (device.status === 'INACTIVE') return 'INACTIVE';
    if (!device.lastSeenAt) return 'NEVER';

    const silentMs = now.getTime() - device.lastSeenAt.getTime();
    if (silentMs <= device.heartbeatIntervalSec * 1000 * 1.5) return 'ONLINE';
    if (silentMs <= offlineGraceMs(device.heartbeatIntervalSec))
      return 'DEGRADED';
    return 'OFFLINE';
  }

  /**
   * Network-availability dashboard for a tenant's devices: per-device live
   * availability + recent scan throughput, plus a rollup.
   */
  async getHealthSummary(tenantId: string) {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const devices = await this.prisma.device.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    const scanCounts = await this.prisma.deviceScan.groupBy({
      by: ['deviceId', 'outcome'],
      where: { tenantId, scannedAt: { gte: hourAgo } },
      _count: { _all: true },
    });

    const perDevice = devices.map((d) => {
      const rows = scanCounts.filter((s) => s.deviceId === d.id);
      const scansLastHour = rows.reduce((n, r) => n + r._count._all, 0);
      const unknownLastHour = rows
        .filter(
          (r) => r.outcome === 'UNKNOWN_CARD' || r.outcome === 'INACTIVE_CARD',
        )
        .reduce((n, r) => n + r._count._all, 0);
      return {
        id: d.id,
        name: d.name,
        deviceType: d.deviceType,
        location: d.location,
        direction: d.direction,
        status: d.status,
        availability: this.deriveAvailability(d, now),
        lastSeenAt: d.lastSeenAt,
        lastHeartbeatAt: d.lastHeartbeatAt,
        secondsSinceSeen: d.lastSeenAt
          ? Math.round((now.getTime() - d.lastSeenAt.getTime()) / 1000)
          : null,
        heartbeatIntervalSec: d.heartbeatIntervalSec,
        expectedOnline: d.expectedOnline,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        networkName: d.networkName,
        firmwareVersion: d.firmwareVersion,
        scansLastHour,
        unknownCardRateLastHour:
          scansLastHour > 0
            ? Math.round((unknownLastHour / scansLastHour) * 100)
            : 0,
      };
    });

    const tally = (a: string) =>
      perDevice.filter((d) => d.availability === a).length;

    return {
      generatedAt: now.toISOString(),
      rollup: {
        total: perDevice.length,
        online: tally('ONLINE'),
        degraded: tally('DEGRADED'),
        offline: tally('OFFLINE'),
        neverConnected: tally('NEVER'),
        suspended: tally('SUSPENDED'),
        inactive: tally('INACTIVE'),
        scansLastHour: perDevice.reduce((n, d) => n + d.scansLastHour, 0),
      },
      devices: perDevice,
    };
  }
}
