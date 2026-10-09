import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationFailedError } from '../../common/errors/domain-errors.js';
import { type Page, type PageQueryDto, toSkipTake } from '../../common/http/pagination.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateEventDto } from './dto/create-event.dto.js';
import type { EventDto } from './dto/event.dto.js';
import { eventSelect, toEventDto } from './event.mapper.js';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto): Promise<Page<EventDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        select: eventSelect,
        // The id breaks ties so that pages stay stable when two events start together.
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.event.count(),
    ]);
    return { items: rows.map(toEventDto), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<EventDto> {
    const row = await this.prisma.event.findUnique({ where: { id }, select: eventSelect });
    if (!row) throw new NotFoundError('Event');
    return toEventDto(row);
  }

  async create(dto: CreateEventDto): Promise<EventDto> {
    const startsAt = new Date(dto.startsAt);
    if (startsAt <= new Date()) {
      throw new ValidationFailedError([
        { field: 'startsAt', message: 'Start time must be in the future.' },
      ]);
    }

    const row = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        startsAt,
        capacity: dto.capacity,
      },
      select: eventSelect,
    });
    return toEventDto(row);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.event.count({ where: { id } })) > 0;
  }
}
