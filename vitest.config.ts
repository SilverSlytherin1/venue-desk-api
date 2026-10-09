import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Decorators need the metadata polyfill that Nest loads for itself at runtime.
    setupFiles: ['reflect-metadata'],
  },
});
