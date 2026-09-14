import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { AttendanceMarkedEvent } from '../domain-events/events';
import { SchoolEntryService } from './school-entry.service';

describe('SchoolEntryService.recordScan', () => {
  let service: SchoolEntryService;
  let entryStore: any;
  let studentRecord: any;
  let events: { emit: jest.Mock };

  const makePrisma = () => ({
    student: { findFirst: jest.fn().mockImplementation(() => Promise.resolve(studentRecord)) },
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
    studentRecord = { id: 'stu1' };
    events = { emit: jest.fn() };
    const prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SchoolEntryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { del: jest.fn(), delByPattern: jest.fn() } },
        { provide: DomainEventsService, useValue: events },
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

  it('notifies the parent on a PRESENT (on-time) check-in, with a formatted time', async () => {
    studentRecord = {
      id: 'stu1',
      firstName: 'Ada',
      lastName: 'Lit',
      parents: [{ parent: { userId: 'parent-1' } }],
    };
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:00.000Z'), // before the 08:00 start time
      method: 'CARD',
    });
    expect(events.emit).toHaveBeenCalledTimes(1);
    const emitted = events.emit.mock.calls[0][0] as AttendanceMarkedEvent;
    expect(emitted).toBeInstanceOf(AttendanceMarkedEvent);
    expect(emitted.status).toBe('PRESENT');
    expect(emitted.studentName).toBe('Ada Lit');
    expect(emitted.parentUserIds).toEqual(['parent-1']);
    expect(emitted.checkInTimeLabel).toBe('7:30 AM');
  });

  it('notifies the parent on a LATE check-in too — any check-in means "entered school"', async () => {
    studentRecord = {
      id: 'stu1',
      firstName: 'Ada',
      lastName: 'Lit',
      parents: [{ parent: { userId: 'parent-1' } }],
    };
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T09:15:00.000Z'), // after the 08:00 start time
      method: 'CARD',
    });
    const emitted = events.emit.mock.calls[0][0] as AttendanceMarkedEvent;
    expect(emitted.status).toBe('LATE');
    expect(emitted.checkInTimeLabel).toBe('9:15 AM');
  });

  it('does not notify on the second (ignored) tap the same day', async () => {
    studentRecord = {
      id: 'stu1',
      firstName: 'Ada',
      lastName: 'Lit',
      parents: [{ parent: { userId: 'parent-1' } }],
    };
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:00.000Z'),
      method: 'CARD',
    });
    events.emit.mockClear();
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T15:00:00.000Z'),
      method: 'CARD',
    });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not notify when the student has no linked parent', async () => {
    studentRecord = { id: 'stu1', firstName: 'Ada', lastName: 'Lit', parents: [] };
    await service.recordScan({
      tenantId: 't1',
      studentId: 'stu1',
      at: new Date('2026-09-03T07:30:00.000Z'),
      method: 'CARD',
    });
    expect(events.emit).not.toHaveBeenCalled();
  });
});
