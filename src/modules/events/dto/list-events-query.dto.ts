import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination.js';

export const EVENT_WHEN = ['upcoming', 'past'] as const;
export type EventWhen = (typeof EVENT_WHEN)[number];

export class ListEventsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: EVENT_WHEN,
    default: 'upcoming',
    description: 'upcoming: not started yet, soonest first. past: already started, latest first.',
  })
  @IsIn(EVENT_WHEN)
  when: EventWhen = 'upcoming';
}
