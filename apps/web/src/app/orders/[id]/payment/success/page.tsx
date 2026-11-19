import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AutoRefresh } from '@/components/payments/auto-refresh';
import { signInHref } from '@/lib/cart-view';
import { formatPrice } from '@/lib/format';
import { orderNumber, refundNote } from '@/lib/order-view';
import { getOrder } from '@/lib/orders';

export const metadata: Metadata = { title: 'Payment' };

const linkButtonClass =
  'bg-foreground text-background mt-6 inline-block rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90';

/**
 * Where the payment page sends the customer afterwards. Arriving here proves
 * nothing: the page reports whatever the server has confirmed so far.
 */
export default async function PaymentReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lookup = await getOrder(id);
  if (lookup.status === 'unauthenticated') {
    redirect(signInHref(`/orders/${id}/payment/success`));
  }
  if (lookup.status === 'not_found') {
    notFound();
  }
  const { order } = lookup;
  const orderLink = (
    <Link href={`/orders/${order.id}`} className={linkButtonClass}>
      View order {orderNumber(order.id)}
    </Link>
  );

  if (order.status === 'PENDING_PAYMENT') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6" role="status">
        <h1 className="text-2xl font-semibold tracking-tight">Confirming your payment…</h1>
        <p className="text-muted mt-3">
          We are waiting for the payment provider to confirm. This usually takes a few seconds.
          Please do not pay again.
        </p>
        <AutoRefresh />
      </div>
    );
  }

  if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">This order could not be completed</h1>
        <p className="text-muted mt-3">
          The order was {order.status === 'CANCELLED' ? 'cancelled' : 'not paid in time'} and its
          items were returned to stock. {refundNote(order.payments)}
        </p>
        {orderLink}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Payment confirmed</h1>
      <p className="text-muted mt-3">
        We received {formatPrice(order.totalPaise)} for order {orderNumber(order.id)}. Thank you.
      </p>
      {orderLink}
    </div>
  );
}
