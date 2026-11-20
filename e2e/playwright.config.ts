import { defineConfig, devices } from '@playwright/test';
import { e2e, repositoryRoot } from './support/environment.js';

const apiEnvironment = {
  ...process.env,
  NODE_ENV: 'development',
  API_PORT: String(e2e.apiPort),
  LOG_LEVEL: 'warn',
  WEB_ORIGIN: e2e.webOrigin,
  TRUST_PROXY_HOPS: '0',
  DATABASE_URL: e2e.databaseUrl,
  E2E_DATABASE_URL: e2e.databaseUrl,
  REDIS_URL: e2e.redisUrl,
  CACHE_REDIS_URL: e2e.cacheRedisUrl,
  // Empty, never a real key: payments always use the labelled development simulator here.
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  // Every request comes from this machine; the limit itself is covered by API tests.
  API_WRITE_LIMIT_PER_MINUTE: '100000',
};

const webEnvironment = {
  ...process.env,
  // A production build, as deployed. The root .env sets development for the API.
  NODE_ENV: 'production',
  API_URL: e2e.apiOrigin,
  // A separate build directory, so the suite can run beside `next dev`.
  NEXT_DIST_DIR: '.next-e2e',
};

export default defineConfig({
  testDir: './tests',
  // Tests share one catalog and its stock, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: e2e.webOrigin,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      // Resets the suite's database and Redis first; servers start before any global setup.
      command:
        'pnpm --filter @cartforge/api build && pnpm --filter @cartforge/e2e exec tsx support/prepare-environment.ts && node apps/api/dist/server.js',
      cwd: repositoryRoot,
      env: apiEnvironment,
      url: `${e2e.apiOrigin}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: `pnpm --filter @cartforge/web exec next build && pnpm --filter @cartforge/web exec next start -p ${e2e.webPort}`,
      cwd: repositoryRoot,
      env: webEnvironment,
      url: e2e.webOrigin,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
