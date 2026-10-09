import { type NestApplicationOptions, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { sendProblem } from './common/errors/problem.filter.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api/v1';

/**
 * Builds the application exactly as it runs in production. The e2e suite calls this too, so
 * the tests exercise the real prefix, security headers, validation and error handling.
 */
export async function createApp(
  options: NestApplicationOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, options);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('Venue Desk API')
    .setDescription(
      'Seat booking and work orders for an events venue. ' +
        'Errors are RFC 7807 problem documents with a stable `code`.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApi));

  // Nest answers unknown routes itself only below the global prefix. This handler goes in
  // after init, so behind every route, and gives any other path the same problem document
  // instead of Express's HTML page.
  await app.init();
  app.use((request: Request, response: Response) => {
    const notFound = new NotFoundException(`Cannot ${request.method} ${request.originalUrl}`);
    sendProblem(notFound, request, response);
  });

  return app;
}
