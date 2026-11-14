/**
 * Creates an administrator, or promotes an existing account. There is no API
 * for this: administrators cannot be created or chosen through registration.
 *
 *   pnpm admin:create
 *
 * The password is typed at a hidden prompt, or read from standard input when it
 * is piped in (for example from a password manager). It is never taken from a
 * command-line argument or an environment variable, so it cannot end up in
 * shell history or a process listing. ADMIN_NAME and ADMIN_EMAIL may be set to
 * skip those two prompts.
 */
import { createInterface } from 'node:readline/promises';
import { text } from 'node:stream/consumers';
import { z } from 'zod';
import { prisma } from '../src/lib/prisma.js';
import { registerSchema } from '../src/modules/auth/auth.schemas.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { revokeAllSessions } from '../src/modules/auth/sessions.js';

const isInteractive = process.stdin.isTTY;

async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question(question);
  } finally {
    prompt.close();
  }
}

/** Reads a line from the terminal without echoing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let typed = '';
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          finish();
          resolve(typed);
          return;
        }
        if (character === '\u0003') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        typed =
          character === '\u007f' || character === '\b' ? typed.slice(0, -1) : typed + character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function readPassword(): Promise<string> {
  if (!isInteractive) {
    return (await text(process.stdin)).replace(/\r?\n$/, '');
  }
  const password = await askHidden('Password (at least 10 characters, not shown): ');
  if ((await askHidden('Repeat password: ')) !== password) {
    throw new Error('The passwords do not match.');
  }
  return password;
}

async function readDetail(
  variable: 'ADMIN_NAME' | 'ADMIN_EMAIL',
  question: string,
): Promise<string> {
  const fromEnvironment = process.env[variable];
  if (fromEnvironment) {
    return fromEnvironment;
  }
  if (!isInteractive) {
    throw new Error(`Set ${variable} when the password is piped in.`);
  }
  return ask(question);
}

try {
  if (process.env.ADMIN_PASSWORD !== undefined) {
    throw new Error(
      'ADMIN_PASSWORD is not accepted, because it would be saved in shell history. Run the command without it to be prompted.',
    );
  }

  const name = await readDetail('ADMIN_NAME', 'Name: ');
  const email = await readDetail('ADMIN_EMAIL', 'Email: ');
  const admin = registerSchema.safeParse({ name, email, password: await readPassword() });
  if (!admin.success) {
    throw new Error(z.prettifyError(admin.error));
  }

  const account = {
    name: admin.data.name,
    passwordHash: await hashPassword(admin.data.password),
    role: 'ADMIN' as const,
  };
  const user = await prisma.user.upsert({
    where: { email: admin.data.email },
    update: account,
    create: { ...account, email: admin.data.email },
    select: { id: true, email: true },
  });
  // An existing account now has a new password and role, so its old sessions end.
  await revokeAllSessions(user.id);
  console.log(`Administrator ${user.email} is ready.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
