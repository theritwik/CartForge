/**
 * Load test of the public catalog endpoints with autocannon.
 *
 *   node benchmarks/run-catalog-benchmark.mjs --base http://localhost:4100 --label baseline --out results.json
 *
 * Each scenario gets a warm-up (which also fills the cache, when there is one)
 * and then a measured run with a fixed number of connections and duration.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import autocannon from 'autocannon';
import { scenarios } from './scenarios.mjs';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4100' },
    label: { type: 'string', default: 'run' },
    out: { type: 'string' },
    connections: { type: 'string', default: '10' },
    duration: { type: 'string', default: '10' },
    only: { type: 'string' },
  },
});
const connections = Number(values.connections);
const duration = Number(values.duration);

function run(options) {
  return new Promise((resolve, reject) => {
    autocannon(options, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

const results = [];
for (const scenario of scenarios.filter(
  (candidate) => !values.only || candidate.name.includes(values.only),
)) {
  const url = values.base + scenario.path;
  const probe = await fetch(url);
  if (!probe.ok) {
    throw new Error(`${scenario.name}: ${url} answered ${probe.status}`);
  }
  await run({ url, connections, duration: 3 });
  const result = await run({ url, connections, duration });
  const summary = {
    scenario: scenario.name,
    path: scenario.path,
    connections,
    durationSeconds: duration,
    requests: result.requests.total,
    requestsPerSecond: Math.round(result.requests.average),
    latencyMs: {
      p50: result.latency.p50,
      p90: result.latency.p90,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
      mean: Number(result.latency.average.toFixed(2)),
    },
    errors: result.errors + result.timeouts,
    non2xx: result.non2xx,
  };
  results.push(summary);
  console.log(
    `${summary.scenario.padEnd(30)} ${String(summary.requestsPerSecond).padStart(6)} req/s  ` +
      `p50 ${summary.latencyMs.p50} ms  p97.5 ${summary.latencyMs.p97_5} ms  p99 ${summary.latencyMs.p99} ms  ` +
      `errors ${summary.errors}  non-2xx ${summary.non2xx}`,
  );
}

if (values.out) {
  writeFileSync(values.out, JSON.stringify({ label: values.label, results }, null, 2));
}
