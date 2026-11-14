'use client';

import { useState, type SubmitEvent } from 'react';
import { callApi } from '@/lib/api-client';
import { changePasswordFormSchema, fieldErrorsFrom, type FieldErrors } from '@/lib/auth-forms';
import { FormField } from './form-field';
import { FormError, SubmitButton } from './form-parts';

export function ChangePasswordForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChanged, setIsChanged] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(undefined);
    setIsChanged(false);

    const input = changePasswordFormSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!input.success) {
      setFieldErrors(fieldErrorsFrom(input.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    const result = await callApi('POST', '/auth/change-password', input.data);
    setIsSubmitting(false);

    if (result.ok) {
      form.reset();
      setIsChanged(true);
      return;
    }
    setFieldErrors(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length === 0) {
      setFormError(result.message);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="max-w-sm space-y-5">
      <FormError message={formError} />
      <FormField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.currentPassword}
      />
      <FormField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={fieldErrors.newPassword}
      />
      <SubmitButton
        isSubmitting={isSubmitting}
        label="Change password"
        submittingLabel="Changing password…"
      />
      <p role="status" className="text-sm empty:hidden">
        {isChanged && 'Password changed. Other devices have been signed out.'}
      </p>
    </form>
  );
}
