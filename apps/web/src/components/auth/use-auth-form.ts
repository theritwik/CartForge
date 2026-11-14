'use client';

import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import type { z } from 'zod';
import { postToApi } from '@/lib/api-client';
import { fieldErrorsFrom, type FieldErrors } from '@/lib/auth-forms';

/**
 * Shared behaviour of the sign-in and registration forms: validate, submit to
 * the API, show field and form errors, and move on once signed in.
 */
export function useAuthForm(options: { schema: z.ZodType; endpoint: string; redirectTo: string }) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const input = options.schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!input.success) {
      setFieldErrors(fieldErrorsFrom(input.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    const result = await postToApi(options.endpoint, input.data);
    if (result.ok) {
      // Stays in the submitting state until the next page replaces the form.
      router.replace(options.redirectTo);
      router.refresh();
      return;
    }

    setIsSubmitting(false);
    setFieldErrors(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length === 0) {
      setFormError(result.message);
    }
  }

  return { fieldErrors, formError, isSubmitting, handleSubmit };
}
