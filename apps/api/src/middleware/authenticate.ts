import type { UserRole } from '@cartforge/db';
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from '../modules/auth/session-cookie.js';
import { findActiveSession } from '../modules/auth/sessions.js';

/** Requires a valid session. Responds 401 otherwise. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  const activeSession = token ? await findActiveSession(token) : null;

  if (!token || !activeSession) {
    if (token) {
      clearSessionCookie(res);
    }
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }

  if (activeSession.wasExtended) {
    setSessionCookie(res, token, activeSession.expiresAt);
  }
  req.auth = { user: activeSession.user, sessionId: activeSession.sessionId };
  next();
};

/** Requires one of the given roles. Must run after requireAuth. */
export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!allowedRoles.includes(authenticatedUser(req).role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
    }
    next();
  };
}

/** The signed-in user for a route protected by requireAuth. */
export function authenticatedUser(req: Request) {
  if (!req.auth) {
    throw new Error('authenticatedUser() was called on a route without requireAuth.');
  }
  return req.auth.user;
}
