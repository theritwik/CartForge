import { randomBytes } from 'node:crypto';
import { Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { publicUserSelect, type PublicUser } from '../users/users.service.js';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schemas.js';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password.js';
import { createSession, revokeSession, type NewSession } from './sessions.js';

interface SignedInUser {
  user: PublicUser;
  session: NewSession;
}

// Verified against when no account matches, so that an unknown email takes as
// long to reject as a wrong password.
const decoyPasswordHash = hashPassword(randomBytes(32).toString('base64url'));

/** Creates a customer account and signs it in. The role is never taken from input. */
export async function register(input: RegisterInput): Promise<SignedInUser> {
  const passwordHash = await hashPassword(input.password);

  let user: PublicUser;
  try {
    user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: publicUserSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
      );
    }
    throw error;
  }

  return { user, session: await createSession(user.id) };
}

/**
 * Checks the credentials and starts a new session. Any session the browser
 * already held is revoked, so signing in always issues a fresh token.
 */
export async function login(
  input: LoginInput,
  existingSessionToken: string | undefined,
): Promise<SignedInUser> {
  const account = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true },
  });

  const passwordMatches = await verifyPassword(
    account?.passwordHash ?? (await decoyPasswordHash),
    input.password,
  );
  if (!account || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }

  const { passwordHash, ...user } = account;
  if (passwordNeedsRehash(passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }
  if (existingSessionToken) {
    await revokeSession(existingSessionToken);
  }

  return { user, session: await createSession(user.id) };
}

/**
 * Changes the password after checking the current one. The session making the
 * request stays signed in; every other session of the account is ended, so a
 * stolen session or a device left signed in loses access.
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const account = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(account.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'INCORRECT_PASSWORD', 'The current password is incorrect.', [
      { path: 'currentPassword', message: 'The current password is incorrect' },
    ]);
  }

  // One transaction: the password never changes without the other sessions ending.
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId, id: { not: currentSessionId } } }),
  ]);
}
