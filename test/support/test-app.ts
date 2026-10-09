import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { API_PREFIX, createApp } from '../../src/app.js';
import { PrismaService } from '../../src/database/prisma.service.js';

type HttpClient = ReturnType<typeof request>;

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  /** Requests against the API, relative to /api/v1. */
  api: HttpClient;
  /** Requests against the server root, for what lives outside the prefix. */
  root: HttpClient;
}

/**
 * Boots the real application once per spec file, on a real port, and empties the database
 * before each test. The returned object is filled in by `beforeAll`: use it inside tests.
 */
export function useTestApp(): TestApp {
  const context = {} as TestApp;

  beforeAll(async () => {
    const app = await createApp({ logger: ['error'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;

    Object.assign(context, {
      app,
      prisma: app.get(PrismaService),
      api: request(`${origin}/${API_PREFIX}`),
      root: request(origin),
    } satisfies TestApp);
  });

  beforeEach(async () => {
    await context.prisma.$executeRaw`
      TRUNCATE TABLE work_orders, bookings, events, users RESTART IDENTITY CASCADE`;
  });

  afterAll(async () => {
    await context.app.close();
  });

  return context;
}
