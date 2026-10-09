import { defineConfig } from 'vitest/config';
import { e2eEnv } from './test/support/e2e-env.js';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    env: e2eEnv,
    // All files share one database, so they take turns.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
