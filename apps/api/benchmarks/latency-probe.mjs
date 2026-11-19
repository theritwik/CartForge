/**
 * Sequential latency of single requests, one at a time, giving exact
 * percentiles without load. With --miss, the catalog cache generation is
 * advanced before every request, so each one is a cache miss.
 *
 *   node benchmarks/latency-probe.mjs --base http://localhost:4100 --samples 300 [--miss]
 */
import { parseArgs } from 'node:util';
import { createClient } from 'redis';
import { scenarios } from './scenarios.mjs';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4100' },
    samples: { type: 'string', default: '300' },
    miss: { type: 'boolean', default: false },
    redis: { type: 'string', default: 'redis://localhost:6380/1' },
    namespace: { type: 'string', default: 'development' },
  },
});
const samples = Number(values.samples);

const redis = values.miss ? await createClient({ url: values.redis }).connect() : null;
const generationKey = `cartforge:${values.namespace}:catalog:generation`;

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

for (const scenario of scenarios) {
  const url = values.base + scenario.path;
  await fetch(url);
  const timings = [];
  for (let index = 0; index < samples; index += 1) {
    if (redis) {
      await redis.incr(generationKey);
    }
    const started = performance.now();
    const response = await fetch(url);
    await response.arrayBuffer();
    timings.push(performance.now() - started);
    if (!response.ok) {
      throw new Error(`${scenario.name} answered ${response.status}`);
    }
  }
  timings.sort((a, b) => a - b);
  const format = (value) => value.toFixed(2);
  console.log(
    `${scenario.name.padEnd(30)} p50 ${format(percentile(timings, 0.5))} ms  ` +
      `p95 ${format(percentile(timings, 0.95))} ms  p99 ${format(percentile(timings, 0.99))} ms`,
  );
}

await redis?.close();
