import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Left out when DATABASE_URL is not set: `prisma generate` needs no database, and every
  // command that does then stops with Prisma's own "datasource.url is required" message.
  ...(url && { datasource: { url } }),
});
