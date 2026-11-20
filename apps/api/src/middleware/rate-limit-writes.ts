import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { consumeRateLimit, type RateLimit } from '../lib/rate-limit.js';
import { authenticatedUser } from './authenticate.js';
import { isSafeMethod } from './verify-origin.js';

const WRITES_PER_ADDRESS: RateLimit = {
  bucket: 'api-write:ip',
  limit: env.API_WRITE_LIMIT_PER_MINUTE,
  windowSeconds: 60,
};

const ADMIN_WRITES_PER_USER: RateLimit = {
  bucket: 'admin-write:user',
  limit: 60,
  windowSeconds: 60,
};

/**
 * Limits state-changing API requests per client address. Reads are not limited
 * here: pages rendered by the web app all reach the API from one address.
 */
export const limitWritesPerAddress: RequestHandler = async (req, _res, next) => {
  if (!isSafeMethod(req.method)) {
    await consumeRateLimit(WRITES_PER_ADDRESS, req.ip ?? 'unknown');
  }
  next();
};

/** Limits each administrator's changes. Must run after requireAuth. */
export const limitAdminWrites: RequestHandler = async (req, _res, next) => {
  if (!isSafeMethod(req.method)) {
    await consumeRateLimit(ADMIN_WRITES_PER_USER, authenticatedUser(req).id);
  }
  next();
};
