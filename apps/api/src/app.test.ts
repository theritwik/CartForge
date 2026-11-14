import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const app = createApp();

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  if (redis.isOpen) {
    await redis.close();
  }
  await prisma.$disconnect();
});

describe('GET /health', () => {
  it('reports ok when PostgreSQL and Redis are reachable', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('is also served under the versioned API prefix', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });
});

describe('test database isolation', () => {
  it('connects to the test database, not the development database', async () => {
    const [connection] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;

    expect(connection?.name).toMatch(/_test$/);
  });
});

describe('unknown routes', () => {
  it('returns the standard error envelope', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /health with a dependency down', () => {
  it('reports degraded with 503 when Redis is unreachable', async () => {
    await redis.close();

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'degraded',
      checks: { database: 'up', redis: 'down' },
    });
  });
});
