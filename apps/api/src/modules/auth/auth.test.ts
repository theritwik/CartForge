import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  app,
  resetRedisState,
  post,
  sessionCookieOf,
  signUp,
} from '../../../tests/auth-helpers.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { sessionCookieSettings } from './session-cookie.js';
import { deleteExpiredSessions } from './sessions.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const validRegistration = {
  name: 'Asha Rao',
  email: 'asha@example.com',
  password: 'correct horse battery',
};

function getProfile(cookie?: string) {
  const profileRequest = request(app).get('/api/v1/users/me');
  return cookie ? profileRequest.set('Cookie', cookie) : profileRequest;
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
  await resetRedisState();
});

afterAll(async () => {
  await redis.close();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/register', () => {
  it('creates a customer account, signs it in, and returns only public fields', async () => {
    const response = await post('/api/v1/auth/register').send(validRegistration);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String) as unknown,
        name: 'Asha Rao',
        email: 'asha@example.com',
        role: 'CUSTOMER',
        createdAt: expect.any(String) as unknown,
      },
    });
    expect(sessionCookieOf(response)?.value).toBeTruthy();
    expect(response.get('Cache-Control')).toBe('no-store');
  });

  it('stores an Argon2id hash, never the password', async () => {
    await post('/api/v1/auth/register').send(validRegistration);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: validRegistration.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.passwordHash).not.toContain(validRegistration.password);
  });

  it('ignores a role supplied by the client', async () => {
    const response = await post('/api/v1/auth/register').send({
      ...validRegistration,
      role: 'ADMIN',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { role: 'CUSTOMER' } });
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(0);
  });

  it('stores the email in lowercase', async () => {
    const response = await post('/api/v1/auth/register').send({
      ...validRegistration,
      email: '  Asha@Example.COM ',
    });

    expect(response.body).toMatchObject({ data: { email: 'asha@example.com' } });
  });

  it('rejects an email that is already registered, regardless of case', async () => {
    await post('/api/v1/auth/register').send(validRegistration);

    const response = await post('/api/v1/auth/register').send({
      ...validRegistration,
      email: 'ASHA@example.com',
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'EMAIL_ALREADY_REGISTERED' } });
    expect(sessionCookieOf(response)).toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ['email', { email: 'not-an-email' }],
    ['email', { email: '' }],
    ['password', { password: 'too short' }],
    ['password', { password: 'x'.repeat(129) }],
    ['password', { password: undefined }],
    ['name', { name: '   ' }],
    ['name', { name: 'x'.repeat(101) }],
  ])('rejects an invalid %s', async (path, override) => {
    const response = await post('/api/v1/auth/register').send({
      ...validRegistration,
      ...override,
    });
    const body = response.body as { error: { code: string; details: { path: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((detail) => detail.path)).toEqual([path]);
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects a body that is not valid JSON', async () => {
    const response = await post('/api/v1/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in with the correct credentials', async () => {
    const user = await signUp();

    const response = await post('/api/v1/auth/login').send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { id: user.id, email: user.email } });
    expect(response.body).not.toHaveProperty('data.passwordHash');
    expect(sessionCookieOf(response)?.value).toBeTruthy();
  });

  it('accepts the email in any case', async () => {
    const user = await signUp({ email: 'asha@example.com' });

    const response = await post('/api/v1/auth/login').send({
      email: 'Asha@Example.com',
      password: user.password,
    });

    expect(response.status).toBe(200);
  });

  it('gives the same response for a wrong password and an unknown email', async () => {
    const user = await signUp();

    const wrongPassword = await post('/api/v1/auth/login').send({
      email: user.email,
      password: 'not the password',
    });
    const unknownEmail = await post('/api/v1/auth/login').send({
      email: 'nobody@example.com',
      password: user.password,
    });

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
    });
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(sessionCookieOf(wrongPassword)).toBeUndefined();
  });

  it('replaces the session the browser already had', async () => {
    const user = await signUp();

    const response = await post('/api/v1/auth/login')
      .set('Cookie', user.cookie)
      .send({ email: user.email, password: user.password });
    const newCookie = sessionCookieOf(response);

    expect(newCookie?.value).not.toBe(user.token);
    expect((await getProfile(user.cookie)).status).toBe(401);
    expect((await getProfile(`${newCookie?.name}=${newCookie?.value}`)).status).toBe(200);
    expect(await prisma.session.count()).toBe(1);
  });

  it('blocks further attempts for an email after five failures, even with the right password', async () => {
    const user = await signUp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await post('/api/v1/auth/login').send({
        email: user.email,
        password: 'wrong',
      });
      expect(failed.status).toBe(401);
    }

    const response = await post('/api/v1/auth/login').send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
    expect(Number(response.get('Retry-After'))).toBeGreaterThan(0);
    expect(sessionCookieOf(response)).toBeUndefined();
  });

  it('clears the failure count after a successful login', async () => {
    const user = await signUp();
    const attempt = (password: string) =>
      post('/api/v1/auth/login').send({ email: user.email, password });

    for (let round = 0; round < 2; round += 1) {
      for (let failure = 0; failure < 4; failure += 1) {
        expect((await attempt('wrong')).status).toBe(401);
      }
      expect((await attempt(user.password)).status).toBe(200);
    }
  });

  it('cannot escape the per-address limit by sending a different X-Forwarded-For each time', async () => {
    // The web app's proxy forwards this header from the browser unchanged, so it is
    // only trusted when a proxy in front of the web app sets it (TRUST_PROXY_HOPS).
    const attempt = (index: number) =>
      post('/api/v1/auth/login')
        .set('X-Forwarded-For', `198.51.100.${index}`)
        .send({ email: `someone${index}@example.com`, password: 'wrong' });

    for (let index = 0; index < 30; index += 1) {
      expect((await attempt(index)).status).toBe(401);
    }

    expect((await attempt(30)).status).toBe(429);
  });
});

