import { env } from '../config/env.js';
import { logger } from './logger.js';
import { redis } from './redis.js';

export type TickOutcome = 'ran' | 'failed' | 'still-running' | 'claimed-elsewhere';

export interface ScheduledJob {
  /** Runs the job now unless it is still running here or another instance has claimed this tick. */
  tick: () => Promise<TickOutcome>;
  /** Runs `tick` every interval. The timer does not keep the process alive. */
  start: () => void;
}

/**
 * A periodic background job, for an API that may run as several instances.
 *
 * Each job must be correct when it runs more than once at a time: the jobs here
 * rely on conditional updates and idempotency keys, not on this scheduling.
 * The scheduling only avoids wasted work. A run never overlaps an earlier run
 * in the same process, which matters when a slow provider makes one run longer
 * than the interval; and the first instance to claim a tick in Redis runs it,
 * so the others skip it. The claim expires just before the next tick, and is
 * never released early, so one tick runs at most once across instances unless
 * Redis is unavailable, in which case every instance runs it.
 */
export function createScheduledJob(options: {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}): ScheduledJob {
  const claimKey = `cartforge:${env.NODE_ENV}:job:${options.name}`;
  const claimMs = Math.max(options.intervalMs - 1000, 1000);
  let running = false;

  async function claimTick(): Promise<boolean> {
    if (!redis.isReady) {
      return true;
    }
    try {
      const reply = await redis.set(claimKey, String(process.pid), {
        condition: 'NX',
        expiration: { type: 'PX', value: claimMs },
      });
      return reply === 'OK';
    } catch (error) {
      logger.warn({ err: error, job: options.name }, 'Could not claim job tick; running anyway');
      return true;
    }
  }

  async function tick(): Promise<TickOutcome> {
    if (running) {
      return 'still-running';
    }
    running = true;
    try {
      if (!(await claimTick())) {
        return 'claimed-elsewhere';
      }
      await options.run();
      return 'ran';
    } catch (error) {
      logger.error({ err: error, job: options.name }, 'Scheduled job failed');
      return 'failed';
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start: () => {
      setInterval(() => void tick(), options.intervalMs).unref();
    },
  };
}
