import { execSync } from 'node:child_process';
import { E2E_DATABASE_URL } from './e2e-env.js';

/** Creates the e2e database if needed and brings it to the latest migration, once per run. */
export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
}
