import { Router } from 'express';
import { getHealthReport } from './health.service.js';

export const healthRouter = Router();

/**
 * Liveness: the process is up and serving. It does not check PostgreSQL or
 * Redis, so an orchestrator does not restart a healthy process during a
 * dependency outage.
 */
healthRouter.get('/live', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
});

/** Readiness: the API can serve requests, because PostgreSQL and the rate-limit Redis answer. */
healthRouter.get('/', async (_req, res) => {
  const report = await getHealthReport();
  res
    .status(report.status === 'ok' ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json(report);
});
