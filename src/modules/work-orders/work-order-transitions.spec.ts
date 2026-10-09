import { describe, expect, it } from 'vitest';
import { Role } from '../../common/auth/role.js';
import {
  type Actor,
  allowedTransitions,
  evaluateTransition,
  type TransitionVerdict,
} from './work-order-transitions.js';
import { WorkOrderStatus } from './work-order.enums.js';

const admin: Actor = { role: 'ADMIN', isAssignee: false };
const assignedAdmin: Actor = { role: 'ADMIN', isAssignee: true };
const assignee: Actor = { role: 'STAFF', isAssignee: true };
const otherStaff: Actor = { role: 'STAFF', isAssignee: false };

/**
 * The contract's workflow table, restated independently of the implementation:
 * every legal move and the actors allowed to make it. Anything not listed is illegal.
 */
const LEGAL_MOVES: { from: WorkOrderStatus; to: WorkOrderStatus; allowed: Actor[] }[] = [
  { from: 'OPEN', to: 'IN_PROGRESS', allowed: [admin, assignedAdmin, assignee] },
  { from: 'IN_PROGRESS', to: 'DONE', allowed: [admin, assignedAdmin, assignee] },
  { from: 'IN_PROGRESS', to: 'OPEN', allowed: [admin, assignedAdmin, assignee] },
  { from: 'OPEN', to: 'CANCELLED', allowed: [admin, assignedAdmin] },
  { from: 'IN_PROGRESS', to: 'CANCELLED', allowed: [admin, assignedAdmin] },
];

function expectedVerdict(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  actor: Actor,
): TransitionVerdict {
  const move = LEGAL_MOVES.find((candidate) => candidate.from === from && candidate.to === to);
  if (!move) return 'INVALID';
  return move.allowed.includes(actor) ? 'ALLOWED' : 'FORBIDDEN';
}

const statuses = Object.values(WorkOrderStatus);
const actors = [admin, assignedAdmin, assignee, otherStaff];
const describeActor = (actor: Actor): string =>
  `${actor.role}${actor.isAssignee ? ' assignee' : ''}`;

describe('evaluateTransition', () => {
  // 4 statuses x 4 statuses x 4 actors: the whole input space, 64 cases.
  const cases = statuses.flatMap((from) =>
    statuses.flatMap((to) =>
      actors.map((actor) => ({
        from,
        to,
        actor,
        who: describeActor(actor),
        verdict: expectedVerdict(from, to, actor),
      })),
    ),
  );

  it.each(cases)('$from -> $to by $who is $verdict', ({ from, to, actor, verdict }) => {
    expect(evaluateTransition(from, to, actor)).toBe(verdict);
  });

  it('covers every role, so a new role cannot slip through untested', () => {
    expect(new Set(actors.map((actor) => actor.role))).toEqual(new Set(Object.values(Role)));
  });
});

describe('allowedTransitions', () => {
  // The order is part of the behaviour: the step forward, then the step back, then cancelling.
  it.each<{ from: WorkOrderStatus; actor: Actor; targets: WorkOrderStatus[] }>([
    { from: 'OPEN', actor: admin, targets: ['IN_PROGRESS', 'CANCELLED'] },
    { from: 'OPEN', actor: assignee, targets: ['IN_PROGRESS'] },
    { from: 'OPEN', actor: otherStaff, targets: [] },
    { from: 'IN_PROGRESS', actor: admin, targets: ['DONE', 'OPEN', 'CANCELLED'] },
    { from: 'IN_PROGRESS', actor: assignee, targets: ['DONE', 'OPEN'] },
    { from: 'IN_PROGRESS', actor: otherStaff, targets: [] },
  ])('from $from offers $targets to $actor.role, in that order', ({ from, actor, targets }) => {
    expect(allowedTransitions(from, actor)).toEqual(targets);
  });

  it.each(['DONE', 'CANCELLED'] as const)('offers nothing from %s: it is terminal', (from) => {
    for (const actor of actors) {
      expect(allowedTransitions(from, actor)).toEqual([]);
    }
  });

  it('offers exactly the moves evaluateTransition allows, for every status and actor', () => {
    for (const from of statuses) {
      for (const actor of actors) {
        const allowed = statuses.filter((to) => expectedVerdict(from, to, actor) === 'ALLOWED');
        expect(allowedTransitions(from, actor).toSorted()).toEqual(allowed.toSorted());
      }
    }
  });
});
