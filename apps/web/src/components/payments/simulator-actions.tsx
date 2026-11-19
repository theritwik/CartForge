'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/lib/api-client';

const outcomes = [
  { outcome: 'paid', label: 'Simulate successful payment', next: 'payment/success' },
  { outcome: 'failed', label: 'Simulate failed payment', next: '' },
  { outcome: 'expired', label: 'Simulate expired payment page', next: '' },
] as const;

const buttonClass =
  'border-border hover:bg-surface w-full rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60';

export function SimulatorActions({ sessionId, orderId }: { sessionId: string; orderId: string }) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();

  async function send(outcome: (typeof outcomes)[number]) {
    setIsSending(true);
    setError(undefined);
    const result = await callApi('POST', `/dev/payment-simulator/sessions/${sessionId}/events`, {
      outcome: outcome.outcome,
    });
    if (!result.ok) {
      setIsSending(false);
      setError(result.message);
      return;
    }
    // Return to the store the way the real hosted page would.
    router.push(`/orders/${orderId}/${outcome.next}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {outcomes.map((outcome) => (
        <button
          key={outcome.outcome}
          type="button"
          onClick={() => void send(outcome)}
          disabled={isSending}
          className={buttonClass}
        >
          {outcome.label}
        </button>
      ))}
      <Link
        href={`/orders/${orderId}/payment/cancelled`}
        className={`${buttonClass} block text-center`}
      >
        Cancel and return to CartForge
      </Link>
      <p role="alert" className="text-danger text-sm empty:hidden">
        {error}
      </p>
    </div>
  );
}
