import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CancelOrderButton } from '@/components/orders/cancel-order-button';
import { OrderProgress } from '@/components/orders/order-progress';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { PayButton } from '@/components/payments/pay-button';
import { signInHref } from '@/lib/cart-view';
import { formatPrice } from '@/lib/format';
import {
  canCancel,
  formatOrderDateTime,
  formatPhone,
  orderNumber,
  orderProgress,
  orderStatusMessage,
  payButtonLabel,
  paymentStatusLabels,
  refundNote,
} from '@/lib/order-view';
import { getOrder } from '@/lib/orders';

interface OrderPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: OrderPageProps): Promise<Metadata> {
  return { title: `Order ${orderNumber((await params).id)}` };
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { id } = await params;
  const lookup = await getOrder(id);
  if (lookup.status === 'unauthenticated') {
    redirect(signInHref(`/orders/${id}`));
  }
  if (lookup.status === 'not_found') {
    notFound();
  }

  const { order } = lookup;
  const { shippingAddress: address } = order;
  const progress = orderProgress(order.status);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-muted text-sm">
        <Link href="/orders" className="hover:text-foreground">
          Your orders
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="text-foreground">
          {orderNumber(order.id)}
        </span>
      </nav>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Order {orderNumber(order.id)}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-muted mt-2 text-sm">
        Placed on {formatOrderDateTime(order.createdAt)} IST
      </p>

      <section
        aria-labelledby="status-heading"
        className="border-border mt-8 rounded-lg border p-6"
      >
        <h2 id="status-heading" className="sr-only">
          Status
        </h2>
        {progress && <OrderProgress steps={progress} />}
        <p className={progress ? 'mt-6 text-sm' : 'text-sm'}>
          {orderStatusMessage(order)} {refundNote(order.payments)}
        </p>
        {canCancel(order.status) && (
          <div className="mt-5 flex flex-wrap items-start gap-4">
            <PayButton orderId={order.id} label={payButtonLabel(order.payments)} />
            <CancelOrderButton orderId={order.id} />
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_16rem] md:items-start">
        <section aria-labelledby="items-heading">
          <h2 id="items-heading" className="text-lg font-medium">
            Items
          </h2>
          <ul className="border-border divide-border mt-4 divide-y border-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="bg-surface h-16 w-16 shrink-0 overflow-hidden rounded-md">
                  {item.image && (
                    <Image
                      src={item.image.url}
                      alt={item.image.altText}
                      width={128}
                      height={128}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.productSlug ? (
                      <Link
                        href={`/products/${item.productSlug}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {item.productName}
                      </Link>
                    ) : (
                      item.productName
                    )}
                  </p>
                  <p className="text-muted mt-1 text-sm tabular-nums">
                    {item.quantity} × {formatPrice(item.unitPricePaise)}
                  </p>
                </div>
                <p className="tabular-nums">{formatPrice(item.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex items-baseline justify-between gap-4">
            <dt className="text-sm">Total</dt>
            <dd className="text-xl font-medium tabular-nums">{formatPrice(order.totalPaise)}</dd>
          </dl>
        </section>

        <div>
          <section aria-labelledby="address-heading">
            <h2 id="address-heading" className="text-lg font-medium">
              Shipping address
            </h2>
            <address className="text-muted mt-4 text-sm leading-relaxed not-italic">
              <span className="text-foreground">{address.name}</span>
              <br />
              {address.addressLine1}
              <br />
              {address.addressLine2 && (
                <>
                  {address.addressLine2}
                  <br />
                </>
              )}
              {address.city}, {address.state} {address.postalCode}
              <br />
              {formatPhone(address.phone)}
            </address>
          </section>

          {order.payments.length > 0 && (
            <section aria-labelledby="payments-heading" className="mt-10">
              <h2 id="payments-heading" className="text-lg font-medium">
                Payment
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {order.payments.map((payment) => (
                  <li key={payment.id}>
                    <span className="block">{paymentStatusLabels[payment.status]}</span>
                    <span className="text-muted block tabular-nums">
                      {formatPrice(payment.amountPaise)} · {formatOrderDateTime(payment.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
