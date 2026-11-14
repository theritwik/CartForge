import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pagination } from '@/components/catalog/pagination';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { itemCountLabel, signInHref } from '@/lib/cart-view';
import { formatPrice } from '@/lib/format';
import { formatOrderDate, orderNumber } from '@/lib/order-view';
import { getOrders } from '@/lib/orders';

export const metadata: Metadata = { title: 'Your orders' };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const requestedPage = Number((await searchParams).page);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;

  const orders = await getOrders(page);
  if (!orders) {
    redirect(signInHref('/orders'));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your orders</h1>

      {orders.data.length === 0 ? (
        <div className="border-border mt-8 rounded-lg border border-dashed px-6 py-16 text-center">
          <h2 className="font-medium">{page > 1 ? 'No more orders' : 'No orders yet'}</h2>
          <p className="text-muted mt-2 text-sm">Orders you place will be listed here.</p>
          <Link
            href={page > 1 ? '/orders' : '/products'}
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            {page > 1 ? 'Back to the first page' : 'Browse products'}
          </Link>
        </div>
      ) : (
        <ul className="border-border divide-border mt-8 divide-y rounded-lg border">
          {orders.data.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="hover:bg-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 transition-colors"
              >
                <div>
                  <p className="font-medium">Order {orderNumber(order.id)}</p>
                  <p className="text-muted mt-1 text-sm">
                    {formatOrderDate(order.createdAt)} · {itemCountLabel(order.itemCount)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge status={order.status} />
                  <span className="tabular-nums">{formatPrice(order.totalPaise)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        currentPage={orders.meta.page}
        totalPages={orders.meta.totalPages}
        hrefForPage={(target) => (target > 1 ? `/orders?page=${target}` : '/orders')}
      />
    </div>
  );
}
