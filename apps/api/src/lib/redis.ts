import { createClient } from 'redis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

function createRedisClient(url: string, name: string) {
  const client = createClient({
    url,
    // Fail commands immediately while disconnected instead of queueing them.
    disableOfflineQueue: true,
  });
  client.on('error', (error: unknown) => {
    logger.error({ err: error, client: name }, 'Redis client error');
  });
  return client;
}

/** Rate-limit counters. Its instance must never evict keys, so limits cannot be reset by memory pressure. */
export const redis = createRedisClient(env.REDIS_URL, 'redis');

/**
 * The catalog cache, on its own instance with a memory limit and eviction. Kept apart
 * from `redis` because eviction there could remove rate-limit counters.
 */
export const cacheRedis = createRedisClient(env.CACHE_REDIS_URL, 'cache');