describe('rate limiting while Redis is unavailable', () => {
  it('allows the login and logs the failure without the email, password, or token', async () => {
    const user = await signUp();
    const logged = vi.spyOn(logger, 'error');
    await redis.close();

    let response;
    try {
      response = await post('/api/v1/auth/login').send({
        email: user.email,
        password: user.password,
      });
    } finally {
      await redis.connect();
    }

    expect(response.status).toBe(200);
    const logOutput = inspect(logged.mock.calls, { depth: 8 });
    logged.mockRestore();
    expect(logOutput).toContain('Rate limiter unavailable');
    expect(logOutput).toContain('login:email');
    expect(logOutput).not.toContain(user.email);
    expect(logOutput).not.toContain(user.password);
    expect(logOutput).not.toContain(sessionCookieOf(response)?.value);
  });
});

describe('session cookie', () => {
  it('is HttpOnly, SameSite=Lax, host-only, and expires with the idle timeout', async () => {
    const cookie = sessionCookieOf(await post('/api/v1/auth/register').send(validRegistration));

    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(cookie?.domain).toBeUndefined();
    expect(cookie?.maxAge).toBeGreaterThan(7 * 24 * 60 * 60 - 60);
    expect(cookie?.maxAge).toBeLessThanOrEqual(7 * 24 * 60 * 60);
  });

  it('is Secure and uses the __Host- prefix in production', () => {
    expect(sessionCookieSettings(true)).toEqual({
      name: '__Host-cartforge_session',
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    });
  });

  it('is not Secure in development, where the site is served over plain HTTP', () => {
    expect(sessionCookieSettings(false)).toMatchObject({
      name: 'cartforge_session',
      options: { httpOnly: true, secure: false },
    });
  });

  it('carries a 256-bit random token, of which only the SHA-256 hash is stored', async () => {
    const first = await signUp();
    const second = await signUp();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);

    const stored = await prisma.session.findFirstOrThrow({ where: { userId: first.id } });
    expect(stored.tokenHash).toBe(createHash('sha256').update(first.token).digest('hex'));
    expect(stored.tokenHash).not.toBe(first.token);
  });
});

