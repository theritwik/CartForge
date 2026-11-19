import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { SimulatorActions } from '@/components/payments/simulator-actions';
import { apiUrl } from '@/lib/api-url';
import { formatPrice } from '@/lib/format';
import { orderNumber } from '@/lib/order-view';

export const metadata: Metadata = {
  title: 'Development payment simulator',
  robots: { index: false },
};

const simulatedSessionSchema = z.object({
  data: z.object({ orderId: z.string(), amountPaise: z.number().int(), status: z.string() }),
});

/**
 * DEVELOPMENT ONLY. Stands in for Stripe's hosted payment page when the API has
 * no Stripe key. With a key configured the API does not serve the simulator and
 * this page is a 404.
 */
export default async function PaymentSimulatorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const response = await fetch(
    apiUrl(`/dev/payment-simulator/sessions/${encodeURIComponent(sessionId)}`),
    { cache: 'no-store' },
  );
  if (!response.ok) {
    notFound();
  }
  const session = simulatedSessionSchema.parse(await response.json()).data;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="border-danger rounded-lg border-2 border-dashed p-6">
        <p className="text-danger font-mono text-xs tracking-widest uppercase">
          Development simulator · not Stripe
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Simulated payment page</h1>
        <p className="text-muted mt-3 text-sm">
          This page replaces Stripe&apos;s hosted checkout because no Stripe test key is configured.
          No card details are collected and no money moves. Each button sends the store a signed
          event, as Stripe&apos;s webhook would.
        </p>

        <dl className="border-border mt-6 space-y-2 border-y py-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Order</dt>
            <dd>{orderNumber(session.orderId)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Amount</dt>
            <dd className="tabular-nums">{formatPrice(session.amountPaise)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <SimulatorActions sessionId={sessionId} orderId={session.orderId} />
        </div>
      </div>
    </div>
  );
}
