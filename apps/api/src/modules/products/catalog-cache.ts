import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { cacheRedis } from '../../lib/redis.js';

/**
 * Cache-aside storage for public catalog reads. Entries hold only what is slow
 * to compute and changes only when an administrator edits the catalog: which
 * products match a query, in what order, how many, and their display fields.
 * Price, status, and stock are never read from here.
 *
 * Every catalog write increments a generation number. Keys include it, so a
 * write makes every older entry unreachable at once, on every API instance;
 * the orphaned entries expire on their own.
 */

const PREFIX = `cartforge:${env.NODE_ENV}:catalog`;
export const CATALOG_GENERATION_KEY = `${PREFIX}:generation`;
/** Changes when the shape of cached entries changes, so old entries are never misread. */
const FORMAT_VERSION = 'v1';

export const CACHE_TTL_SECONDS = {
  /** Query results, including searches: many distinct keys, so kept briefly. */
  productList: 120,
  productDetail: 300,
  categories: 300,
} as const;

const FAILURE_LOG_INTERVAL_MS = 30_000;
const lastFailureLog = new Map<string, number>();

/** Logs a cache failure at most once every 30 seconds per operation, so an outage cannot flood the logs. */
function logCacheFailure(operation: string, error: unknown): void {
  const now = Date.now();
  if (now - (lastFailureLog.get(operation) ?? 0) < FAILURE_LOG_INTERVAL_MS) {
    return;
  }
  lastFailureLog.set(operation, now);
  logger.warn(
    { operation, error: error instanceof Error ? error.message : String(error) },
    'Catalog cache unavailable; reading from the database',
  );
}

async function currentGeneration(): Promise<string | null> {
  if (!cacheRedis.isReady) {
    logCacheFailure('generation', new Error('Redis is not connected'));
    return null;
  }
  try {
    return (await cacheRedis.get(CATALOG_GENERATION_KEY)) ?? '0';
  } catch (error) {
    logCacheFailure('generation', error);
    return null;
  }
}

/** A short, stable digest of the normalized parameters, so keys have a bounded length. */
function digest(parameters: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.keys(parameters)
      .sort()
      .filter((name) => parameters[name] !== undefined)
      .map((name) => [name, parameters[name]]),
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * Returns the cached value for this kind and parameters, or loads it, stores
 * it, and returns it. If Redis is unreachable or the entry is unreadable, the
 * value is loaded from the database: the cache can make a read faster, never
 * make it fail.
 */
export async function readThrough<T>(options: {
  kind: string;
  parameters: Record<string, unknown>;
  ttlSeconds: number;
  schema: z.ZodType<T>;
  load: () => Promise<T>;
}): Promise<T> {
  const generation = await currentGeneration();
  if (generation === null) {
    return options.load();
  }
  const key = `${PREFIX}:${FORMAT_VERSION}:g${generation}:${options.kind}:${digest(options.parameters)}`;

  try {
    const stored = await cacheRedis.get(key);
    if (stored !== null) {
      const parsed = options.schema.safeParse(JSON.parse(stored));
      if (parsed.success) {
        return parsed.data;
      }
      logCacheFailure('read', new Error(`Discarded an unreadable entry for ${options.kind}`));
      await cacheRedis.del(key);
    }
  } catch (error) {
    // JSON.parse failures land here too: the entry is ignored and replaced below.
    logCacheFailure('read', error);
  }

  const value = await options.load();
  try {
    await cacheRedis.set(key, JSON.stringify(value), {
      expiration: { type: 'EX', value: options.ttlSeconds },
    });
  } catch (error) {
    logCacheFailure('write', error);
  }
  return value;
}

/**
 * Makes every cached catalog entry unreachable. Called after each catalog write.
 * If Redis is unreachable the write still succeeds; entries then expire within
 * their TTL, and price, status, and stock are correct in the meantime because
 * they are never cached.
 */
export async function invalidateCatalogCache(): Promise<void> {
  try {
    await cacheRedis.incr(CATALOG_GENERATION_KEY);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Could not invalidate the catalog cache; entries will expire on their own',
    );
  }
}
