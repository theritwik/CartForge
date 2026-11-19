import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { isPaymentSimulator } from './lib/stripe.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { deleteExpiredSessions } from './modules/auth/sessions.js';
import { expireOverdueOrders } from './modules/orders/orders.service.js';
import { refundPendingPayments } from './modules/payments/payments.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const ORDER_EXPIRY_INTERVAL_MS = 60 * 1000;
const REFUND_RETRY_INTERVAL_MS = 60 * 1000;

// Not awaited: the client keeps retrying in the background, and /health reports Redis as down meanwhile.
redis.connect().catch((error: unknown) => {
  logger.error({ err: error }, 'Initial Redis connection failed');
});

const server = createApp().listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'API listening');
  if (isPaymentSimulator) {
    logger.warn('No Stripe key configured: payments use the local development simulator');
  }
});

// Expired sessions are already rejected on use; this only removes the leftover rows.
setInterval(() => {
  deleteExpiredSessions().catch((error: unknown) => {
    logger.error({ err: error }, 'Expired session sweep failed');
  });
}, SESSION_SWEEP_INTERVAL_MS).unref();

// Returns the stock held by unpaid orders whose reservation has run out.
setInterval(() => {
  expireOverdueOrders().catch((error: unknown) => {
    logger.error({ err: error }, 'Order expiry sweep failed');
  });
}, ORDER_EXPIRY_INTERVAL_MS).unref();

// Retries refunds owed for payments that arrived after their order could no longer be fulfilled.
setInterval(() => {
  refundPendingPayments().catch((error: unknown) => {
    logger.error({ err: error }, 'Refund retry run failed');
  });
}, REFUND_RETRY_INTERVAL_MS).unref();

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');

  setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    void Promise.allSettled([prisma.$disconnect(), redis.isOpen ? redis.close() : undefined]).then(
      () => process.exit(0),
    );
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