describe('GET /api/v1/users/me', () => {
  it('returns the signed-in user', async () => {
    const user = await signUp();

    const response = await getProfile(user.cookie);

    expect(response.status).toBe(200);
    expect(Object.keys((response.body as { data: object }).data).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'role',
    ]);
    expect(response.body).toMatchObject({ data: { id: user.id, email: user.email } });
    expect(response.get('Cache-Control')).toBe('no-store');
  });

  it('returns each user only their own profile', async () => {
    const first = await signUp();
    const second = await signUp();

    expect((await getProfile(first.cookie)).body).toMatchObject({ data: { id: first.id } });
    expect((await getProfile(second.cookie)).body).toMatchObject({ data: { id: second.id } });
  });

  it('rejects a request without a session', async () => {
    const response = await getProfile();

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it.each([
    ['a malformed token', 'not-a-real-token'],
    ['a well-formed token that was never issued', 'A'.repeat(43)],
  ])('rejects %s and clears the cookie', async (_description, token) => {
    const response = await getProfile(`cartforge_session=${token}`);

    expect(response.status).toBe(401);
    expect(sessionCookieOf(response)).toMatchObject({ value: '' });
  });
});

describe('session expiry', () => {
  async function sessionOf(userId: string) {
    return prisma.session.findFirstOrThrow({ where: { userId } });
  }

  it('rejects an expired session and removes it', async () => {
    const user = await signUp();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await getProfile(user.cookie);

    expect(response.status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it.each([
    ['idle for longer than 7 days', { lastUsedDaysAgo: 8, createdDaysAgo: 10 }],
    ['older than 30 days despite recent use', { lastUsedDaysAgo: 0, createdDaysAgo: 31 }],
  ])('rejects a session that has been %s', async (_description, age) => {
    const user = await signUp();
    const createdAt = new Date(Date.now() - age.createdDaysAgo * DAY_MS);
    const lastUsedAt = new Date(Date.now() - age.lastUsedDaysAgo * DAY_MS - 10 * 60 * 1000);
    await prisma.session.updateMany({
      data: {
        createdAt,
        lastUsedAt,
        // What the session's expiry would have been set to at its last use.
        expiresAt: new Date(
          Math.min(lastUsedAt.getTime() + 7 * DAY_MS, createdAt.getTime() + 30 * DAY_MS),
        ),
      },
    });

    expect((await getProfile(user.cookie)).status).toBe(401);
  });

  it('does not write to the session when it was used within the last hour', async () => {
    const user = await signUp();
    const before = await sessionOf(user.id);

    const response = await getProfile(user.cookie);

    expect(response.status).toBe(200);
    expect(sessionCookieOf(response)).toBeUndefined();
    expect(await sessionOf(user.id)).toEqual(before);
  });

  it('extends an active session and reissues the cookie after an hour of use', async () => {
    const user = await signUp();
    const twoHoursAgo = new Date(Date.now() - 2 * HOUR_MS);
    await prisma.session.updateMany({
      data: { lastUsedAt: twoHoursAgo, expiresAt: new Date(Date.now() + HOUR_MS) },
    });

    const response = await getProfile(user.cookie);
    const session = await sessionOf(user.id);

    expect(response.status).toBe(200);
    expect(session.lastUsedAt.getTime()).toBeGreaterThan(twoHoursAgo.getTime());
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY_MS);
    expect(sessionCookieOf(response)).toMatchObject({ value: user.token, httpOnly: true });
  });

  it('never extends a session beyond 30 days from when it was created', async () => {
    const user = await signUp();
    const createdAt = new Date(Date.now() - 29 * DAY_MS);
    await prisma.session.updateMany({
      data: {
        createdAt,
        lastUsedAt: new Date(Date.now() - 2 * HOUR_MS),
        expiresAt: new Date(Date.now() + HOUR_MS),
      },
    });

    await getProfile(user.cookie);

    const session = await sessionOf(user.id);
    expect(session.expiresAt.getTime()).toBe(createdAt.getTime() + 30 * DAY_MS);
  });

  it('sweeps expired sessions without touching active ones', async () => {
    const expired = await signUp();
    const active = await signUp();
    await prisma.session.updateMany({
      where: { userId: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await deleteExpiredSessions()).toBe(1);
    expect((await getProfile(active.cookie)).status).toBe(200);
  });
});

describe('logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const user = await signUp();

    const response = await post('/api/v1/auth/logout').set('Cookie', user.cookie);

    expect(response.status).toBe(204);
    expect(sessionCookieOf(response)).toMatchObject({ value: '' });
    expect(await prisma.session.count()).toBe(0);
    // The old cookie is useless even if it was copied before logout.
    expect((await getProfile(user.cookie)).status).toBe(401);
  });

  it('succeeds when there is no session', async () => {
    expect((await post('/api/v1/auth/logout')).status).toBe(204);
  });

  it('logs out every session of the user, and nobody else, with logout-all', async () => {
    const user = await signUp();
    const otherUser = await signUp();
    const secondDevice = sessionCookieOf(
      await post('/api/v1/auth/login').send({ email: user.email, password: user.password }),
    );
    const secondDeviceCookie = `${secondDevice?.name}=${secondDevice?.value}`;

    const response = await post('/api/v1/auth/logout-all').set('Cookie', user.cookie);

    expect(response.status).toBe(204);
    expect((await getProfile(user.cookie)).status).toBe(401);
    expect((await getProfile(secondDeviceCookie)).status).toBe(401);
    expect((await getProfile(otherUser.cookie)).status).toBe(200);
  });

  it('requires a session for logout-all', async () => {
    expect((await post('/api/v1/auth/logout-all')).status).toBe(401);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  const NEW_PASSWORD = 'a brand new passphrase';

  function changePassword(cookie: string, body: object) {
    return post('/api/v1/auth/change-password').set('Cookie', cookie).send(body);
  }

  function logIn(email: string, password: string) {
    return post('/api/v1/auth/login').send({ email, password });
  }

  it('replaces the password with a new Argon2id hash', async () => {
    const user = await signUp();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const response = await changePassword(user.cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(response.status).toBe(204);
    expect(after.passwordHash).toMatch(/^\$argon2id\$/);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect((await logIn(user.email, user.password)).status).toBe(401);
    expect((await logIn(user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('keeps the current session and ends every other session of the account', async () => {
    const user = await signUp();
    const otherUser = await signUp();
    const otherDevice = sessionCookieOf(await logIn(user.email, user.password));
    const otherDeviceCookie = `${otherDevice?.name}=${otherDevice?.value}`;

    await changePassword(user.cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });

    expect((await getProfile(user.cookie)).status).toBe(200);
    expect((await getProfile(otherDeviceCookie)).status).toBe(401);
    expect((await getProfile(otherUser.cookie)).status).toBe(200);
  });

  it('rejects a wrong current password and changes nothing', async () => {
    const user = await signUp();
    const otherDevice = sessionCookieOf(await logIn(user.email, user.password));

    const response = await changePassword(user.cookie, {
      currentPassword: 'not the password',
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'INCORRECT_PASSWORD', details: [{ path: 'currentPassword' }] },
    });
    expect((await logIn(user.email, user.password)).status).toBe(200);
    expect((await getProfile(`${otherDevice?.name}=${otherDevice?.value}`)).status).toBe(200);
  });

  it.each([
    ['a new password that is too short', { newPassword: 'short' }, 'newPassword'],
    [
      'a new password equal to the current one',
      { newPassword: 'correct horse battery' },
      'newPassword',
    ],
    ['a missing current password', { currentPassword: undefined }, 'currentPassword'],
  ])('rejects %s', async (_description, override, path) => {
    const user = await signUp();

    const response = await changePassword(user.cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
      ...override,
    });
    const body = response.body as { error: { code: string; details: { path: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((detail) => detail.path)).toEqual([path]);
  });

  it('requires a session', async () => {
    const response = await post('/api/v1/auth/change-password').send({
      currentPassword: 'correct horse battery',
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(401);
  });

  it('blocks further attempts after five wrong current passwords', async () => {
    const user = await signUp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await changePassword(user.cookie, {
        currentPassword: 'wrong',
        newPassword: NEW_PASSWORD,
      });
      expect(failed.status).toBe(400);
    }

    const response = await changePassword(user.cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(429);
    expect((await logIn(user.email, user.password)).status).toBe(200);
  });
});

describe('CSRF protection', () => {
  const credentials = { email: validRegistration.email, password: validRegistration.password };

  it('rejects a state-changing request with no Origin or Referer', async () => {
    const response = await request(app).post('/api/v1/auth/login').send(credentials);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_ORIGIN' } });
  });

  it.each(['https://evil.example', 'http://localhost:3001', 'null'])(
    'rejects a request from the origin %s',
    async (origin) => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', origin)
        .send(validRegistration);

      expect(response.status).toBe(403);
      expect(await prisma.user.count()).toBe(0);
    },
  );

  it('does not log a user out on a cross-site request', async () => {
    const user = await signUp();

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', user.cookie);

    expect(response.status).toBe(403);
    expect((await getProfile(user.cookie)).status).toBe(200);
  });

  it('accepts the Referer header when Origin is absent', async () => {
    await signUp({ email: credentials.email, password: credentials.password });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Referer', 'http://localhost:3000/login')
      .send(credentials);

    expect(response.status).toBe(200);
  });

  it('rejects a form-encoded body, which a cross-site HTML form could send', async () => {
    const response = await post('/api/v1/auth/login').type('form').send(credentials);

    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
  });

  it('does not require an Origin for read-only requests', async () => {
    expect((await request(app).get('/api/v1/products')).status).toBe(200);
  });
});
