import { describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/index.js';
import { resolveTestDatabaseUrl, truncateAllTables } from '../src/testing.js';

const developmentUrl = 'postgresql://user:password@localhost:5432/cartforge';
const testUrl = 'postgresql://user:password@localhost:5432/cartforge_test';

describe('resolveTestDatabaseUrl', () => {
  it('returns the test database URL', () => {
    expect(
      resolveTestDatabaseUrl({ DATABASE_URL: developmentUrl, TEST_DATABASE_URL: testUrl }),
    ).toBe(testUrl);
  });

  it('does not fall back to DATABASE_URL', () => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: developmentUrl })).toThrow(
      /TEST_DATABASE_URL is not set/,
    );
  });

  it('rejects a database whose name does not end in _test', () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: developmentUrl })).toThrow(/_test/);
  });

  it('rejects the same database as DATABASE_URL', () => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl }),
    ).toThrow(/must not be the same/);
  });
});

describe('truncateAllTables', () => {
  it('refuses to run against a database that is not a test database', async () => {
    // The maintenance database on the same server stands in for a non-test database.
    const nonTestUrl = new URL(process.env.DATABASE_URL ?? '');
    nonTestUrl.pathname = '/postgres';
    const prisma = createPrismaClient(nonTestUrl.toString());

    try {
      await expect(truncateAllTables(prisma)).rejects.toThrow(/not a test database/);
    } finally {
      await prisma.$disconnect();
    }
  });
});
