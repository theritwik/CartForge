import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, post, resetRedisState, signUp } from '../../tests/auth-helpers.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

const WRITE_LIMIT = env.API_WRITE_LIMIT_PER_MINUTE;

/** A state-changing request that needs no account and changes nothing. */
const harmlessWrite = () => post('/api/v1/auth/logout');

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

describe('write limit per client address', () => {
  it('answers 429 with Retry-After once the limit is passed', async () => {
    for (let index = 0; index < WRITE_LIMIT; index += 1) {
      expect((await harmlessWrite()).status).toBe(204);
    }

    const response = await harmlessWrite();

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
    expect(Number(response.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('does not limit reads, health checks, or the payment webhook', async () => {
    for (let index = 0; index <= WRITE_LIMIT; index += 1) {
      await harmlessWrite();
    }
    expect((await harmlessWrite()).status).toBe(429);

    expect((await request(app).get('/api/v1/products')).status).toBe(200);
    expect((await request(app).get('/health')).status).toBe(200);
    // Rejected for its signature, not for the rate limit: Stripe is not a browser.
    const webhook = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=invalid')
      .send('{}');
    expect(webhook.status).toBe(400);
  });

  it('allows writes while Redis is unavailable', async () => {
    await redis.close();
    try {
      for (let index = 0; index <= WRITE_LIMIT; index += 1) {
        expect((await harmlessWrite()).status).toBe(204);
      }
    } finally {
      await redis.connect();
    }
  });
});

describe('write limit per administrator', () => {
  it('limits each administrator separately', async () => {
    const [first, second] = [await signUp(), await signUp()];
    await prisma.user.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { role: 'ADMIN' },
    });
    const createCategory = (cookie: string, index: number) =>
      post('/api/v1/admin/categories')
        .set('Cookie', cookie)
        .send({ name: `Category ${index}`, slug: `category-${index}` });

    for (let index = 0; index < 60; index += 1) {
      expect((await createCategory(first.cookie, index)).status).toBe(201);
    }

    expect((await createCategory(first.cookie, 60)).status).toBe(429);
    expect((await createCategory(second.cookie, 61)).status).toBe(201);
    // Reads are not limited.
    const list = await request(app).get('/api/v1/admin/categories').set('Cookie', first.cookie);
    expect(list.status).toBe(200);
  });
});

describe('request body size', () => {
  it('rejects bodies over 10 KB outside the admin API', async () => {
    const response = await post('/api/v1/auth/login').send({
      email: 'someone@example.com',
      password: 'x'.repeat(20_000),
    });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});
