import { parseSetCookie } from 'cookie';
import request, { type Response } from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { cacheRedis, redis } from '../src/lib/redis.js';

export const app = createApp();

/** A state-changing request as the web app's own pages would send it. */
export function post(path: string) {
  return request(app).post(path).set('Origin', env.WEB_ORIGIN);
}

export function patch(path: string) {
  return request(app).patch(path).set('Origin', env.WEB_ORIGIN);
}

export function del(path: string) {
  return request(app).delete(path).set('Origin', env.WEB_ORIGIN);
}

/** The session cookie set by a response, if any. */
export function sessionCookieOf(response: Response) {
  const header = response.get('Set-Cookie') ?? [];
  return header
    .map((value) => parseSetCookie(value))
    .find((cookie) => cookie.name.endsWith('session'));
}

export interface SignedUpUser {
  id: string;
  email: string;
  password: string;
  /** Session token as stored in the browser cookie. */
  token: string;
  /** Value for the Cookie request header. */
  cookie: string;
}

let signUpCounter = 0;

export async function signUp(
  overrides: { email?: string; password?: string } = {},
): Promise<SignedUpUser> {
  signUpCounter += 1;
  const credentials = {
    email: overrides.email ?? `customer${signUpCounter}@example.com`,
    password: overrides.password ?? 'correct horse battery',
  };
  const response = await post('/api/v1/auth/register').send({ name: 'Asha Rao', ...credentials });
  const cookie = sessionCookieOf(response);
  if (response.status !== 201 || !cookie?.value) {
    throw new Error(`Sign-up failed with status ${response.status}`);
  }
  const { id } = (response.body as { data: { id: string } }).data;
  return { ...credentials, id, token: cookie.value, cookie: `${cookie.name}=${cookie.value}` };
}

/** Removes every key the tests created: rate-limit counters, and catalog cache entries if the cache is connected. */
export async function resetRedisState(): Promise<void> {
  for (const client of [redis, cacheRedis]) {
    if (!client.isReady) {
      continue;
    }
    for await (const keys of client.scanIterator({ MATCH: `cartforge:${env.NODE_ENV}:*` })) {
      if (keys.length > 0) {
        await client.del(keys);
      }
    }
  }
}
