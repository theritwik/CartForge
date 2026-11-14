import type { Request, Response } from 'express';
import { consumeRateLimit, resetRateLimit, type RateLimit } from '../../lib/rate-limit.js';
import { authenticatedUser } from '../../middleware/authenticate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { login, register } from './auth.service.js';
import { clearSessionCookie, readSessionToken, setSessionCookie } from './session-cookie.js';
import { revokeAllSessions, revokeSession } from './sessions.js';

const FIFTEEN_MINUTES = 15 * 60;
const LOGIN_LIMIT_PER_IP: RateLimit = {
  bucket: 'login:ip',
  limit: 30,
  windowSeconds: FIFTEEN_MINUTES,
};
const LOGIN_LIMIT_PER_EMAIL: RateLimit = {
  bucket: 'login:email',
  limit: 5,
  windowSeconds: FIFTEEN_MINUTES,
};
const REGISTER_LIMIT_PER_IP: RateLimit = {
  bucket: 'register:ip',
  limit: 10,
  windowSeconds: 60 * 60,
};

function clientAddress(req: Request): string {
  return req.ip ?? 'unknown';
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  await consumeRateLimit(REGISTER_LIMIT_PER_IP, clientAddress(req));

  const { user, session } = await register(input);
  setSessionCookie(res, session.token, session.expiresAt);
  res.status(201).json({ data: user });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  await consumeRateLimit(LOGIN_LIMIT_PER_IP, clientAddress(req));
  await consumeRateLimit(LOGIN_LIMIT_PER_EMAIL, input.email);

  const { user, session } = await login(input, readSessionToken(req));
  await resetRateLimit(LOGIN_LIMIT_PER_EMAIL, input.email);
  setSessionCookie(res, session.token, session.expiresAt);
  res.json({ data: user });
}

/** Succeeds whether or not a session exists, so signing out twice is not an error. */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const token = readSessionToken(req);
  if (token) {
    await revokeSession(token);
  }
  clearSessionCookie(res);
  res.status(204).end();
}

export async function logoutEverywhereHandler(req: Request, res: Response): Promise<void> {
  await revokeAllSessions(authenticatedUser(req).id);
  clearSessionCookie(res);
  res.status(204).end();
}
