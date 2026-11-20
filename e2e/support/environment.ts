import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Where the end-to-end suite runs. Everything is separate from development
 * data: its own database, its own Redis database indexes, and its own ports,
 * so it can run beside `pnpm dev` and never touches the development catalog.
 */

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const rootEnvFile = new URL('../../.env', import.meta.url);
if (existsSync(rootEnvFile)) {
  // Values already in the environment (as in CI) take precedence.
  process.loadEnvFile(rootEnvFile);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function withRedisDatabase(redisUrl: string, index: number): string {
  const url = new URL(redisUrl);
  url.pathname = `/${index}`;
  return url.toString();
}

const E2E_DATABASE_SUFFIX = '_e2e_test';

/** The suite's own database: E2E_DATABASE_URL, or the test database's server with another name. */
function resolveDatabaseUrl(): string {
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    withDatabaseName(required('TEST_DATABASE_URL'), `cartforge${E2E_DATABASE_SUFFIX}`);
  const name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!name.endsWith(E2E_DATABASE_SUFFIX)) {
    throw new Error(
      `The end-to-end database must be named "*${E2E_DATABASE_SUFFIX}", not "${name}".`,
    );
  }
  // The suffix also rules out the development database and the API tests' "_test" database.
  return databaseUrl;
}

export const e2e = {
  webPort: 3200,
  apiPort: 4200,
  webOrigin: 'http://localhost:3200',
  apiOrigin: 'http://localhost:4200',
  databaseUrl: resolveDatabaseUrl(),
  // Index 2 and 3, never 0 (development) or 1 (benchmarks). Two indexes, because the API
  // refuses a cache URL equal to the rate-limit URL; in CI both are on one server.
  redisUrl: withRedisDatabase(required('REDIS_URL'), 2),
  cacheRedisUrl: withRedisDatabase(process.env.CACHE_REDIS_URL ?? required('REDIS_URL'), 3),
  /** Key prefix the API uses, from the NODE_ENV it is started with. */
  keyPrefix: 'cartforge:development:',
};
