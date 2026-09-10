import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import {
  DeviceService,
  offlineGraceMs,
  OFFLINE_MIN_GRACE_MS,
} from './device.service';
import { DeviceHealthService } from './device-health.service';

describe('offlineGraceMs', () => {
  it('floors short heartbeat intervals at the minimum grace', () => {
    expect(offlineGraceMs(5)).toBe(OFFLINE_MIN_GRACE_MS);
  });

  it('scales with the heartbeat interval for longer intervals', () => {
    expect(offlineGraceMs(120)).toBe(120 * 1000 * 2.5);
  });
});

describe('DeviceService.deriveAvailability', () => {
  const svc = new DeviceService({} as unknown as PrismaService);
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('ONLINE when seen within 1.5× the heartbeat interval', () => {
    expect(
      svc.deriveAvailability(
        {
          status: 'ACTIVE',
          heartbeatIntervalSec: 60,
          lastSeenAt: new Date(now.getTime() - 60_000),
        },
        now,
      ),
    ).toBe('ONLINE');
  });

  it('DEGRADED once silent past ONLINE but inside the grace window', () => {
    expect(
      svc.deriveAvailability(
        {
          status: 'ACTIVE',
          heartbeatIntervalSec: 60,
          lastSeenAt: new Date(now.getTime() - 120_000),
        },
        now,
      ),
    ).toBe('DEGRADED');
  });

  it('OFFLINE once past the grace window', () => {
    expect(
      svc.deriveAvailability(
        {
          status: 'ACTIVE',
          heartbeatIntervalSec: 60,
          lastSeenAt: new Date(now.getTime() - 10 * 60_000),
        },
        now,
      ),
    ).toBe('OFFLINE');
  });

  it('NEVER when provisioned but never seen', () => {
    expect(
      svc.deriveAvailability(
        { status: 'ACTIVE', heartbeatIntervalSec: 60, lastSeenAt: null },
        now,
      ),
    ).toBe('NEVER');
  });

  it('passes SUSPENDED / INACTIVE through untouched', () => {
    expect(
      svc.deriveAvailability(
        { status: 'SUSPENDED', heartbeatIntervalSec: 60, lastSeenAt: now },
        now,
      ),
    ).toBe('SUSPENDED');
  });
});

describe('DeviceHealthService.sweep', () => {
  let updates: Array<{ id: string; status: string }>;
  let health: DeviceHealthService;
  let emitted: string[];

  const build = async (devices: any[]) => {
    updates = [];
    emitted = [];
    const prisma = {
      device: {
        findMany: jest.fn().mockResolvedValue(devices),
        update: jest.fn().mockImplementation(({ where, data }) => {
          updates.push({ id: where.id, status: data.status });
          return Promise.resolve({});
        }),
      },
      deviceLog: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'admin1', tenantId: 't1' }]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeviceHealthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DomainEventsService,
          useValue: {
            emit: (e: object) => emitted.push(e.constructor.name),
          },
        },
      ],
    }).compile();
    health = moduleRef.get(DeviceHealthService);
  };

  it('flips a silent watched device to OFFLINE and emits DeviceOfflineEvent', async () => {
    await build([
      {
        id: 'd1',
        tenantId: 't1',
        name: 'Gate',
        status: 'ACTIVE',
        lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expectedOnline: true,
        heartbeatIntervalSec: 60,
      },
    ]);
    const res = await health.sweep();
    expect(res.markedOffline).toBe(1);
    expect(updates).toEqual([{ id: 'd1', status: 'OFFLINE' }]);
    expect(emitted).toContain('DeviceOfflineEvent');
  });

  it('recovers an OFFLINE device that has checked back in', async () => {
    await build([
      {
        id: 'd2',
        tenantId: 't1',
        name: 'Gate',
        status: 'OFFLINE',
        lastSeenAt: new Date(Date.now() - 10 * 1000),
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expectedOnline: true,
        heartbeatIntervalSec: 60,
      },
    ]);
    const res = await health.sweep();
    expect(res.recovered).toBe(1);
    expect(updates).toEqual([{ id: 'd2', status: 'ACTIVE' }]);
    expect(emitted).toContain('DeviceRecoveredEvent');
  });

  it('leaves an unwatched silent device alone', async () => {
    await build([
      {
        id: 'd3',
        tenantId: 't1',
        name: 'Spare',
        status: 'ACTIVE',
        lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expectedOnline: false,
        heartbeatIntervalSec: 60,
      },
    ]);
    const res = await health.sweep();
    expect(res).toEqual({ markedOffline: 0, recovered: 0 });
    expect(updates).toEqual([]);
  });
});
