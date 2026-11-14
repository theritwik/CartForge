'use client';

import { registerFormSchema } from '@/lib/auth-forms';
import { FormField } from './form-field';
import { FormError, SubmitButton } from './form-parts';
import { useAuthForm } from './use-auth-form';

export function RegisterForm({ redirectTo }: { redirectTo: string }) {
  const { fieldErrors, formError, isSubmitting, handleSubmit } = useAuthForm({
    schema: registerFormSchema,
    endpoint: '/auth/register',
    redirectTo,
  });

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
      <FormError message={formError} />
      <FormField
        name="name"
        label="Name"
        type="text"
        autoComplete="name"
        required
        maxLength={100}
        error={fieldErrors.name}
      />
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
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={fieldErrors.password}
      />
      <SubmitButton
        isSubmitting={isSubmitting}
        label="Create account"
        submittingLabel="Creating account…"
      />
    </form>
  );
}
