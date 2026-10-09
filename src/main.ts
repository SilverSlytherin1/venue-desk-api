import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import type { Env } from './config/env.js';

const app = await createApp();
await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }));
