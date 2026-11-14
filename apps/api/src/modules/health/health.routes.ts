import { Router } from 'express';
import { getHealthReport } from './health.service.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const report = await getHealthReport();
  res
    .status(report.status === 'ok' ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json(report);
});
