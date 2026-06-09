import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AcademicWindowStatus,
  AcademicWindowType,
  Prisma,
} from '../../../prisma/generated/client';
import {
  AcademicTimelineFiltersDto,
  CreateAcademicTimelineDto,
  UpdateAcademicTimelineDto,
} from './dto';

@Injectable()
export class AcademicTimelinesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── WRITE ───────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    dto: CreateAcademicTimelineDto,
    createdBy: string,
  ) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end <= start) {
      throw new BadRequestException('endDate must be after startDate.');
    }

    await this.checkOverlap(
      tenantId,
      dto.type,
      start,
      end,
      dto.academicYear,
      dto.term,
    );

    return this.prisma.academicTimeline.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        academicYear: dto.academicYear,
        term: dto.term ?? null,
        startDate: start,
        endDate: end,
        description: dto.description ?? null,
        gradeIds: dto.gradeIds
          ? JSON.parse(JSON.stringify(dto.gradeIds))
          : Prisma.DbNull,
        createdBy,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAcademicTimelineDto) {
    const existing = await this.findOne(tenantId, id);

    if (existing.status === AcademicWindowStatus.CLOSED) {
      throw new ConflictException('Closed windows cannot be edited.');
    }
    if (existing.status === AcademicWindowStatus.CANCELLED) {
      throw new ConflictException('Cancelled windows cannot be edited.');
    }

    const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    if (end <= start) {
      throw new BadRequestException('endDate must be after startDate.');
    }

    // Re-check overlap only if dates, type, year, or term changed
    const datesChanged = dto.startDate || dto.endDate;
    const scopeChanged = dto.type || dto.academicYear || dto.term !== undefined;

    if (datesChanged || scopeChanged) {
      await this.checkOverlap(
        tenantId,
        dto.type ?? existing.type,
        start,
        end,
        dto.academicYear ?? existing.academicYear,
        dto.term !== undefined ? dto.term : existing.term,
        id,
      );
    }

    return this.prisma.academicTimeline.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        academicYear: dto.academicYear,
        term: dto.term,
        startDate: dto.startDate ? start : undefined,
        endDate: dto.endDate ? end : undefined,
        description: dto.description,
        gradeIds: dto.gradeIds ?? undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const timeline = await this.findOne(tenantId, id);

    if (timeline.status === AcademicWindowStatus.ACTIVE) {
      throw new ConflictException(
        'An active window cannot be deleted. Close or cancel it first.',
      );
    }

    return this.prisma.academicTimeline.delete({ where: { id } });
  }

  // ─── STATUS TRANSITIONS ───────────────────────────────────────────────────────

  async activate(tenantId: string, id: string) {
    const timeline = await this.findOne(tenantId, id);

    if (timeline.status !== AcademicWindowStatus.DRAFT) {
      throw new ConflictException(
        `Only DRAFT windows can be activated. Current status: ${timeline.status}.`,
      );
    }

    return this.prisma.academicTimeline.update({
      where: { id },
      data: { status: AcademicWindowStatus.ACTIVE },
    });
  }

  async close(tenantId: string, id: string) {
    const timeline = await this.findOne(tenantId, id);

    if (timeline.status !== AcademicWindowStatus.ACTIVE) {
      throw new ConflictException(
        `Only ACTIVE windows can be closed. Current status: ${timeline.status}.`,
      );
    }

    return this.prisma.academicTimeline.update({
      where: { id },
      data: { status: AcademicWindowStatus.CLOSED },
    });
  }

  async cancel(tenantId: string, id: string) {
    const timeline = await this.findOne(tenantId, id);

    if (timeline.status === AcademicWindowStatus.CLOSED) {
      throw new ConflictException('Closed windows cannot be cancelled.');
    }

    return this.prisma.academicTimeline.update({
      where: { id },
      data: { status: AcademicWindowStatus.CANCELLED },
    });
  }

  // ─── READ ─────────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, filters: AcademicTimelineFiltersDto) {
    const where: any = { tenantId };

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.academicYear) where.academicYear = filters.academicYear;
    if (filters.term) where.term = filters.term;

    if (filters.currentOnly) {
      const now = new Date();
      where.startDate = { lte: now };
      where.endDate = { gte: now };
    }

    return this.prisma.academicTimeline.findMany({
      where,
      orderBy: [{ academicYear: 'desc' }, { startDate: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const timeline = await this.prisma.academicTimeline.findFirst({
      where: { id, tenantId },
    });
    if (!timeline)
      throw new NotFoundException('Academic timeline window not found.');
    return timeline;
  }

  /** Returns all distinct academic years that have at least one window configured. */
  async getAcademicYears(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.academicTimeline.findMany({
      where: { tenantId },
      select: { academicYear: true },
      distinct: ['academicYear'],
      orderBy: { academicYear: 'desc' },
    });
    return rows.map((r) => r.academicYear);
  }

  /**
   * Returns an at-a-glance map of which window types are currently open.
   * Used by the app dashboard and by other services (grade submission, etc.)
   *
   * Example response:
   * {
   *   GRADE_SUBMISSION: { id, name, endDate },
   *   EXAM: { id, name, endDate },
   *   REPORT_PUBLICATION: null,
   *   ...
   * }
   */
  async getCurrentStatus(tenantId: string) {
    const now = new Date();

    const open = await this.prisma.academicTimeline.findMany({
      where: {
        tenantId,
        status: AcademicWindowStatus.ACTIVE,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: {
        id: true,
        name: true,
        type: true,
        endDate: true,
        term: true,
        academicYear: true,
      },
    });

    // Build a map keyed by window type — most recently started wins if multiple overlap
    const map: Partial<Record<AcademicWindowType, (typeof open)[0] | null>> =
      {};

    for (const type of Object.values(AcademicWindowType)) {
      map[type] = null;
    }
    for (const window of open) {
      map[window.type] = window;
    }

    return map;
  }

  /**
   * Utility used by other services to gate operations behind open windows.
   *
   * Example: academicTimelinesService.isWindowOpen(tenantId, AcademicWindowType.GRADE_SUBMISSION)
   */
  async isWindowOpen(
    tenantId: string,
    type: AcademicWindowType,
  ): Promise<boolean> {
    const now = new Date();
    const count = await this.prisma.academicTimeline.count({
      where: {
        tenantId,
        type,
        status: AcademicWindowStatus.ACTIVE,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    return count > 0;
  }

  // ─── PRIVATE ──────────────────────────────────────────────────────────────────

  /**
   * Warns if another non-cancelled window of the same type + academic year + term
   * overlaps the proposed date range. Active/Draft windows both count.
   * excludeId — skip this record when updating an existing window.
   */
  private async checkOverlap(
    tenantId: string,
    type: AcademicWindowType,
    start: Date,
    end: Date,
    academicYear: string,
    term: string | null | undefined,
    excludeId?: string,
  ) {
    const where: any = {
      tenantId,
      type,
      academicYear,
      status: { in: [AcademicWindowStatus.DRAFT, AcademicWindowStatus.ACTIVE] },
      // Date overlap: existing.start < new.end AND existing.end > new.start
      startDate: { lt: end },
      endDate: { gt: start },
    };

    if (term) where.term = term;
    if (excludeId) where.id = { not: excludeId };

    const conflict = await this.prisma.academicTimeline.findFirst({
      where,
      select: { id: true, name: true, startDate: true, endDate: true },
    });

    if (conflict) {
      throw new ConflictException(
        `This window overlaps with "${conflict.name}" (${conflict.startDate.toISOString().slice(0, 10)} – ${conflict.endDate.toISOString().slice(0, 10)}). ` +
          `Adjust the dates or cancel the conflicting window first.`,
      );
    }
  }
}
