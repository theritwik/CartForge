import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { verifyRequestOrigin } from './middleware/verify-origin.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { categoriesRouter, productsRouter } from './modules/products/products.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Responses that depend on who is signed in must never be stored by a cache. */
const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '10kb' }));

  // Unversioned path for infrastructure probes; versioned path is reachable through the web proxy.
  app.use('/health', healthRouter);
  app.use('/api/v1/health', healthRouter);

  app.use('/api', verifyRequestOrigin);
  app.use('/api/v1/auth', noStore, authRouter);
  app.use('/api/v1/users', noStore, usersRouter);
  app.use('/api/v1/cart', noStore, cartRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/categories', categoriesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
