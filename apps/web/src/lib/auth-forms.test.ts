import { describe, expect, it } from 'vitest';
import { fieldErrorsFrom, loginFormSchema, registerFormSchema } from './auth-forms';

describe('registerFormSchema', () => {
  it('accepts a valid registration and trims the name and email', () => {
    const result = registerFormSchema.parse({
      name: ' Asha Rao ',
      email: ' asha@example.com ',
      password: 'correct horse battery',
    });

    expect(result).toMatchObject({ name: 'Asha Rao', email: 'asha@example.com' });
  });

  it('reports one message per invalid field', () => {
    const result = registerFormSchema.safeParse({ name: '', email: 'nope', password: 'short' });

    expect(result.success).toBe(false);
    expect(result.error && fieldErrorsFrom(result.error)).toEqual({
      name: 'Enter your name',
      email: 'Enter a valid email address',
      password: 'Use at least 10 characters',
    });
  });
});

describe('loginFormSchema', () => {
  it('requires an email and a password but does not enforce the password length', () => {
    expect(loginFormSchema.safeParse({ email: 'asha@example.com', password: 'x' }).success).toBe(
      true,
    );
    expect(loginFormSchema.safeParse({ email: 'asha@example.com', password: '' }).success).toBe(
      false,
    );
  });
});
