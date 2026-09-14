import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { SchoolEntryService } from './school-entry.service';

describe('SchoolEntryService.recordScan', () => {
  let service: SchoolEntryService;
  let entryStore: any;

  const makePrisma = () => ({
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'stu1' }) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        timezone: 'UTC',
        settings: { attendance: { startTime: '08:00' } },
      }),
    },
    schoolEntry: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(entryStore)),
      create: jest.fn().mockImplementation(({ data }) => {
        entryStore = { id: 'e1', ...data };
        return Promise.resolve(entryStore);
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        entryStore = { ...entryStore, ...data };
        return Promise.resolve(entryStore);
      }),
    },
  });

  beforeEach(async () => {
    entryStore = null;
    const prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SchoolEntryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { del: jest.fn(), delByPattern: jest.fn() } },
        { provide: DomainEventsService, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(SchoolEntryService);
  });

  it('first scan before start time → PRESENT check-in', async () => {
    const r = await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:00.000Z'),
      method: 'CARD',
    });
    expect(r.action).toBe('check-in');
    expect(r.status).toBe('PRESENT');
    expect(r.checkInAt).toEqual(new Date('2026-09-03T07:30:00.000Z'));
  });

  it('first scan after start time → LATE', async () => {
    const r = await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T09:15:00.000Z'),
      method: 'CARD',
    });
    expect(r.status).toBe('LATE');
  });

  it('a later scan the same day → silently ignored, no check-out recorded (disabled for now)', async () => {
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:00.000Z'),
      method: 'CARD',
    });
    const out = await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T15:00:00.000Z'),
      method: 'CARD',
    });
    expect(out.action).toBe('noop');
    expect(out.checkOutAt).toBeUndefined();
    expect(out.checkInAt).toEqual(new Date('2026-09-03T07:30:00.000Z'));
  });

  it('a scan within a minute of check-in → no-op', async () => {
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:00.000Z'),
      method: 'CARD',
    });
    const dup = await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:30.000Z'),
      method: 'CARD',
    });
    expect(dup.action).toBe('noop');
  });
});
