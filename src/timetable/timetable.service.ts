import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkSetPeriodsDto,
  CreateEntryDto,
  CreatePeriodDto,
  EntryFiltersDto,
  UpdateEntryDto,
  UpdatePeriodDto,
} from './dto';

const ENTRY_INCLUDE = {
  period: true,
  section: {
    select: {
      id: true,
      name: true,
      gradeId: true,
      grade: { select: { id: true, name: true, code: true } },
    },
  },
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class TimetableService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Periods ────────────────────────────────────────────────────────────────

  listPeriods(tenantId: string) {
    return this.prisma.timetablePeriod.findMany({
      where: { tenantId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  private ensureTimeOrder(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }
  }

  async createPeriod(tenantId: string, dto: CreatePeriodDto) {
    this.ensureTimeOrder(dto.startTime, dto.endTime);
    const clash = await this.prisma.timetablePeriod.findFirst({
      where: { tenantId, orderIndex: dto.orderIndex },
    });
    if (clash) {
      throw new ConflictException(
        `A period with order ${dto.orderIndex} already exists.`,
      );
    }
    return this.prisma.timetablePeriod.create({
      data: { tenantId, ...dto },
    });
  }

  async updatePeriod(tenantId: string, id: string, dto: UpdatePeriodDto) {
    const period = await this.prisma.timetablePeriod.findFirst({
      where: { id, tenantId },
    });
    if (!period) throw new NotFoundException('Period not found.');

    const startTime = dto.startTime ?? period.startTime;
    const endTime = dto.endTime ?? period.endTime;
    this.ensureTimeOrder(startTime, endTime);

    if (dto.orderIndex !== undefined && dto.orderIndex !== period.orderIndex) {
      const clash = await this.prisma.timetablePeriod.findFirst({
        where: { tenantId, orderIndex: dto.orderIndex, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException(
          `A period with order ${dto.orderIndex} already exists.`,
        );
      }
    }

    return this.prisma.timetablePeriod.update({ where: { id }, data: dto });
  }

  async removePeriod(tenantId: string, id: string) {
    const period = await this.prisma.timetablePeriod.findFirst({
      where: { id, tenantId },
    });
    if (!period) throw new NotFoundException('Period not found.');
    await this.prisma.timetablePeriod.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Replace the tenant's whole period set. Entries on removed periods cascade-delete. */
  async bulkSetPeriods(tenantId: string, dto: BulkSetPeriodsDto) {
    const orders = dto.periods.map((p) => p.orderIndex);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Period orderIndex values must be unique.');
    }
    dto.periods.forEach((p) => this.ensureTimeOrder(p.startTime, p.endTime));

    await this.prisma.$transaction([
      this.prisma.timetablePeriod.deleteMany({ where: { tenantId } }),
      this.prisma.timetablePeriod.createMany({
        data: dto.periods.map((p) => ({ tenantId, ...p })),
      }),
    ]);
    return this.listPeriods(tenantId);
  }

  // ─── Entries ────────────────────────────────────────────────────────────────

  listEntries(tenantId: string, filters: EntryFiltersDto) {
    return this.prisma.timetableEntry.findMany({
      where: {
        tenantId,
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
        ...(filters.dayOfWeek ? { dayOfWeek: filters.dayOfWeek } : {}),
      },
      include: ENTRY_INCLUDE,
      orderBy: [{ dayOfWeek: 'asc' }, { period: { orderIndex: 'asc' } }],
    });
  }

  async getMyTimetable(userId: string, tenantId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!teacher)
      throw new NotFoundException('No teacher profile for this account.');
    return this.listEntries(tenantId, { teacherId: teacher.id });
  }

  private async assertEntryRefs(
    tenantId: string,
    sectionId: string,
    periodId: string,
    subjectId?: string | null,
    teacherId?: string | null,
  ) {
    const [section, period] = await Promise.all([
      this.prisma.section.findFirst({ where: { id: sectionId, tenantId } }),
      this.prisma.timetablePeriod.findFirst({
        where: { id: periodId, tenantId },
      }),
    ]);
    if (!section) throw new NotFoundException('Classroom (section) not found.');
    if (!period) throw new NotFoundException('Period not found.');

    if (subjectId) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: subjectId, tenantId },
      });
      if (!subject) throw new NotFoundException('Subject not found.');
      if (subject.gradeId !== section.gradeId) {
        throw new BadRequestException(
          'Subject must belong to the same grade as the classroom.',
        );
      }
    }
    if (teacherId) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { id: teacherId, tenantId },
      });
      if (!teacher) throw new NotFoundException('Teacher not found.');
    }
  }

  /** Throws if the slot is already taken by this class, or the teacher is already booked. */
  private async assertNoCollision(
    tenantId: string,
    params: {
      sectionId: string;
      periodId: string;
      dayOfWeek: any;
      teacherId?: string | null;
      excludeEntryId?: string;
    },
  ) {
    const { sectionId, periodId, dayOfWeek, teacherId, excludeEntryId } =
      params;

    const classClash = await this.prisma.timetableEntry.findFirst({
      where: {
        tenantId,
        sectionId,
        periodId,
        dayOfWeek,
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
      include: { subject: { select: { name: true } } },
    });
    if (classClash) {
      throw new ConflictException(
        `This class already has ${classClash.subject?.name ?? 'a lesson'} scheduled in this slot.`,
      );
    }

    if (teacherId) {
      const teacherClash = await this.prisma.timetableEntry.findFirst({
        where: {
          tenantId,
          teacherId,
          periodId,
          dayOfWeek,
          ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
        },
        include: { section: { select: { name: true } } },
      });
      if (teacherClash) {
        throw new ConflictException(
          `This teacher is already booked for ${teacherClash.section?.name ?? 'another class'} in this slot.`,
        );
      }
    }
  }

  /**
   * Resolves the teacher for the given user and enforces that they may schedule
   * the section/subject (i.e. they are assigned to them). Returns the teacher id.
   */
  private async resolveTeacherScope(
    tenantId: string,
    userId: string,
    sectionId: string,
    subjectId?: string | null,
  ): Promise<string> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException('No teacher profile for this account.');
    }
    const classLink = await this.prisma.classTeacher.findFirst({
      where: { teacherId: teacher.id, sectionId },
    });
    if (!classLink) {
      throw new ForbiddenException(
        'You can only schedule classrooms you are assigned to.',
      );
    }
    if (subjectId) {
      const subjectLink = await this.prisma.subjectTeacher.findFirst({
        where: { teacherId: teacher.id, subjectId },
      });
      if (!subjectLink) {
        throw new ForbiddenException(
          'You can only schedule subjects you are assigned to.',
        );
      }
    }
    return teacher.id;
  }

  async createEntry(
    tenantId: string,
    dto: CreateEntryDto,
    restrictToUserId?: string,
  ) {
    if (restrictToUserId) {
      // Force the entry onto the requesting teacher and verify ownership
      dto.teacherId = await this.resolveTeacherScope(
        tenantId,
        restrictToUserId,
        dto.sectionId,
        dto.subjectId,
      );
    }

    await this.assertEntryRefs(
      tenantId,
      dto.sectionId,
      dto.periodId,
      dto.subjectId,
      dto.teacherId,
    );
    await this.assertNoCollision(tenantId, {
      sectionId: dto.sectionId,
      periodId: dto.periodId,
      dayOfWeek: dto.dayOfWeek,
      teacherId: dto.teacherId,
    });

    return this.prisma.timetableEntry.create({
      data: {
        tenantId,
        sectionId: dto.sectionId,
        periodId: dto.periodId,
        dayOfWeek: dto.dayOfWeek,
        subjectId: dto.subjectId || null,
        teacherId: dto.teacherId || null,
        room: dto.room || null,
      },
      include: ENTRY_INCLUDE,
    });
  }

  async updateEntry(
    tenantId: string,
    id: string,
    dto: UpdateEntryDto,
    restrictToUserId?: string,
  ) {
    const entry = await this.prisma.timetableEntry.findFirst({
      where: { id, tenantId },
    });
    if (!entry) throw new NotFoundException('Timetable entry not found.');

    const periodId = dto.periodId ?? entry.periodId;
    const dayOfWeek = dto.dayOfWeek ?? entry.dayOfWeek;
    const subjectId =
      dto.subjectId === undefined ? entry.subjectId : dto.subjectId;
    let teacherId =
      dto.teacherId === undefined ? entry.teacherId : dto.teacherId;

    if (restrictToUserId) {
      // A teacher may only edit their own lessons, and stays the teacher
      const myTeacherId = await this.resolveTeacherScope(
        tenantId,
        restrictToUserId,
        entry.sectionId,
        subjectId,
      );
      if (entry.teacherId && entry.teacherId !== myTeacherId) {
        throw new ForbiddenException('You can only edit your own lessons.');
      }
      teacherId = myTeacherId;
    }

    await this.assertEntryRefs(
      tenantId,
      entry.sectionId,
      periodId,
      subjectId,
      teacherId,
    );
    await this.assertNoCollision(tenantId, {
      sectionId: entry.sectionId,
      periodId,
      dayOfWeek,
      teacherId,
      excludeEntryId: id,
    });

    return this.prisma.timetableEntry.update({
      where: { id },
      data: {
        periodId,
        dayOfWeek,
        subjectId: subjectId || null,
        teacherId: teacherId || null,
        room: dto.room === undefined ? entry.room : dto.room || null,
      },
      include: ENTRY_INCLUDE,
    });
  }

  async removeEntry(tenantId: string, id: string, restrictToUserId?: string) {
    const entry = await this.prisma.timetableEntry.findFirst({
      where: { id, tenantId },
    });
    if (!entry) throw new NotFoundException('Timetable entry not found.');

    if (restrictToUserId) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { userId: restrictToUserId, tenantId },
        select: { id: true },
      });
      if (!teacher || entry.teacherId !== teacher.id) {
        throw new ForbiddenException('You can only delete your own lessons.');
      }
    }

    await this.prisma.timetableEntry.delete({ where: { id } });
    return { id, deleted: true };
  }
}
