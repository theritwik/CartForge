'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { goToPayment } from '@/lib/payments';

export function PayButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function pay() {
    setIsStarting(true);
    setError(undefined);
    const failure = await goToPayment(orderId);
    setIsStarting(false);
    setError(failure.message);
    // The order may have expired or been paid meanwhile: show its actual state.
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void pay()}
        disabled={isStarting}
        className="bg-foreground text-background rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isStarting ? 'Opening secure payment page…' : label}
      </button>
      <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
        {error}
      </p>
    </div>
  );
}
