import type { Role } from '../../common/auth/role.js';
import type { WorkOrderStatus } from './work-order.enums.js';

/** Who is asking, reduced to the two facts the workflow depends on. */
export interface Actor {
  role: Role;
  isAssignee: boolean;
}

interface Move {
  to: WorkOrderStatus;
  allowedTo: (actor: Actor) => boolean;
}

const adminOnly: Move['allowedTo'] = (actor) => actor.role === 'ADMIN';
const adminOrAssignee: Move['allowedTo'] = (actor) => actor.role === 'ADMIN' || actor.isAssignee;

/**
 * The whole workflow: from each status, the moves that exist and who may make them.
 * A move that is missing here is not a transition at all. DONE and CANCELLED are terminal.
 *
 * The order of each list is deliberate, and it is the order clients receive in
 * `allowedTransitions`: the step forward first, then the step back, then cancelling.
 */
const TRANSITIONS: Record<WorkOrderStatus, readonly Move[]> = {
  OPEN: [
    { to: 'IN_PROGRESS', allowedTo: adminOrAssignee },
    { to: 'CANCELLED', allowedTo: adminOnly },
  ],
  IN_PROGRESS: [
    { to: 'DONE', allowedTo: adminOrAssignee },
    { to: 'OPEN', allowedTo: adminOrAssignee },
    { to: 'CANCELLED', allowedTo: adminOnly },
  ],
  DONE: [],
  CANCELLED: [],
};

export type TransitionVerdict = 'ALLOWED' | 'FORBIDDEN' | 'INVALID';

/** INVALID: the workflow has no such move. FORBIDDEN: it does, but not for this actor. */
export function evaluateTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  actor: Actor,
): TransitionVerdict {
  const move = TRANSITIONS[from].find((candidate) => candidate.to === to);
  if (!move) return 'INVALID';
  return move.allowedTo(actor) ? 'ALLOWED' : 'FORBIDDEN';
}

/** The moves open to this actor, in the order of the workflow table above. */
export function allowedTransitions(from: WorkOrderStatus, actor: Actor): WorkOrderStatus[] {
  return TRANSITIONS[from].filter((move) => move.allowedTo(actor)).map((move) => move.to);
}
