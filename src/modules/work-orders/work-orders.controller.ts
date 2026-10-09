import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { IdParamDto } from '../../common/http/id-param.dto.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto.js';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto.js';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import { WorkOrderDto } from './dto/work-order.dto.js';
import { WorkOrdersService } from './work-orders.service.js';

@ApiTags('work-orders')
@ApiProtected()
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'List work orders, newest first' })
  @ApiPageResponse(WorkOrderDto)
  @ApiProblem('VALIDATION_FAILED')
  list(
    @Query() query: ListWorkOrdersQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Page<WorkOrderDto>> {
    return this.workOrders.list(query, user);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get one work order' })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiProblem('VALIDATION_FAILED', 'NOT_FOUND')
  get(@Param() { id }: IdParamDto, @CurrentUser() user: AuthUser): Promise<WorkOrderDto> {
    return this.workOrders.get(id, user);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a work order' })
  @ApiCreatedResponse({ type: WorkOrderDto })
  @ApiProblem('VALIDATION_FAILED')
  create(@Body() dto: CreateWorkOrderDto, @CurrentUser() user: AuthUser): Promise<WorkOrderDto> {
    return this.workOrders.create(dto, user);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Edit a work order, or reassign it (assigneeId: null unassigns)' })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiProblem('VALIDATION_FAILED', 'NOT_FOUND')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<WorkOrderDto> {
    return this.workOrders.update(id, dto, user);
  }

  @Post(':id/transitions')
  @Roles('ADMIN', 'STAFF')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a work order to another status' })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiProblem('VALIDATION_FAILED', 'NOT_FOUND', 'INVALID_TRANSITION')
  transition(
    @Param() { id }: IdParamDto,
    @Body() dto: TransitionWorkOrderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<WorkOrderDto> {
    return this.workOrders.transition(id, dto.to, user);
  }
}
