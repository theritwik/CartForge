import { parseCookie } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';

/**
 * In production the cookie is Secure and uses the __Host- prefix, which makes
 * browsers require Secure, Path=/, and no Domain, so a subdomain cannot
 * overwrite it. Plain HTTP in development cannot use either.
 */
export function sessionCookieSettings(isProduction: boolean) {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
  return { name: isProduction ? '__Host-cartforge_session' : 'cartforge_session', options };
}

const { name, options } = sessionCookieSettings(env.NODE_ENV === 'production');

export function readSessionToken(req: Request): string | undefined {
  return parseCookie(req.headers.cookie ?? '')[name];
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(name, token, { ...options, maxAge: Math.max(expiresAt.getTime() - Date.now(), 0) });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(name, options);
}
