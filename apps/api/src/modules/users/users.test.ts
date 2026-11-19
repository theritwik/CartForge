import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, resetRedisState, signUp } from '../../../tests/auth-helpers.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

function listUsers(cookie?: string) {
  const listRequest = request(app).get('/api/v1/users');
  return cookie ? listRequest.set('Cookie', cookie) : listRequest;
}

async function setRole(userId: string, role: 'CUSTOMER' | 'ADMIN') {
  await prisma.user.update({ where: { id: userId }, data: { role } });
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

describe('GET /api/v1/users (administrators only)', () => {
  it('rejects a request without a session', async () => {
    const response = await listUsers();

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('forbids a customer', async () => {
    const customer = await signUp();

    const response = await listUsers(customer.cookie);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' },
    });
  });

  it('lists users for an administrator, without password hashes', async () => {
    const admin = await signUp();
    const customer = await signUp();
    await setRole(admin.id, 'ADMIN');

    const response = await listUsers(admin.cookie);
    const body = response.body as { data: Record<string, unknown>[]; meta: object };

    expect(response.status).toBe(200);
    expect(body.data.map((user) => user.id).sort()).toEqual([admin.id, customer.id].sort());
    expect(body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    for (const user of body.data) {
      expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role']);
    }
  });

  it('applies a role change on the next request, without a new login', async () => {
    const user = await signUp();
    expect((await listUsers(user.cookie)).status).toBe(403);

    await setRole(user.id, 'ADMIN');
    expect((await listUsers(user.cookie)).status).toBe(200);

    await setRole(user.id, 'CUSTOMER');
    expect((await listUsers(user.cookie)).status).toBe(403);
  });

  it('validates pagination parameters', async () => {
    const admin = await signUp();
    await setRole(admin.id, 'ADMIN');

    const response = await listUsers(admin.cookie).query({ pageSize: 101 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
