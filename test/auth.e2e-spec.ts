import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { createUser, expectProblem, PASSWORD, signIn } from './support/fixtures.js';
import { useTestApp } from './support/test-app.js';

describe('authentication', () => {
  const t = useTestApp();

  describe('POST /auth/login', () => {
    it('returns an access token and the user, without the password hash', async () => {
      const user = await createUser(t, 'STAFF', { name: 'Sam Staff' });

      const response = await t.api
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: 3600,
        user: { id: user.id, name: 'Sam Staff', email: user.email, role: 'STAFF' },
      });
    });

    it('ignores case and surrounding spaces in the email', async () => {
      await createUser(t, 'ADMIN', { email: 'alex@venuedesk.test' });

      const response = await t.api
        .post('/auth/login')
        .send({ email: '  Alex@VenueDesk.test ', password: PASSWORD });

      expect(response.status).toBe(200);
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const user = await createUser(t, 'STAFF');

      const wrongPassword = await t.api
        .post('/auth/login')
        .send({ email: user.email, password: 'not-the-password' });
      const unknownEmail = await t.api
        .post('/auth/login')
        .send({ email: 'nobody@venuedesk.test', password: PASSWORD });

      expectProblem(wrongPassword, 401, 'INVALID_CREDENTIALS');
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('rejects a malformed body with one error per invalid field', async () => {
      const response = await t.api
        .post('/auth/login')
        .send({ email: 'not-an-email', remember: true });

      expectProblem(response, 400, 'VALIDATION_FAILED');
      expect(response.body).toMatchObject({
        errors: [
          { field: 'remember', message: '"remember" is not an accepted field.' },
          { field: 'email', message: 'Enter a valid email address.' },
          { field: 'password', message: 'Password is required.' },
        ],
      });
    });
  });

  describe('GET /auth/me', () => {
    it('returns the user behind the token', async () => {
      const { user, auth } = await signIn(t, 'ADMIN');

      const response = await t.api.get('/auth/me').set(auth);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'ADMIN',
      });
    });

    it('rejects a request without a token', async () => {
      expectProblem(await t.api.get('/auth/me'), 401, 'UNAUTHENTICATED');
    });

    it('rejects a token that is malformed, forged or expired', async () => {
      const user = await createUser(t, 'ADMIN');
      const payload = { sub: user.id };
      const forged = await new JwtService().signAsync(payload, {
        secret: 'a-secret-the-server-does-not-know-0123456789',
        issuer: 'venue-desk-api',
      });
      const expired = await t.app.get(JwtService).signAsync(payload, { expiresIn: -60 });

      for (const token of ['not-a-jwt', forged, expired]) {
        const response = await t.api.get('/auth/me').set('Authorization', `Bearer ${token}`);
        expectProblem(response, 401, 'UNAUTHENTICATED');
      }
    });
  });

  describe('a token outlived by a change to its user', () => {
    const workOrder = { title: 'Fix exit sign', description: '', priority: 'LOW' };

    it('stops working everywhere once the user is deleted', async () => {
      const { user, auth } = await signIn(t, 'ADMIN');
      await t.prisma.user.delete({ where: { id: user.id } });

      expectProblem(await t.api.get('/auth/me').set(auth), 401, 'UNAUTHENTICATED');
      expectProblem(await t.api.get('/work-orders').set(auth), 401, 'UNAUTHENTICATED');
      expectProblem(
        await t.api.post('/work-orders').set(auth).send(workOrder),
        401,
        'UNAUTHENTICATED',
      );
    });

    it('follows a role change at once, without waiting for the token to expire', async () => {
      const { user, auth } = await signIn(t, 'ADMIN');
      expect((await t.api.post('/work-orders').set(auth).send(workOrder)).status).toBe(201);

      await t.prisma.user.update({ where: { id: user.id }, data: { role: 'STAFF' } });

      expectProblem(await t.api.post('/work-orders').set(auth).send(workOrder), 403, 'FORBIDDEN');
      expect((await t.api.get('/auth/me').set(auth)).body).toMatchObject({ role: 'STAFF' });
    });
  });

  describe('GET /users', () => {
    it('lists assignable users for an admin, by name, optionally by role', async () => {
      const { user: admin, auth } = await signIn(t, 'ADMIN');
      const robin = await createUser(t, 'STAFF', { name: 'Robin Staff' });
      const sam = await createUser(t, 'STAFF', { name: 'Sam Staff' });

      const everyone = await t.api.get('/users').set(auth);
      const staffOnly = await t.api.get('/users').query({ role: 'STAFF' }).set(auth);

      expect(everyone.status).toBe(200);
      expect(everyone.body).toEqual([
        { id: admin.id, name: admin.name },
        { id: robin.id, name: 'Robin Staff' },
        { id: sam.id, name: 'Sam Staff' },
      ]);
      expect(staffOnly.body).toEqual([
        { id: robin.id, name: 'Robin Staff' },
        { id: sam.id, name: 'Sam Staff' },
      ]);
    });

    it('is closed to staff and to anonymous callers', async () => {
      const staff = await signIn(t, 'STAFF');

      expectProblem(await t.api.get('/users').set(staff.auth), 403, 'FORBIDDEN');
      expectProblem(await t.api.get('/users'), 401, 'UNAUTHENTICATED');
    });

    it('rejects an unknown role filter', async () => {
      const { auth } = await signIn(t, 'ADMIN');

      const response = await t.api.get('/users').query({ role: 'OWNER' }).set(auth);

      expectProblem(response, 400, 'VALIDATION_FAILED');
    });
  });
});
