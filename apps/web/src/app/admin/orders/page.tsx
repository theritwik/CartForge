import type { Metadata } from 'next';
import Link from 'next/link';
import { FilterBar, filterInputClass } from '@/components/admin/filter-bar';
import { Pagination } from '@/components/catalog/pagination';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { getAdminOrders } from '@/lib/admin-api';
import { parseOrderFilters, toQuery } from '@/lib/admin-filters';
import type { RawSearchParams } from '@/lib/catalog-filters';
import { formatPrice } from '@/lib/format';
import {
  formatOrderDateTime,
  orderNumber,
  orderStatusLabels,
  paymentStatusLabels,
} from '@/lib/order-view';
import { orderStatusSchema } from '@/lib/orders';

export const metadata: Metadata = { title: 'Orders' };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseOrderFilters(await searchParams);
  const orders = await getAdminOrders(toQuery(filters));
  const isFiltered = Boolean(filters.status ?? filters.reference ?? filters.email);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>

      <FilterBar action="/admin/orders" isFiltered={isFiltered}>
        <label className="text-muted text-xs">
          Order number
          <input
            name="reference"
            defaultValue={filters.reference}
            placeholder="#ABCD1234"
            className={filterInputClass}
          />
        </label>
        <label className="text-muted min-w-48 flex-1 text-xs">
          Customer email
          <input
            name="email"
            type="search"
            defaultValue={filters.email}
            className={filterInputClass}
          />
        </label>
        <label className="text-muted text-xs">
          Status
          <select name="status" defaultValue={filters.status ?? ''} className={filterInputClass}>
            <option value="">Any status</option>
            {orderStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      <p className="text-muted text-sm" role="status">
        {orders.meta.totalItems} {orders.meta.totalItems === 1 ? 'order' : 'orders'}
      </p>

      {orders.data.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center text-sm">
          No orders match these filters.
        </div>
      ) : (
        <div className="relative border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="text-muted border-border border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Order
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Payment
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {orders.data.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {orderNumber(order.id)}
                    </Link>
                    <span className="text-muted block text-xs">
                      {formatOrderDateTime(order.createdAt)} · {order.itemCount}{' '}
                      {order.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {order.user.name}
                    <span className="text-muted block text-xs">{order.user.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="text-muted px-4 py-3">
                    {order.latestPaymentStatus
                      ? paymentStatusLabels[order.latestPaymentStatus]
                      : 'No attempt'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPrice(order.totalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={orders.meta.page}
        totalPages={orders.meta.totalPages}
        hrefForPage={(page) => `/admin/orders?${toQuery({ ...filters, page })}`}
      />
    </div>
  );
}
