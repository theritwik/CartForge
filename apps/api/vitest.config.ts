import { existsSync } from 'node:fs';
import { resolveTestDatabaseUrl } from '@cartforge/db/testing';
import { defineConfig } from 'vitest/config';

const rootEnvFile = new URL('../../.env', import.meta.url);
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: resolveTestDatabaseUrl(process.env),
    },
  },
});
