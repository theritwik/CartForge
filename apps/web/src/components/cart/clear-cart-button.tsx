'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/lib/api-client';

const quietButtonClass =
  'text-muted hover:text-foreground text-sm underline underline-offset-4 disabled:opacity-60';

export function ClearCartButton() {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string>();

  async function clearCart() {
    setIsClearing(true);
    setError(undefined);
    const result = await callApi('DELETE', '/cart');
    setIsClearing(false);
    setIsConfirming(false);

    if (!result.ok) {
      setError(result.message);
    }
    router.refresh();
  }

  if (!isConfirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setIsConfirming(true);
          }}
          className={quietButtonClass}
        >
          Clear cart
        </button>
        <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirm clearing the cart"
      className="flex flex-wrap items-center gap-4"
    >
      <p className="text-sm">Remove every item from your cart?</p>
      <button
        type="button"
        onClick={() => void clearCart()}
        disabled={isClearing}
        // Focus moves here so keyboard users land on the confirmation they just opened.
        autoFocus
        className="border-danger text-danger rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
      >
        {isClearing ? 'Clearing…' : 'Yes, clear cart'}
      </button>
      <button
        type="button"
        onClick={() => {
          setIsConfirming(false);
        }}
        disabled={isClearing}
        className={quietButtonClass}
      >
        Cancel
      </button>
    </div>
  );
}
