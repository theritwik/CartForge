import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRedisState } from '../../tests/auth-helpers.js';
import { redis } from './redis.js';
import { createScheduledJob } from './scheduled-job.js';

const MINUTE_MS = 60_000;

/** A promise the test resolves, standing in for a slow run. */
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  await resetRedisState();
});

afterAll(async () => {
  if (redis.isOpen) {
    await redis.close();
  }
});

describe('createScheduledJob', () => {
  it('runs the job', async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    expect(await createScheduledJob({ name: 'runs', intervalMs: MINUTE_MS, run }).tick()).toBe(
      'ran',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips a tick while the previous run in this process has not finished', async () => {
    const slowRun = deferred();
    const run = vi.fn(() => slowRun.promise);
    const job = createScheduledJob({ name: 'overlap', intervalMs: 1000, run });

    const first = job.tick();
    // The claim has expired by the next tick, so only the in-process guard can stop it.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await job.tick()).toBe('still-running');

    slowRun.resolve();
    expect(await first).toBe('ran');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lets one instance run a tick and the others skip it', async () => {
    const runs = [vi.fn(), vi.fn(), vi.fn()].map((run) => run.mockResolvedValue(undefined));
    // Separate jobs with the same name stand in for the same job on three API instances.
    const instances = runs.map((run) =>
      createScheduledJob({ name: 'shared', intervalMs: MINUTE_MS, run }),
    );

    const outcomes = await Promise.all(instances.map((instance) => instance.tick()));

    expect(outcomes.filter((outcome) => outcome === 'ran')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'claimed-elsewhere')).toHaveLength(2);
    expect(runs.reduce((total, run) => total + run.mock.calls.length, 0)).toBe(1);
  });

  it('runs on every instance while Redis is unavailable', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const instances = [1, 2].map(() =>
      createScheduledJob({ name: 'no-redis', intervalMs: MINUTE_MS, run }),
    );
    await redis.close();

    try {
      expect(await Promise.all(instances.map((instance) => instance.tick()))).toEqual([
        'ran',
        'ran',
      ]);
    } finally {
      await redis.connect();
    }
  });

  it('reports a failed run without throwing, and runs again on a later tick', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('database unavailable'));
    const job = createScheduledJob({ name: 'fails', intervalMs: 1000, run });

    expect(await job.tick()).toBe('failed');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    run.mockResolvedValueOnce(undefined);
    expect(await job.tick()).toBe('ran');
  });
});
