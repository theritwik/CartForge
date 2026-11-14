import argon2 from 'argon2';

// OWASP's recommended Argon2id configuration: 19 MiB of memory, 2 iterations, 1 thread.
// Raising these later is safe: logins rehash passwords stored with older settings.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}

export function passwordNeedsRehash(passwordHash: string): boolean {
  return argon2.needsRehash(passwordHash, ARGON2_OPTIONS);
}
