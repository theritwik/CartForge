/**
 * Loads the benchmark catalog into a database whose name ends in "_bench".
 * It empties that database first, so it refuses to touch any other.
 *
 *   BENCH_DATABASE_URL=postgresql://.../cartforge_bench pnpm bench:prepare
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@cartforge/db';

const databaseUrl = process.env.BENCH_DATABASE_URL;
const databaseName = databaseUrl ? decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) : '';
if (!databaseUrl || !databaseName.endsWith('_bench')) {
  console.error('Set BENCH_DATABASE_URL to a database whose name ends in "_bench".');
  process.exit(1);
}

// Creates the database if needed and applies every migration.
execFileSync('pnpm', ['--filter', '@cartforge/db', 'exec', 'prisma', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});

const prisma = createPrismaClient(databaseUrl);
try {
  const [connection] = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  if (!connection?.name.endsWith('_bench')) {
    throw new Error(`Refusing to load benchmark data into "${connection?.name ?? 'unknown'}".`);
  }
  const sql = readFileSync(fileURLToPath(new URL('dataset.sql', import.meta.url)), 'utf8');
  for (const statement of sql
    .split(/;\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    if (!statement.split('\n').every((line) => line.startsWith('--'))) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
  const [counts] = await prisma.$queryRaw<{ products: bigint; active: bigint }[]>`
    SELECT count(*) AS products, count(*) FILTER (WHERE status = 'ACTIVE') AS active FROM products
  `;
  console.log(
    `Loaded ${counts?.products} products (${counts?.active} active) into ${connection.name}.`,
  );
} finally {
  await prisma.$disconnect();
}
