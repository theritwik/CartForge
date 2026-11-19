'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { transitionLabels } from '@/lib/admin-format';
import { callApi } from '@/lib/api-client';
import type { OrderStatus } from '@/lib/orders';

const confirmations: Partial<Record<OrderStatus, string>> = {
  CANCELLED:
    'Cancel this unpaid order? Its items return to stock and any open payment page is closed. This cannot be undone.',
  PROCESSING: 'Start preparing this order?',
  SHIPPED: 'Mark this order as handed to the carrier?',
  DELIVERED: 'Mark this order as delivered? This is the final step.',
};

/**
 * Offers only the next steps the server allows for the order's current status.
 * The status the page was loaded with is sent along, so a change made by
 * someone else in the meantime is refused rather than overwritten.
 */
export function OrderTransitionActions({
  orderId,
  currentStatus,
  allowedTransitions,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  allowedTransitions: OrderStatus[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<OrderStatus>();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (allowedTransitions.length === 0) {
    return <p className="text-muted text-sm">No further changes can be made to this order.</p>;
  }

  async function confirm(target: OrderStatus) {
    setIsSaving(true);
    setError(undefined);
    const result = await callApi('POST', `/admin/orders/${orderId}/transitions`, {
      from: currentStatus,
      to: target,
    });
    setIsSaving(false);
    setPending(undefined);
    if (!result.ok) {
      setError(result.message);
    }
    router.refresh();
  }

  return (
    <div>
      {pending ? (
        <div role="group" aria-label="Confirm status change" className="space-y-3">
          <p className="text-sm">{confirmations[pending]}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void confirm(pending)}
              disabled={isSaving}
              autoFocus
              className={
                pending === 'CANCELLED'
                  ? 'border-danger text-danger rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60'
                  : 'bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60'
              }
            >
              {isSaving ? 'Saving…' : `Yes, ${(transitionLabels[pending] ?? '').toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(undefined);
              }}
              disabled={isSaving}
              className="text-muted hover:text-foreground text-sm underline underline-offset-4"
            >
              Go back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {allowedTransitions.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => {
                setPending(target);
              }}
              className={
                target === 'CANCELLED'
                  ? 'border-border text-danger hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium transition-colors'
                  : 'bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90'
              }
            >
              {transitionLabels[target]}
            </button>
          ))}
        </div>
      )}
      <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
        {error}
      </p>
    </div>
  );
}
