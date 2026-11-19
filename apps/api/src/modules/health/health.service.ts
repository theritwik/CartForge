import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { cacheRedis, redis } from '../../lib/redis.js';

const CHECK_TIMEOUT_MS = 2000;

type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
    /** Reported but not required: the catalog is served from PostgreSQL without it. */
    cache: DependencyStatus;
  };
}

async function probe(dependency: string, check: () => Promise<unknown>): Promise<DependencyStatus> {
  let timeout: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Health check timed out after ${CHECK_TIMEOUT_MS}ms`));
    }, CHECK_TIMEOUT_MS);
  });

  try {
    await Promise.race([check(), timedOut]);
    return 'up';
  } catch (error) {
    logger.warn({ err: error, dependency }, 'Health check failed');
    return 'down';
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, redisStatus, cache] = await Promise.all([
    probe('database', () => prisma.$queryRaw`SELECT 1`),
    probe('redis', () => redis.ping()),
    probe('cache', () => cacheRedis.ping()),
  ]);

  return {
    status: database === 'up' && redisStatus === 'up' ? 'ok' : 'degraded',
    checks: { database, redis: redisStatus, cache },
  };
}
