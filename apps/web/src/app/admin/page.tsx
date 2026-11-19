import type { Metadata } from 'next';
import Link from 'next/link';
import { SalesTrendChart } from '@/components/admin/sales-trend-chart';
import { StatCard } from '@/components/admin/stat-card';
import { StatusBreakdown } from '@/components/admin/status-breakdown';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { getAdminDashboard } from '@/lib/admin-api';
import { formatPrice } from '@/lib/format';
import { formatOrderDateTime, orderNumber } from '@/lib/order-view';

export const metadata: Metadata = { title: 'Dashboard' };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export default async function AdminDashboardPage() {
  const { sales, orders, products, recentOrders, salesTrend } = await getAdminDashboard();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>

      <section aria-labelledby="money-heading">
        <h2 id="money-heading" className="sr-only">
          Money
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Revenue"
            value={formatPrice(sales.revenuePaise)}
            detail={`From ${plural(sales.paidOrderCount, 'paid order')}`}
            href="/admin/orders?status=PAID"
          />
          <StatCard
            label="Awaiting payment"
            value={formatPrice(sales.awaitingPayment.amountPaise)}
            detail={`${plural(sales.awaitingPayment.count, 'order')}, not yet revenue`}
            href="/admin/orders?status=PENDING_PAYMENT"
          />
          <StatCard
            label="Refunds owed"
            value={formatPrice(sales.refundPending.amountPaise)}
            detail={`${plural(sales.refundPending.count, 'payment')} being returned`}
          />
          <StatCard
            label="Refunded"
            value={formatPrice(sales.refunded.amountPaise)}
            detail={`${plural(sales.refunded.count, 'payment')} returned to customers`}
          />
        </div>
      </section>

      <section aria-labelledby="counts-heading">
        <h2 id="counts-heading" className="sr-only">
          Orders and products
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Orders"
            value={String(orders.total)}
            detail={`${orders.delivered} delivered`}
            href="/admin/orders"
          />
          <StatCard
            label="Cancelled or expired"
            value={String(orders.cancelled + orders.expired)}
            detail={`${orders.cancelled} cancelled · ${orders.expired} expired`}
            href="/admin/orders?status=CANCELLED"
          />
          <StatCard
            label="Active products"
            value={String(products.active)}
            detail={`${plural(products.draft, 'draft')} · ${products.archived} archived`}
            href="/admin/products?status=ACTIVE"
          />
          <StatCard
            label="Low stock"
            value={String(products.lowStockCount)}
            detail={`Active products with ${products.lowStockThreshold} or fewer available`}
            href="/admin/inventory?lowStock=true"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[3fr_2fr]">
        <section className="border-border rounded-lg border p-5">
          <SalesTrendChart days={salesTrend} />
        </section>
        <section className="border-border rounded-lg border p-5">
          <StatusBreakdown rows={orders.byStatus} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[3fr_2fr]">
        <section aria-labelledby="recent-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="font-medium">
              Recent orders
            </h2>
            <Link href="/admin/orders" className="text-sm underline underline-offset-4">
              All orders
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-muted mt-4 text-sm">No orders yet.</p>
          ) : (
            <div className="relative border-border mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
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
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {orderNumber(order.id)}
                        </Link>
                        <span className="text-muted block text-xs">
                          {formatOrderDateTime(order.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {order.user.name}
                        <span className="text-muted block text-xs">{order.user.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
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
        </section>

        <section aria-labelledby="low-stock-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="low-stock-heading" className="font-medium">
              Low stock
            </h2>
            <Link
              href="/admin/inventory?lowStock=true"
              className="text-sm underline underline-offset-4"
            >
              Inventory
            </Link>
          </div>
          {products.lowStock.length === 0 ? (
            <p className="text-muted mt-4 text-sm">
              Every active product has more than {products.lowStockThreshold} available.
            </p>
          ) : (
            <ul className="border-border divide-border mt-4 divide-y rounded-lg border">
              {products.lowStock.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="underline-offset-4 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <span className="text-right tabular-nums">
                    <span className="text-danger font-medium">
                      {product.availableQuantity} available
                    </span>
                    {product.reservedQuantity > 0 && (
                      <span className="text-muted block text-xs">
                        {product.reservedQuantity} reserved
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
