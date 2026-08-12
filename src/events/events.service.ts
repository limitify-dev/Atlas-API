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
