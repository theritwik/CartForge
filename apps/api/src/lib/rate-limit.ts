import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';
import { redis } from './redis.js';

export interface RateLimit {
  /** Names the counter, for example "login:ip". */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

// The subject (an IP address or email) is hashed so it is not stored in Redis as plain text.
function redisKey(bucket: string, subject: string): string {
  const subjectHash = createHash('sha256').update(subject).digest('hex').slice(0, 32);
  return `cartforge:${env.NODE_ENV}:ratelimit:${bucket}:${subjectHash}`;
}

/**
 * Counts one attempt in a fixed window and throws a 429 once the limit is passed.
 * If Redis is unreachable the attempt is allowed and the failure is logged.
 */
export async function consumeRateLimit(rateLimit: RateLimit, subject: string): Promise<void> {
  const key = redisKey(rateLimit.bucket, subject);

  let attempts: number;
  let secondsUntilReset: number;
  try {
    const replies = await redis
      .multi()
      .incr(key)
      .expire(key, rateLimit.windowSeconds, 'NX')
      .ttl(key)
      .exec();
    attempts = Number(replies[0]);
    secondsUntilReset = Number(replies[2]);
  } catch (error) {
    logger.error({ err: error, bucket: rateLimit.bucket }, 'Rate limiter unavailable');
    return;
  }

  if (attempts > rateLimit.limit) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Please try again later.', {
      retryAfterSeconds: Math.max(secondsUntilReset, 1),
    });
  }
}

export async function resetRateLimit(rateLimit: RateLimit, subject: string): Promise<void> {
  try {
    await redis.del(redisKey(rateLimit.bucket, subject));
  } catch (error) {
    logger.error({ err: error, bucket: rateLimit.bucket }, 'Rate limiter unavailable');
  }
}
