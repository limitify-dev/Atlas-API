import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { SchoolEventCreatedEvent } from '../domain-events/events';
import { Role } from '../../prisma/generated/client';
import { CreateEventDto, EventFiltersDto, UpdateEventDto } from './dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(tenantId: string, dto: CreateEventDto) {
    const event = await this.prisma.event.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        eventDate: new Date(dto.eventDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        time: dto.time,
        location: dto.location,
        organizer: dto.organizer,
        category: dto.category ?? 'Academic',
        gradeTarget: dto.gradeTarget,
        audience: dto.audience ?? 'ALL',
        thumbnailUrl: dto.thumbnailUrl,
      },
    });

    // Notify the audience (push + in-app) — best effort, never blocks creation.
    try {
      const recipientUserIds = await this.resolveAudienceUserIds(
        tenantId,
        event.audience,
      );
      if (recipientUserIds.length > 0) {
        this.events.emit(
          new SchoolEventCreatedEvent(
            tenantId,
            event.id,
            event.title,
            event.category,
            event.eventDate.toISOString(),
            event.location ?? null,
            recipientUserIds,
          ),
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to dispatch notifications for event ${event.id}: ${
          (err as Error).message
        }`,
      );
    }

    return event;
  }

  /**
   * Maps an event's `audience` string to the userIds that should be notified.
   * Students have no user accounts, so a STUDENTS audience notifies parents.
   */
  private async resolveAudienceUserIds(
    tenantId: string,
    audience: string,
  ): Promise<string[]> {
    const where: {
      tenantId: string;
      role?: { in: Role[] };
    } = { tenantId };

    switch (audience) {
      case 'PARENTS':
      case 'STUDENTS':
        where.role = { in: [Role.PARENT] };
        break;
      case 'STAFF':
        where.role = { in: [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER, Role.STAFF] };
        break;
      case 'ALL':
      default:
        break;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  findAll(tenantId: string, filters: EventFiltersDto) {
    return this.prisma.event.findMany({
      where: {
        tenantId,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.from || filters.to
          ? {
              eventDate: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { eventDate: 'asc' },
    });
  }

  findUpcoming(tenantId: string, limit = 10) {
    return this.prisma.event.findMany({
      where: { tenantId, eventDate: { gte: new Date() } },
      orderBy: { eventDate: 'asc' },
      take: limit,
    });
  }

  async findOne(tenantId: string, id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, tenantId },
    });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }

  async update(tenantId: string, id: string, dto: UpdateEventDto) {
    await this.findOne(tenantId, id);
    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.eventDate !== undefined ? { eventDate: new Date(dto.eventDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.time !== undefined ? { time: dto.time } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.organizer !== undefined ? { organizer: dto.organizer } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.gradeTarget !== undefined ? { gradeTarget: dto.gradeTarget } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.thumbnailUrl !== undefined ? { thumbnailUrl: dto.thumbnailUrl } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.event.delete({ where: { id } });
    return { id, deleted: true };
  }
}
