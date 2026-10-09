import type { AuthUser } from '../../common/auth/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { WorkOrderDto } from './dto/work-order.dto.js';
import { allowedTransitions } from './work-order-transitions.js';

export const workOrderSelect = {
  id: true,
  seq: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  event: { select: { id: true, title: true } },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.WorkOrderSelect;

type WorkOrderRow = Prisma.WorkOrderGetPayload<{ select: typeof workOrderSelect }>;

/** The viewer is part of the mapping because `allowedTransitions` differs per user. */
export function toWorkOrderDto(row: WorkOrderRow, viewer: AuthUser): WorkOrderDto {
  return {
    id: row.id,
    number: `WO-${String(row.seq).padStart(4, '0')}`,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    event: row.event,
    assignee: row.assignee,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    allowedTransitions: allowedTransitions(row.status, {
      role: viewer.role,
      isAssignee: row.assignee?.id === viewer.id,
    }),
  };
}
