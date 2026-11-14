'use client';

import { loginFormSchema } from '@/lib/auth-forms';
import { FormField } from './form-field';
import { FormError, SubmitButton } from './form-parts';
import { useAuthForm } from './use-auth-form';

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const { fieldErrors, formError, isSubmitting, handleSubmit } = useAuthForm({
    schema: loginFormSchema,
    endpoint: '/auth/login',
    redirectTo,
  });

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
      <FormError message={formError} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.password}
      />
      <SubmitButton isSubmitting={isSubmitting} label="Sign in" submittingLabel="Signing in…" />
    </form>
  );
}
