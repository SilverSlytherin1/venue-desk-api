import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import {
  createEvent,
  createUser,
  createWorkOrder,
  expectProblem,
  signIn,
  type SignedInUser,
} from './support/fixtures.js';
import { type TestApp, useTestApp } from './support/test-app.js';

describe('work orders', () => {
  const t = useTestApp();

  describe('POST /work-orders', () => {
    it('lets an admin create a work order linked to an event and an assignee', async () => {
      const admin = await signIn(t, 'ADMIN');
      const sam = await createUser(t, 'STAFF', { name: 'Sam Staff' });
      const event = await createEvent(t, { title: 'Jazz Night' });

      const response = await t.api.post('/work-orders').set(admin.auth).send({
        title: 'Set up stage lighting',
        description: 'Two front spots.',
        priority: 'HIGH',
        eventId: event.id,
        assigneeId: sam.id,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        number: 'WO-0001',
        title: 'Set up stage lighting',
        description: 'Two front spots.',
        priority: 'HIGH',
        status: 'OPEN',
        event: { id: event.id, title: 'Jazz Night' },
        assignee: { id: sam.id, name: 'Sam Staff' },
        createdBy: { id: admin.user.id, name: admin.user.name },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
      });
    });

    it('creates an unassigned work order with no event when both are left out', async () => {
      const admin = await signIn(t, 'ADMIN');

      const response = await t.api
        .post('/work-orders')
        .set(admin.auth)
        .send({ title: 'Fix exit sign', description: '', priority: 'LOW' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ event: null, assignee: null });
    });

    it('reports an invalid priority, an unknown event or an unknown assignee as a field error', async () => {
      const admin = await signIn(t, 'ADMIN');
      const create = (fields: object) =>
        t.api
          .post('/work-orders')
          .set(admin.auth)
          .send({ title: 'Fix exit sign', description: '', priority: 'LOW', ...fields });

      const priority = await create({ priority: 'URGENT' });
      const event = await create({ eventId: randomUUID() });
      const assignee = await create({ assigneeId: randomUUID() });

      for (const [response, field, message] of [
        [priority, 'priority', 'Priority must be one of: LOW, MEDIUM, HIGH.'],
        [event, 'eventId', 'This event does not exist.'],
        [assignee, 'assigneeId', 'This user does not exist.'],
      ] as const) {
        expectProblem(response, 400, 'VALIDATION_FAILED');
        expect(response.body).toMatchObject({ errors: [{ field, message }] });
      }
      expect(await t.prisma.workOrder.count()).toBe(0);
    });

    it('is closed to staff and to anonymous callers', async () => {
      const staff = await signIn(t, 'STAFF');
      const body = { title: 'Fix exit sign', description: '', priority: 'LOW' };

      expectProblem(await t.api.post('/work-orders').set(staff.auth).send(body), 403, 'FORBIDDEN');
      expectProblem(await t.api.post('/work-orders').send(body), 401, 'UNAUTHENTICATED');
    });
  });

  describe('GET /work-orders', () => {
    it('lists newest first and filters by status, assignee and text', async () => {
      const admin = await signIn(t, 'ADMIN');
      const sam = await createUser(t, 'STAFF');
      await createWorkOrder(t, admin.user, { title: 'Print seating plan' });
      await createWorkOrder(t, admin.user, { title: 'Stage lighting', status: 'DONE' });
      await createWorkOrder(t, admin.user, {
        title: 'Order lamp',
        description: 'For the STAGE projector',
        assigneeId: sam.id,
      });
      const list = async (query: Record<string, string | number>) =>
        numbers((await t.api.get('/work-orders').query(query).set(admin.auth)).body);

      expect(await list({})).toEqual(['WO-0003', 'WO-0002', 'WO-0001']);
      expect(await list({ status: 'OPEN' })).toEqual(['WO-0003', 'WO-0001']);
      expect(await list({ assigneeId: sam.id })).toEqual(['WO-0003']);
      expect(await list({ q: 'stage' })).toEqual(['WO-0003', 'WO-0002']);
      expect(await list({ q: 'stage', status: 'DONE' })).toEqual(['WO-0002']);
      expect(await list({ page: 2, pageSize: 2 })).toEqual(['WO-0001']);
    });

    it('returns the page envelope and rejects an unknown status filter', async () => {
      const staff = await signIn(t, 'STAFF');

      const empty = await t.api.get('/work-orders').set(staff.auth);
      const invalid = await t.api.get('/work-orders').query({ status: 'PAUSED' }).set(staff.auth);

      expect(empty.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
      expectProblem(invalid, 400, 'VALIDATION_FAILED');
      expectProblem(await t.api.get('/work-orders'), 401, 'UNAUTHENTICATED');
    });
  });

  describe('GET /work-orders/:id', () => {
    it('computes allowedTransitions for whoever is asking', async () => {
      const admin = await signIn(t, 'ADMIN');
      const assignee = await signIn(t, 'STAFF');
      const colleague = await signIn(t, 'STAFF');
      const { id } = await createWorkOrder(t, admin.user, { assigneeId: assignee.user.id });
      const allowedFor = async (who: SignedInUser) =>
        ((await t.api.get(`/work-orders/${id}`).set(who.auth)).body as WorkOrder)
          .allowedTransitions;

      expect(await allowedFor(admin)).toEqual(['IN_PROGRESS', 'CANCELLED']);
      expect(await allowedFor(assignee)).toEqual(['IN_PROGRESS']);
      expect(await allowedFor(colleague)).toEqual([]);
    });

    it('answers NOT_FOUND for an unknown work order', async () => {
      const staff = await signIn(t, 'STAFF');

      const response = await t.api.get(`/work-orders/${randomUUID()}`).set(staff.auth);

      expectProblem(response, 404, 'NOT_FOUND');
    });
  });

  describe('PATCH /work-orders/:id', () => {
    it('changes only the fields that are sent', async () => {
      const admin = await signIn(t, 'ADMIN');
      const sam = await createUser(t, 'STAFF', { name: 'Sam Staff' });
      const { id } = await createWorkOrder(t, admin.user, { title: 'Old title', priority: 'LOW' });

      const response = await t.api
        .patch(`/work-orders/${id}`)
        .set(admin.auth)
        .send({ title: 'New title', assigneeId: sam.id });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        title: 'New title',
        priority: 'LOW',
        assignee: { id: sam.id, name: 'Sam Staff' },
      });
    });

    it('unassigns with assigneeId null, and rejects null for any other field', async () => {
      const admin = await signIn(t, 'ADMIN');
      const sam = await createUser(t, 'STAFF');
      const { id } = await createWorkOrder(t, admin.user, { assigneeId: sam.id });

      const unassigned = await t.api
        .patch(`/work-orders/${id}`)
        .set(admin.auth)
        .send({ assigneeId: null });
      const nullTitle = await t.api
        .patch(`/work-orders/${id}`)
        .set(admin.auth)
        .send({ title: null });

      expect(unassigned.status).toBe(200);
      expect(unassigned.body).toMatchObject({ assignee: null });
      expectProblem(nullTitle, 400, 'VALIDATION_FAILED');
    });

    it('still edits the details of a work order that is DONE: only its status is final', async () => {
      const admin = await signIn(t, 'ADMIN');
      const { id } = await createWorkOrder(t, admin.user, { status: 'DONE' });

      const response = await t.api
        .patch(`/work-orders/${id}`)
        .set(admin.auth)
        .send({ description: 'Invoice 2031-118 attached.' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'DONE',
        description: 'Invoice 2031-118 attached.',
        allowedTransitions: [],
      });
    });

    it('rejects fields that cannot be edited, unknown assignees and unknown work orders', async () => {
      const admin = await signIn(t, 'ADMIN');
      const { id } = await createWorkOrder(t, admin.user);
      const patch = (target: string, body: object) =>
        t.api.patch(`/work-orders/${target}`).set(admin.auth).send(body);

      const status = await patch(id, { status: 'DONE' });
      const assignee = await patch(id, { assigneeId: randomUUID() });
      const missing = await patch(randomUUID(), { title: 'Anything' });

      expectProblem(status, 400, 'VALIDATION_FAILED');
      expect(status.body).toMatchObject({ errors: [{ field: 'status' }] });
      expectProblem(assignee, 400, 'VALIDATION_FAILED');
      expect(assignee.body).toMatchObject({ errors: [{ field: 'assigneeId' }] });
      expectProblem(missing, 404, 'NOT_FOUND');
    });

    it('is closed to staff, even to the assignee, and to anonymous callers', async () => {
      const admin = await signIn(t, 'ADMIN');
      const assignee = await signIn(t, 'STAFF');
      const { id } = await createWorkOrder(t, admin.user, { assigneeId: assignee.user.id });
      const url = `/work-orders/${id}`;

      const asAssignee = await t.api.patch(url).set(assignee.auth).send({ priority: 'HIGH' });
      const anonymous = await t.api.patch(url).send({ priority: 'HIGH' });

      expectProblem(asAssignee, 403, 'FORBIDDEN');
      expectProblem(anonymous, 401, 'UNAUTHENTICATED');
      const { priority } = await t.prisma.workOrder.findUniqueOrThrow({ where: { id } });
      expect(priority).toBe('MEDIUM');
    });
  });

  describe('POST /work-orders/:id/transitions', () => {
    it('lets the assignee start, reopen, restart and finish the work', async () => {
      const admin = await signIn(t, 'ADMIN');
      const assignee = await signIn(t, 'STAFF');
      const { id } = await createWorkOrder(t, admin.user, { assigneeId: assignee.user.id });

      for (const to of ['IN_PROGRESS', 'OPEN', 'IN_PROGRESS', 'DONE']) {
        const response = await transition(t, assignee, id, to);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: to });
      }
      const { status } = await t.prisma.workOrder.findUniqueOrThrow({ where: { id } });
      expect(status).toBe('DONE');
    });

    it('forbids staff who are not the assignee, and forbids any staff to cancel', async () => {
      const admin = await signIn(t, 'ADMIN');
      const assignee = await signIn(t, 'STAFF');
      const colleague = await signIn(t, 'STAFF');
      const { id } = await createWorkOrder(t, admin.user, { assigneeId: assignee.user.id });

      expectProblem(await transition(t, colleague, id, 'IN_PROGRESS'), 403, 'FORBIDDEN');
      expectProblem(await transition(t, assignee, id, 'CANCELLED'), 403, 'FORBIDDEN');

      const { status } = await t.prisma.workOrder.findUniqueOrThrow({ where: { id } });
      expect(status).toBe('OPEN');
    });

    it('lets an admin make any legal move, including cancelling', async () => {
      const admin = await signIn(t, 'ADMIN');
      const { id } = await createWorkOrder(t, admin.user, { status: 'IN_PROGRESS' });

      const response = await transition(t, admin, id, 'CANCELLED');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'CANCELLED', allowedTransitions: [] });
    });

    it('rejects moves the workflow does not have, whoever asks', async () => {
      const admin = await signIn(t, 'ADMIN');
      const open = await createWorkOrder(t, admin.user);
      const done = await createWorkOrder(t, admin.user, { status: 'DONE' });
      const cancelled = await createWorkOrder(t, admin.user, { status: 'CANCELLED' });

      const skipped = await transition(t, admin, open.id, 'DONE');
      expectProblem(skipped, 409, 'INVALID_TRANSITION');
      expect(skipped.body).toMatchObject({ detail: 'A work order cannot move from OPEN to DONE.' });
      expectProblem(await transition(t, admin, open.id, 'OPEN'), 409, 'INVALID_TRANSITION');
      expectProblem(await transition(t, admin, done.id, 'OPEN'), 409, 'INVALID_TRANSITION');
      expectProblem(
        await transition(t, admin, cancelled.id, 'IN_PROGRESS'),
        409,
        'INVALID_TRANSITION',
      );
    });

    it('validates the target status and the work order id', async () => {
      const admin = await signIn(t, 'ADMIN');
      const { id } = await createWorkOrder(t, admin.user);

      expectProblem(await transition(t, admin, id, 'PAUSED'), 400, 'VALIDATION_FAILED');
      expectProblem(await transition(t, admin, randomUUID(), 'DONE'), 404, 'NOT_FOUND');
      expectProblem(
        await t.api.post(`/work-orders/${id}/transitions`).send({ to: 'IN_PROGRESS' }),
        401,
        'UNAUTHENTICATED',
      );
    });

    it('refuses a move whose work order changed status after it was checked', async () => {
      const admin = await signIn(t, 'ADMIN');
      const { id } = await createWorkOrder(t, admin.user);

      const response = await overtakenBy(
        t,
        (tx) => tx.workOrder.update({ where: { id }, data: { status: 'CANCELLED' } }),
        () => transition(t, admin, id, 'IN_PROGRESS'),
      );

      expectProblem(response, 409, 'INVALID_TRANSITION');
      expect(response.body).toMatchObject({ detail: expect.stringContaining('someone else') });
      const { status } = await t.prisma.workOrder.findUniqueOrThrow({ where: { id } });
      expect(status).toBe('CANCELLED');
    });

    it('refuses a move by a staff member who was unassigned after being checked', async () => {
      const admin = await signIn(t, 'ADMIN');
      const assignee = await signIn(t, 'STAFF');
      const colleague = await createUser(t, 'STAFF');
      const { id } = await createWorkOrder(t, admin.user, { assigneeId: assignee.user.id });

      const response = await overtakenBy(
        t,
        (tx) => tx.workOrder.update({ where: { id }, data: { assigneeId: colleague.id } }),
        () => transition(t, assignee, id, 'IN_PROGRESS'),
      );

      expectProblem(response, 409, 'INVALID_TRANSITION');
      expect(response.body).toMatchObject({ detail: expect.stringContaining('someone else') });
      const { status } = await t.prisma.workOrder.findUniqueOrThrow({ where: { id } });
      expect(status).toBe('OPEN');
    });

    it('lets exactly one of two simultaneous transitions win', async () => {
      const admin = await signIn(t, 'ADMIN');
      // DONE and CANCELLED are both terminal, so whichever lands first makes the other illegal:
      // "exactly one" holds for every interleaving. Twenty pairs, because one could pass by luck.
      const workOrders = await Promise.all(
        Array.from({ length: 20 }, () => createWorkOrder(t, admin.user, { status: 'IN_PROGRESS' })),
      );

      const races = await Promise.all(
        workOrders.map(async ({ id }) => ({
          id,
          responses: await Promise.all([
            transition(t, admin, id, 'DONE'),
            transition(t, admin, id, 'CANCELLED'),
          ]),
        })),
      );

      for (const { id, responses } of races) {
        const [done, cancelled] = responses;
        const [winner, loser] = done.status === 200 ? [done, cancelled] : [cancelled, done];
        expect(winner.status).toBe(200);
        expectProblem(loser, 409, 'INVALID_TRANSITION');

        const stored = await t.prisma.workOrder.findUniqueOrThrow({ where: { id } });
        expect(stored.status).toBe((winner.body as WorkOrder).status);
      }
    });
  });
});

