import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

// The upper bound keeps hashing cost predictable.
const newPassword = z.string().min(10, 'Use at least 10 characters').max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword,
  })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
