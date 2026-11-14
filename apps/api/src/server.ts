import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

// Not awaited: the client keeps retrying in the background, and /health reports Redis as down meanwhile.
redis.connect().catch((error: unknown) => {
  logger.error({ err: error }, 'Initial Redis connection failed');
});

const server = createApp().listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'API listening');
});

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
