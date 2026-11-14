import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { publicUserSelect, type PublicUser } from '../users/users.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = env.SESSION_IDLE_TIMEOUT_DAYS * DAY_MS;
const ABSOLUTE_TIMEOUT_MS = env.SESSION_ABSOLUTE_TIMEOUT_DAYS * DAY_MS;
/** Activity extends a session at most this often, so reads do not each cause a write. */
const EXTENSION_INTERVAL_MS = 60 * 60 * 1000;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Only this hash is stored, so a copy of the database does not contain usable tokens. */
function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Idle timeout from the last use, capped by the absolute timeout from creation. */
function sessionExpiry(createdAt: Date, lastUsedAt: Date): Date {
  return new Date(
    Math.min(lastUsedAt.getTime() + IDLE_TIMEOUT_MS, createdAt.getTime() + ABSOLUTE_TIMEOUT_MS),
  );
}

export interface NewSession {
  /** The opaque token for the cookie. It cannot be recovered after this call. */
  token: string;
  expiresAt: Date;
}

export async function createSession(userId: string): Promise<NewSession> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const expiresAt = sessionExpiry(now, now);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export interface ActiveSession {
  sessionId: string;
  user: PublicUser;
  expiresAt: Date;
  /** True when this lookup pushed the expiry forward and the cookie should be reissued. */
  wasExtended: boolean;
}

export async function findActiveSession(token: string): Promise<ActiveSession | null> {
  if (!TOKEN_PATTERN.test(token)) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      user: { select: publicUserSelect },
    },
  });
  if (!session) {
    return null;
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const active = { sessionId: session.id, user: session.user };
  if (now.getTime() - session.lastUsedAt.getTime() < EXTENSION_INTERVAL_MS) {
    return { ...active, expiresAt: session.expiresAt, wasExtended: false };
  }

  const expiresAt = sessionExpiry(session.createdAt, now);
  await prisma.session.updateMany({
    where: { id: session.id },
    data: { lastUsedAt: now, expiresAt },
  });
  return { ...active, expiresAt, wasExtended: true };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}
