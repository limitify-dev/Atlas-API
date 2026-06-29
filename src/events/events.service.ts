import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, EventFiltersDto, UpdateEventDto } from './dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        eventDate: new Date(dto.eventDate),
        location: dto.location,
        organizer: dto.organizer,
      },
    });
  }

  findAll(tenantId: string, filters: EventFiltersDto) {
    return this.prisma.event.findMany({
      where: {
        tenantId,
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

  /** Upcoming events from now, limited. */
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
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.eventDate !== undefined
          ? { eventDate: new Date(dto.eventDate) }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.organizer !== undefined ? { organizer: dto.organizer } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.event.delete({ where: { id } });
    return { id, deleted: true };
  }
}
