import { z } from 'zod';

// These mirror the API's rules to give immediate feedback. The API validates again.
const email = z.string().trim().pipe(z.email('Enter a valid email address'));

export const loginFormSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const registerFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use 100 characters or fewer'),
  email,
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(128, 'Use 128 characters or fewer'),
});

export type FieldErrors = Record<string, string>;

/** The first message for each field, keyed by field name. */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.');
    errors[field] ??= issue.message;
  }
  return errors;
}
