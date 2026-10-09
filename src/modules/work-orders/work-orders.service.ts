import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  type FieldError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/domain-errors.js';
import { type Page, toSkipTake } from '../../common/http/pagination.js';
import { violatedForeignKey } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto.js';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import type { WorkOrderDto } from './dto/work-order.dto.js';
import { evaluateTransition } from './work-order-transitions.js';
import type { WorkOrderStatus } from './work-order.enums.js';
import { toWorkOrderDto, workOrderSelect } from './work-order.mapper.js';

/** What to tell the client when a write points at an event or a user that does not exist. */
const UNKNOWN_REFERENCES: Partial<Record<string, FieldError>> = {
  work_orders_event_id_fkey: { field: 'eventId', message: 'This event does not exist.' },
  work_orders_assignee_id_fkey: { field: 'assigneeId', message: 'This user does not exist.' },
};

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListWorkOrdersQueryDto, viewer: AuthUser): Promise<Page<WorkOrderDto>> {
    const where: Prisma.WorkOrderWhereInput = {
      status: query.status,
      assigneeId: query.assigneeId,
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        select: workOrderSelect,
        orderBy: { seq: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      items: rows.map((row) => toWorkOrderDto(row, viewer)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string, viewer: AuthUser): Promise<WorkOrderDto> {
    const row = await this.prisma.workOrder.findUnique({ where: { id }, select: workOrderSelect });
    if (!row) throw new NotFoundError('Work order');
    return toWorkOrderDto(row, viewer);
  }

  async create(dto: CreateWorkOrderDto, creator: AuthUser): Promise<WorkOrderDto> {
    const { id } = await this.rejectingUnknownReferences(() =>
      this.prisma.workOrder.create({
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          eventId: dto.eventId,
          assigneeId: dto.assigneeId,
          createdById: creator.id,
        },
        select: { id: true },
      }),
    );
    return this.get(id, creator);
  }

  /** Details stay editable in every status, including DONE and CANCELLED: only the status is final. */
  async update(id: string, dto: UpdateWorkOrderDto, viewer: AuthUser): Promise<WorkOrderDto> {
    const { count } = await this.rejectingUnknownReferences(() =>
      this.prisma.workOrder.updateMany({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          assigneeId: dto.assigneeId,
        },
      }),
    );
    if (count === 0) throw new NotFoundError('Work order');
    return this.get(id, viewer);
  }

  async transition(id: string, to: WorkOrderStatus, actor: AuthUser): Promise<WorkOrderDto> {
    const current = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { status: true, assigneeId: true },
    });
    if (!current) throw new NotFoundError('Work order');

    const verdict = evaluateTransition(current.status, to, {
      role: actor.role,
      isAssignee: current.assigneeId === actor.id,
    });
    if (verdict === 'INVALID') {
      throw new InvalidTransitionError(`A work order cannot move from ${current.status} to ${to}.`);
    }
    if (verdict === 'FORBIDDEN') {
      throw new ForbiddenError(`You are not allowed to move this work order to ${to}.`);
    }

    // The verdict rests on the status and the assignee that were just read, and both can
    // change before the write. The update applies only if they still hold: of two concurrent
    // transitions one wins, and a move cannot slip through after the work order was reassigned.
    const { count } = await this.prisma.workOrder.updateMany({
      where: { id, status: current.status, assigneeId: current.assigneeId },
      data: { status: to },
    });
    if (count === 0) {
      throw new InvalidTransitionError(
        'The work order was changed by someone else in the meantime. Reload it and try again.',
      );
    }
    return this.get(id, actor);
  }

  /**
   * The foreign keys are the existence check. Reading first would leave a gap in which the
   * event or the user can disappear, and the write would then fail as an unexplained error.
   */
  private async rejectingUnknownReferences<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      const unknownReference = UNKNOWN_REFERENCES[violatedForeignKey(error) ?? ''];
      if (!unknownReference) throw error;
      throw new ValidationFailedError([unknownReference]);
    }
  }
}
