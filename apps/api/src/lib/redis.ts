import { createClient } from 'redis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = createClient({
  url: env.REDIS_URL,
  // Fail commands immediately while disconnected instead of queueing them.
  disableOfflineQueue: true,
});

redis.on('error', (error: unknown) => {
  logger.error({ err: error }, 'Redis client error');
});
