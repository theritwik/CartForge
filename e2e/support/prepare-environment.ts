import { execFileSync } from 'node:child_process';
import { createPrismaClient } from '@cartforge/db';
import { migrateTestDatabase, truncateAllTables } from '@cartforge/db/testing';
import { createClient } from 'redis';
import { e2e, repositoryRoot } from './environment.js';

/**
 * Run before the API starts (see playwright.config.ts), so every run begins
 * from the same state: the end-to-end database migrated, emptied, and loaded
 * with the development catalog, and the suite's Redis databases empty.
 */
async function prepareEnvironment(): Promise<void> {
  migrateTestDatabase(e2e.databaseUrl);

  const prisma = createPrismaClient(e2e.databaseUrl);
  try {
    // Refuses any database whose name does not end in _test.
    await truncateAllTables(prisma);
  } finally {
    await prisma.$disconnect();
  }

  execFileSync('pnpm', ['--filter', '@cartforge/db', 'seed'], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: e2e.databaseUrl },
    stdio: 'pipe',
  });

  for (const url of [e2e.redisUrl, e2e.cacheRedisUrl]) {
    const client = await createClient({ url }).connect();
    // FLUSHDB empties only this database index, never development data in index 0.
    await client.flushDb();
    await client.close();
  }
}

await prepareEnvironment();
