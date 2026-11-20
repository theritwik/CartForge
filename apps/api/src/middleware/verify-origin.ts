import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method);
}

function originOfReferer(referer: string | undefined): string | undefined {
  return referer && URL.canParse(referer) ? new URL(referer).origin : undefined;
}

/**
 * CSRF protection for cookie-authenticated requests. A state-changing request
 * must come from the web app's own origin and, if it has a body, be JSON, which
 * a cross-site HTML form cannot send.
 */
export const verifyRequestOrigin: RequestHandler = (req, _res, next) => {
  if (isSafeMethod(req.method)) {
    next();
    return;
  }

  const requestOrigin = req.get('origin') ?? originOfReferer(req.get('referer'));
  if (requestOrigin !== env.WEB_ORIGIN) {
    throw new AppError(403, 'INVALID_ORIGIN', 'This request did not come from the CartForge site.');
  }
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    Number(req.headers['content-length'] ?? 0) > 0;
  if (hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request bodies must be JSON.');
  }

  next();
};
