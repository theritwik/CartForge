import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from './generated/prisma/client.js';

const TEST_DATABASE_SUFFIX = '_test';
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function databaseNameFromUrl(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

/**
 * Returns the URL automated tests must connect to, or throws. Tests never fall
 * back to DATABASE_URL, so they cannot run against development data.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const testDatabaseUrl = env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is not set. See .env.example.');
  }
  if (!databaseNameFromUrl(testDatabaseUrl).endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "${TEST_DATABASE_SUFFIX}".`);
  }
  if (testDatabaseUrl === env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not be the same database as DATABASE_URL.');
  }
  return testDatabaseUrl;
}

/** Creates the test database if it does not exist and applies all migrations. */
export function migrateTestDatabase(testDatabaseUrl: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
}

/** Empties every table. Refuses to run unless connected to a test database. */
export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  const [connection] = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  if (!connection?.name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to truncate "${connection?.name ?? 'unknown'}": not a test database.`,
    );
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) {
    return;
  }
  const tableList = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`);
}
