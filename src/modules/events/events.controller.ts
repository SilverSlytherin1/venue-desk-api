import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { IdParamDto } from '../../common/http/id-param.dto.js';
import { ApiPageResponse, type Page, PageQueryDto } from '../../common/http/pagination.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventDto } from './dto/event.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List events, soonest first' })
  @ApiPageResponse(EventDto)
  @ApiProblem('VALIDATION_FAILED')
  list(@Query() query: PageQueryDto): Promise<Page<EventDto>> {
    return this.events.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get one event with its live seat count' })
  @ApiOkResponse({ type: EventDto })
  @ApiProblem('VALIDATION_FAILED', 'NOT_FOUND')
  get(@Param() { id }: IdParamDto): Promise<EventDto> {
    return this.events.get(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiProtected()
  @ApiOperation({ summary: 'Create an event' })
  @ApiCreatedResponse({ type: EventDto })
  @ApiProblem('VALIDATION_FAILED')
  create(@Body() dto: CreateEventDto): Promise<EventDto> {
    return this.events.create(dto);
  }
}