interface WorkOrder {
  number: string;
  status: string;
  allowedTransitions: string[];
}

function numbers(page: unknown): string[] {
  return (page as { items: WorkOrder[] }).items.map((workOrder) => workOrder.number);
}

function transition(t: TestApp, who: SignedInUser, id: string, to: string) {
  return t.api.post(`/work-orders/${id}/transitions`).set(who.auth).send({ to });
}

/**
 * Forces the interleaving "request reads, somebody else changes the row, request writes"
 * instead of waiting for it to happen by chance. The change is made in a transaction that
 * stays open, so the request reads the old row and then blocks on the row lock when it
 * writes. Only when the database reports a blocked query is the change committed.
 */
async function overtakenBy(
  t: TestApp,
  change: (tx: Prisma.TransactionClient) => Promise<unknown>,
  request: () => PromiseLike<Response>,
): Promise<Response> {
  const { inFlight } = await t.prisma.$transaction(async (tx) => {
    await change(tx);
    const inFlight = Promise.resolve(request());
    await expect
      .poll(async () => {
        const [row] = await t.prisma.$queryRaw<{ blocked: number }[]>`
          SELECT count(*)::int AS blocked FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        return row?.blocked;
      })
      .toBe(1);
    // Wrapped in an object: a bare promise would make the transaction wait for the response.
    return { inFlight };
  });
  return inFlight;
}
