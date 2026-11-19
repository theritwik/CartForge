import type { Metadata } from 'next';
import Link from 'next/link';
import { OrderTransitionActions } from '@/components/admin/order-transition-actions';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { getAdminOrder } from '@/lib/admin-api';
import { formatPrice } from '@/lib/format';
import {
  formatOrderDateTime,
  formatPhone,
  orderNumber,
  paymentStatusLabels,
} from '@/lib/order-view';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Order ${orderNumber((await params).id)}` };
}

/** What each failure reason means, in words an administrator can act on. */
const failureReasons: Record<string, string> = {
  PAYMENT_FAILED: 'The payment was declined.',
  CHECKOUT_SESSION_EXPIRED: 'The customer did not finish paying in time.',
  ORDER_CANCELLED: 'The order was cancelled while this payment page was open.',
  PROVIDER_REJECTED_REQUEST: 'Stripe rejected the request to open a payment page.',
  ORDER_NOT_AWAITING_PAYMENT:
    'Money arrived after the order expired, was cancelled, or was already paid.',
  AMOUNT_MISMATCH: 'The amount paid did not match the order total.',
  CURRENCY_MISMATCH: 'The payment was not in rupees.',
  ORDER_MISMATCH: 'The payment referred to a different order.',
  SESSION_MISMATCH: 'The payment came from an unexpected payment page.',
};

export default async function AdminOrderPage({ params }: PageProps) {
  const order = await getAdminOrder((await params).id);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/orders" className="text-muted hover:text-foreground text-sm">
          ← Orders
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Order {orderNumber(order.id)}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted mt-2 text-sm">
          Placed {formatOrderDateTime(order.createdAt)} IST · Last changed{' '}
          {formatOrderDateTime(order.updatedAt)} IST
        </p>
        <p className="text-muted mt-1 font-mono text-xs break-all">{order.id}</p>
      </div>

      <section aria-labelledby="actions-heading" className="border-border rounded-lg border p-5">
        <h2 id="actions-heading" className="font-medium">
          Next step
        </h2>
        <div className="mt-4">
          <OrderTransitionActions
            orderId={order.id}
            currentStatus={order.status}
            allowedTransitions={order.allowedTransitions}
          />
        </div>
        {order.status === 'PENDING_PAYMENT' && (
          <p className="text-muted mt-4 text-xs">
            Only a confirmed payment from Stripe can mark an order paid.
            {order.reservationExpiresAt &&
              ` Its stock is held until ${formatOrderDateTime(order.reservationExpiresAt)} IST.`}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="items-heading">
          <h2 id="items-heading" className="font-medium">
            Items
          </h2>
          <div className="relative border-border mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="text-muted border-border border-b text-xs">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${item.productId}/edit`}
                        className="underline-offset-4 hover:underline"
                      >
                        {item.productName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPrice(item.unitPricePaise)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPrice(item.lineTotalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-border border-t">
                <tr>
                  <th scope="row" colSpan={3} className="px-4 py-3 text-right font-medium">
                    Order total
                  </th>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatPrice(order.totalPaise)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-muted mt-2 text-xs">
            Names and prices as they were when the order was placed.
          </p>
        </section>

        <div className="space-y-8">
          <section aria-labelledby="customer-heading">
            <h2 id="customer-heading" className="font-medium">
              Customer
            </h2>
            <p className="mt-3 text-sm">{order.user.name}</p>
            <p className="text-muted text-sm break-all">{order.user.email}</p>
          </section>
          <section aria-labelledby="shipping-heading">
            <h2 id="shipping-heading" className="font-medium">
              Shipping address
            </h2>
            <address className="text-muted mt-3 text-sm leading-relaxed not-italic">
              <span className="text-foreground">{order.shippingName}</span>
              <br />
              {order.shippingAddressLine1}
              <br />
              {order.shippingAddressLine2 && (
                <>
                  {order.shippingAddressLine2}
                  <br />
                </>
              )}
              {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}
              <br />
              {formatPhone(order.shippingPhone)}
            </address>
          </section>
        </div>
      </div>

      <section aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="font-medium">
          Payments
        </h2>
        {order.payments.length === 0 ? (
          <p className="text-muted mt-3 text-sm">The customer has not started a payment.</p>
        ) : (
          <div className="relative border-border mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted border-border border-b text-xs">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Started
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {order.payments.map((payment) => (
                  <tr key={payment.id} className="align-top">
                    <td
                      className={`px-4 py-3 font-medium ${payment.status === 'REFUND_PENDING' ? 'text-danger' : ''}`}
                    >
                      {paymentStatusLabels[payment.status]}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPrice(payment.amountPaise)}
                    </td>
                    <td className="text-muted px-4 py-3">
                      {formatOrderDateTime(payment.createdAt)}
                    </td>
                    <td className="text-muted px-4 py-3 text-xs">
                      {payment.failureReason && (
                        <p className="text-foreground text-sm">
                          {failureReasons[payment.failureReason] ?? payment.failureReason}
                        </p>
                      )}
                      {payment.stripePaymentIntentId && (
                        <p className="font-mono break-all">{payment.stripePaymentIntentId}</p>
                      )}
                      {payment.stripeRefundId && (
                        <p className="font-mono break-all">Refund {payment.stripeRefundId}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
