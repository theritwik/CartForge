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
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // As locally: no proxy in front, so X-Forwarded-For is never trusted.
      TRUST_PROXY_HOPS: '0',
      // Placeholders, not credentials: tests replace every Stripe network call.
      STRIPE_SECRET_KEY: 'sk_test_placeholder_for_automated_tests',
      STRIPE_WEBHOOK_SECRET: 'whsec_placeholder_for_automated_tests',
      DATABASE_URL: resolveTestDatabaseUrl(process.env),
    },
  },
});
