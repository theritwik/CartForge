'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type SubmitEvent } from 'react';
import { callApi } from '@/lib/api-client';
import { formText } from '@/lib/auth-forms';

/**
 * Adds or removes physical stock. The server refuses a change that would leave
 * fewer units than unpaid orders have reserved.
 */
export function StockAdjustForm({
  productId,
  productName,
  reservedQuantity,
  compact = false,
}: {
  productId: string;
  productName: string;
  reservedQuantity: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = formText(form, 'delta').trim();
    setError(undefined);
    setMessage(undefined);

    if (!/^[+-]?\d{1,6}$/.test(text) || Number(text) === 0) {
      setError('Enter a whole number of units to add, or a negative number to remove.');
      return;
    }
    const delta = Number(text);

    setIsSaving(true);
    const result = await callApi('POST', `/admin/products/${productId}/stock-adjustments`, {
      delta,
    });
    setIsSaving(false);

    if (!result.ok) {
      setError(result.fieldErrors.delta ?? result.message);
      return;
    }
    form.reset();
    setMessage(delta > 0 ? `Added ${delta}.` : `Removed ${-delta}.`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <label htmlFor={inputId} className={compact ? 'sr-only' : 'text-sm font-medium'}>
        Adjust stock of {productName}
      </label>
      <div className={`flex gap-2 ${compact ? '' : 'mt-1.5'}`}>
        <input
          id={inputId}
          name="delta"
          type="text"
          inputMode="numeric"
          placeholder="+10 or −3"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-help`}
          className={`bg-background w-28 rounded-md border px-3 py-1.5 text-sm tabular-nums ${
            error ? 'border-danger' : 'border-border'
          }`}
        />
        <button
          type="submit"
          disabled={isSaving}
          className="border-border hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Apply'}
        </button>
      </div>
      <p id={`${inputId}-help`} className={compact ? 'sr-only' : 'text-muted mt-1.5 text-xs'}>
        Positive numbers add stock, negative numbers remove it.
        {reservedQuantity > 0 && ` ${reservedQuantity} units are reserved and cannot be removed.`}
      </p>
      <p role="alert" className="text-danger mt-1.5 text-xs empty:hidden">
        {error}
      </p>
      <p role="status" className="mt-1.5 text-xs empty:hidden">
        {message}
      </p>
    </form>
  );
}
