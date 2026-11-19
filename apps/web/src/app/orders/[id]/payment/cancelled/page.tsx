import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PayButton } from '@/components/payments/pay-button';
import { signInHref } from '@/lib/cart-view';
import { canCancel, orderNumber, orderStatusMessage } from '@/lib/order-view';
import { getOrder } from '@/lib/orders';

export const metadata: Metadata = { title: 'Payment not completed' };

export default async function PaymentCancelledPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lookup = await getOrder(id);
  if (lookup.status === 'unauthenticated') {
    redirect(signInHref(`/orders/${id}/payment/cancelled`));
  }
  if (lookup.status === 'not_found') {
    notFound();
  }
  const { order } = lookup;
  // The same condition as cancelling: the order is still awaiting payment.
  const canRetry = canCancel(order.status);

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Payment not completed</h1>
      <p className="text-muted mt-3">
        You left the payment page before paying, so you have not been charged.{' '}
        {orderStatusMessage(order)}
      </p>
      <div className="mt-6 flex flex-col items-center gap-4">
        {canRetry && <PayButton orderId={order.id} label="Try payment again" />}
        <Link href={`/orders/${order.id}`} className="text-sm underline underline-offset-4">
          View order {orderNumber(order.id)}
        </Link>
      </div>
    </div>
  );
}
