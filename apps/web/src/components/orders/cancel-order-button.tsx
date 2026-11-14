'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/lib/api-client';

const quietButtonClass =
  'text-muted hover:text-foreground text-sm underline underline-offset-4 disabled:opacity-60';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string>();

  async function cancelOrder() {
    setIsCancelling(true);
    setError(undefined);
    const result = await callApi('POST', `/orders/${orderId}/cancel`);
    setIsCancelling(false);
    setIsConfirming(false);

    if (!result.ok) {
      setError(result.message);
    }
    // Refresh either way, so the page shows the order's actual state.
    router.refresh();
  }

  return (
    <div>
      {isConfirming ? (
        <div
          role="group"
          aria-label="Confirm cancelling the order"
          className="flex flex-wrap items-center gap-4"
        >
          <p className="text-sm">Cancel this order and release its items?</p>
          <button
            type="button"
            onClick={() => void cancelOrder()}
            disabled={isCancelling}
            autoFocus
            className="border-danger text-danger rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {isCancelling ? 'Cancelling…' : 'Yes, cancel order'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsConfirming(false);
            }}
            disabled={isCancelling}
            className={quietButtonClass}
          >
            Keep order
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsConfirming(true);
          }}
          className="border-border hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium transition-colors"
        >
          Cancel order
        </button>
      )}
      <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
        {error}
      </p>
    </div>
  );
}
