import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { AttendanceMarkedEvent } from '../domain-events/events';
import {
  AttendanceMethod,
  AttendanceStatus,
} from '../../prisma/generated/client';
import {
  AttendanceSettings,
  getLocalDateParts,
  parseTimeToMinutes,
  resolveAttendanceStartTime,
} from '../attendance/attendance-day';

interface RecordScanInput {
  tenantId: string;
  studentId: string;
  at: Date;
  method: AttendanceMethod;
  location?: string;
  deviceId?: string;
  /**
   * Gate side this scan came from. `IN` never checks a student out (a repeat
   * scan is a no-op); `OUT` checks out an open row; `BIDIRECTIONAL` (default)
   * uses the first-scan / later-scan heuristic.
   */
  direction?: 'IN' | 'OUT' | 'BIDIRECTIONAL';
}

interface ManualEntryInput {
  tenantId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkInAt?: string;
  checkOutAt?: string;
  remarks?: string;
  recordedBy?: string;
}

@Injectable()
export class SchoolEntryService {
  private readonly logger = new Logger(SchoolEntryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly cache: CacheService,
  ) {}

  private normalizeSettings(settings: unknown): AttendanceSettings {
    return settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as AttendanceSettings)
      : {};
  }

  /** Midnight-UTC Date representing the tenant-local calendar day of `at`. */
  private localDay(at: Date, timezone: string): Date {
    const p = getLocalDateParts(at, timezone);
    return new Date(Date.UTC(p.year, p.month - 1, p.day));
  }

  private async invalidateCaches(tenantId: string) {
    await Promise.all([
      this.cache.delByPattern(`attendance:stats:${tenantId}:*`),
      this.cache.delByPattern(`school-entry:stats:${tenantId}:*`),
      this.cache.del(`dashboard:stats:${tenantId}`),
    ]);
  }

  private async parentContactFor(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        firstName: true,
        lastName: true,
        parents: {
          select: { parent: { select: { userId: true } } },
        },
      },
    });
    if (!student) return null;
    const parentUserIds = (student.parents ?? [])
      .map((p) => p.parent?.userId)
      .filter((id): id is string => !!id);
    if (parentUserIds.length === 0) return null;
    return {
      name: `${student.firstName} ${student.lastName}`.trim(),
      parentUserIds,
    };
  }

  /** Manual/staff attendance entry — only worth alerting a parent about an
   * ABSENT or LATE mark, never a plain PRESENT (that's not news). */
  private async emitLateOrAbsent(
    tenantId: string,
    studentId: string,
    status: AttendanceStatus,
    date: Date,
  ) {
    if (status !== 'ABSENT' && status !== 'LATE') return;
    const contact = await this.parentContactFor(tenantId, studentId);
    if (!contact) return;
    this.events.emit(
      new AttendanceMarkedEvent(
        tenantId,
        studentId,
        contact.name,
        status,
        date,
        contact.parentUserIds,
      ),
    );
  }

  /** A live gate/device check-in — notify the parent their child has
   * entered school, regardless of status (PRESENT or LATE both mean "is on
   * campus now"). Never fires for check-out — that's disabled entirely. */
  private async emitCheckIn(
    tenantId: string,
    studentId: string,
    status: AttendanceStatus,
    date: Date,
    checkInTimeLabel: string,
  ) {
    const contact = await this.parentContactFor(tenantId, studentId);
    if (!contact) return;
    this.events.emit(
      new AttendanceMarkedEvent(
        tenantId,
        studentId,
        contact.name,
        status,
        date,
        contact.parentUserIds,
        checkInTimeLabel,
      ),
    );
  }

  /**
   * A gate/device scan. First scan of the tenant-local day → check-in (+ status).
   * A later scan on an existing open row → check-out. Never overwrites check-in.
   */
  async recordScan(input: RecordScanInput) {
    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { timezone: true, settings: true },
    });
    const timezone = tenant?.timezone || 'UTC';
    const settings = this.normalizeSettings(tenant?.settings);
    const day = this.localDay(input.at, timezone);

    const existing = await this.prisma.schoolEntry.findUnique({
      where: {
        tenantId_studentId_date: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          date: day,
        },
      },
    });

    if (!existing) {
      const local = getLocalDateParts(input.at, timezone);
      const startMinutes = parseTimeToMinutes(
        resolveAttendanceStartTime(settings),
      );
      const isLate =
        startMinutes !== null &&
        local.hour * 60 + local.minute > startMinutes;
      const status: AttendanceStatus = isLate ? 'LATE' : 'PRESENT';

      const created = await this.prisma.schoolEntry.create({
        data: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          date: day,
          status,
          checkInAt: input.at,
          checkInMethod: input.method,
          checkInLocation: input.location ?? null,
          deviceId: input.deviceId ?? null,
          remarks: `Auto ${input.method.toLowerCase()} check-in${
            input.location ? ` at ${input.location}` : ''
          }`,
        },
      });
      const hour12 = ((local.hour + 11) % 12) + 1;
      const ampm = local.hour < 12 ? 'AM' : 'PM';
      const checkInTimeLabel = `${hour12}:${String(local.minute).padStart(2, '0')} ${ampm}`;
      await this.emitCheckIn(
        input.tenantId,
        input.studentId,
        status,
        day,
        checkInTimeLabel,
      );
      await this.invalidateCaches(input.tenantId);
      return { ...created, action: 'check-in' as const };
    }

    // Check-out is disabled for now — a student's first tap of the day is
    // the whole entry, every later tap is a silent no-op regardless of
    // direction. Previous check-in/check-out state machine is in git
    // history if this needs to come back.
    return { ...existing, action: 'noop' as const };
  }

  /** Resolve a card number to its student, then record a scan. */
  async recordScanByCard(input: {
    tenantId: string;
    cardNumber: string;
    at: Date;
    method: AttendanceMethod;
    location?: string;
    deviceId?: string;
  }) {
    const card = await this.prisma.card.findFirst({
      where: {
        cardNumber: input.cardNumber,
        tenantId: input.tenantId,
        status: 'ACTIVE',
      },
      select: { id: true, studentId: true },
    });
    if (!card?.studentId) {
      throw new NotFoundException('Card not found, inactive, or not a student card');
    }
    const result = await this.recordScan({
      tenantId: input.tenantId,
      studentId: card.studentId,
      at: input.at,
      method: input.method,
      location: input.location,
      deviceId: input.deviceId,
    });
    await this.prisma.cardLog
      .create({
        data: {
          tenantId: input.tenantId,
          cardId: card.id,
          action: 'SCANNED',
          location: input.location || 'entrance',
          description: `School ${result.action} — ${result.status}`,
        },
      })
      .catch(() => undefined);
    return result;
  }

  /** Admin/staff manual entry or override for a given day. */
  async manualUpsert(input: ManualEntryInput) {
    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const day = new Date(`${input.date.slice(0, 10)}T00:00:00.000Z`);
    const existing = await this.prisma.schoolEntry.findUnique({
      where: {
        tenantId_studentId_date: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          date: day,
        },
      },
    });

    const data = {
      status: input.status,
      checkInAt: input.checkInAt ? new Date(input.checkInAt) : undefined,
      checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : undefined,
      checkInMethod: AttendanceMethod.MANUAL,
      recordedBy: input.recordedBy ?? null,
      remarks: input.remarks
        ? `Manual: ${input.remarks}`
        : 'Manual entry',
    };

    const row = existing
      ? await this.prisma.schoolEntry.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.schoolEntry.create({
          data: {
            tenantId: input.tenantId,
            studentId: input.studentId,
            date: day,
            ...data,
          },
        });

    const statusChanged = !existing || existing.status !== input.status;
    if (statusChanged) {
      await this.emitLateOrAbsent(
        input.tenantId,
        input.studentId,
        input.status,
        day,
      );
    }
    await this.invalidateCaches(input.tenantId);
    return row;
  }

  /** Bulk manual entry / override (staff marking a classroom for a day). */
  async manualUpsertBulk(input: {
    tenantId: string;
    date: string;
    recordedBy?: string;
    records: Array<{
      studentId: string;
      status: AttendanceStatus;
      remarks?: string;
    }>;
  }) {
    const results: { success: number; failed: number } = {
      success: 0,
      failed: 0,
    };
    for (const r of input.records) {
      try {
        await this.manualUpsert({
          tenantId: input.tenantId,
          studentId: r.studentId,
          date: input.date,
          status: r.status,
          remarks: r.remarks,
          recordedBy: input.recordedBy,
        });
        results.success += 1;
      } catch {
        results.failed += 1;
      }
    }
    return results;
  }

  /** Roster for a day: every student in scope + their entry (if any). */
  async getDayRoster(params: {
    tenantId: string;
    date: string;
    sectionId?: string;
    gradeId?: string;
  }) {
    const day = new Date(`${params.date.slice(0, 10)}T00:00:00.000Z`);
    const students = await this.prisma.student.findMany({
      where: {
        tenantId: params.tenantId,
        ...(params.sectionId ? { sectionId: params.sectionId } : {}),
        ...(params.gradeId ? { gradeId: params.gradeId } : {}),
      },
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        gender: true,
        section: { select: { id: true, name: true } },
        grade: { select: { id: true, name: true, code: true } },
        schoolEntries: {
          where: { date: day },
          take: 1,
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return students.map((s) => ({
      studentId: s.id,
      displayId: s.studentId,
      name: `${s.firstName} ${s.lastName}`.trim(),
      gender: s.gender,
      section: s.section,
      grade: s.grade,
      entry: s.schoolEntries[0] ?? null,
    }));
  }

  async getForStudent(tenantId: string, studentId: string, limit = 60) {
    return this.prisma.schoolEntry.findMany({
      where: { tenantId, studentId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async list(params: {
    tenantId: string;
    from?: string;
    to?: string;
    status?: AttendanceStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    const where = {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from
                ? { gte: new Date(`${params.from.slice(0, 10)}T00:00:00.000Z`) }
                : {}),
              ...(params.to
                ? { lte: new Date(`${params.to.slice(0, 10)}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.schoolEntry.findMany({
        where,
        orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              studentId: true,
              section: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.schoolEntry.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
