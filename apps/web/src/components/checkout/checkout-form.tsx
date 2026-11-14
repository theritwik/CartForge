'use client';

import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import { FormField } from '@/components/auth/form-field';
import { FormError, SubmitButton } from '@/components/auth/form-parts';
import { callApi } from '@/lib/api-client';
import { fieldErrorsFrom, type FieldErrors } from '@/lib/auth-forms';
import { addressFieldErrors, INDIAN_STATES, shippingAddressFormSchema } from '@/lib/checkout-form';

const createdOrderSchema = z.object({ data: z.object({ id: z.string() }) });

export function CheckoutForm({
  defaultName,
  expectedTotalPaise,
  idempotencyKey: initialIdempotencyKey,
}: {
  defaultName: string;
  /** The total shown on this page. The API refuses the order if it no longer matches. */
  expectedTotalPaise: number;
  idempotencyKey: string;
}) {
  const router = useRouter();
  // Fixed for the life of this form, so a double click or a retry cannot create a second order.
  const [idempotencyKey] = useState(initialIdempotencyKey);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const address = shippingAddressFormSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!address.success) {
      setFieldErrors(fieldErrorsFrom(address.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    const result = await callApi(
      'POST',
      '/orders',
      { shippingAddress: address.data, expectedTotalPaise },
      { 'Idempotency-Key': idempotencyKey },
    );

    if (result.ok) {
      const order = createdOrderSchema.safeParse(result.data);
      // Stays in the submitting state until the order page replaces this form.
      router.push(order.success ? `/orders/${order.data.data.id}` : '/orders');
      router.refresh();
      return;
    }

    setIsSubmitting(false);
    const addressErrors = addressFieldErrors(result.fieldErrors);
    setFieldErrors(addressErrors);
    if (Object.keys(addressErrors).length === 0) {
      setFormError(result.message);
      // The cart changed on the server: show the customer its current contents and total.
      router.refresh();
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
      <FormError message={formError} />
      <FormField
        name="name"
        label="Full name"
        type="text"
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={defaultName}
        error={fieldErrors.name}
      />
      <FormField
        name="phone"
        label="Mobile number"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        required
        hint="A 10-digit Indian mobile number."
        error={fieldErrors.phone}
      />
      <FormField
        name="addressLine1"
        label="Address"
        type="text"
        autoComplete="address-line1"
        required
        maxLength={200}
        error={fieldErrors.addressLine1}
      />
      <FormField
        name="addressLine2"
        label="Apartment, landmark (optional)"
        type="text"
        autoComplete="address-line2"
        maxLength={200}
        error={fieldErrors.addressLine2}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          name="city"
          label="City"
          type="text"
          autoComplete="address-level2"
          required
          maxLength={100}
          error={fieldErrors.city}
        />
        <FormField
          name="postalCode"
          label="PIN code"
          type="text"
          autoComplete="postal-code"
          inputMode="numeric"
          required
          maxLength={6}
          error={fieldErrors.postalCode}
        />
      </div>
      <div>
        <label htmlFor="state" className="text-sm font-medium">
          State
        </label>
        <select
          id="state"
          name="state"
          autoComplete="address-level1"
          required
          defaultValue=""
          aria-invalid={fieldErrors.state ? true : undefined}
          aria-describedby={fieldErrors.state ? 'state-error' : undefined}
          className={`bg-background mt-1.5 w-full rounded-md border px-3 py-2 text-sm ${
            fieldErrors.state ? 'border-danger' : 'border-border'
          }`}
        >
          <option value="" disabled>
            Choose a state
          </option>
          {INDIAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        {fieldErrors.state && (
          <p id="state-error" className="text-danger mt-1.5 text-xs">
            {fieldErrors.state}
          </p>
        )}
      </div>
      <SubmitButton
        isSubmitting={isSubmitting}
        label="Place order"
        submittingLabel="Placing order…"
      />
      <p className="text-muted text-xs">
        Placing the order reserves your items for 30 minutes. Online payment is not available yet,
        so the order will stay unpaid.
      </p>
    </form>
  );
}
