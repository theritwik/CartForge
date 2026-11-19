import { prisma } from '../../lib/prisma.js';
import { LOW_STOCK_THRESHOLD } from '../products/catalog-admin.service.js';

/** Orders whose payment was received and kept. */
const PAID_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;
const TREND_DAYS = 14;
const LOW_STOCK_LIST_SIZE = 8;
const RECENT_ORDERS_SIZE = 8;

/** Every figure is computed from the database at request time. */
export async function getDashboard() {
  const [
    ordersByStatus,
    paymentsByStatus,
    productsByStatus,
    lowStockProducts,
    lowStockCount,
    recentOrders,
    salesTrend,
  ] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalPaise: true } }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountPaise: true } }),
    prisma.product.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.$queryRaw<
      { id: string; name: string; stock_quantity: number; reserved_quantity: number }[]
    >`
      SELECT id, name, stock_quantity, reserved_quantity FROM products
      WHERE status = 'ACTIVE' AND stock_quantity - reserved_quantity <= ${LOW_STOCK_THRESHOLD}
      ORDER BY stock_quantity - reserved_quantity ASC, name ASC
      LIMIT ${LOW_STOCK_LIST_SIZE}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM products
      WHERE status = 'ACTIVE' AND stock_quantity - reserved_quantity <= ${LOW_STOCK_THRESHOLD}
    `,
    prisma.order.findMany({
      select: {
        id: true,
        status: true,
        totalPaise: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECENT_ORDERS_SIZE,
    }),
    // One row per day for the last 14 days in Indian time, including days without sales.
    prisma.$queryRaw<{ day: Date; order_count: bigint; revenue_paise: bigint | null }[]>`
      SELECT day::date AS day,
             count(o.id) AS order_count,
             sum(o.total_paise) AS revenue_paise
      FROM generate_series(
             (now() AT TIME ZONE 'Asia/Kolkata')::date - ${TREND_DAYS - 1}::int,
             (now() AT TIME ZONE 'Asia/Kolkata')::date,
             interval '1 day'
           ) AS day
      LEFT JOIN orders o
        ON (o.created_at AT TIME ZONE 'Asia/Kolkata')::date = day::date
       AND o.status::text IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED')
      GROUP BY day
      ORDER BY day
    `,
  ]);

  const orderStatusCount = (statuses: readonly string[]) =>
    ordersByStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + row._count._all, 0);
  const orderStatusValue = (statuses: readonly string[]) =>
    ordersByStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + (row._sum.totalPaise ?? 0), 0);
  const payments = (status: string) => {
    const row = paymentsByStatus.find((candidate) => candidate.status === status);
    return { count: row?._count._all ?? 0, amountPaise: row?._sum.amountPaise ?? 0 };
  };

  return {
    sales: {
      /** Totals of orders that were paid and are being or have been fulfilled. */
      revenuePaise: orderStatusValue(PAID_STATUSES),
      paidOrderCount: orderStatusCount(PAID_STATUSES),
      /** Unpaid orders still holding stock: not revenue. */
      awaitingPayment: {
        count: orderStatusCount(['PENDING_PAYMENT']),
        amountPaise: orderStatusValue(['PENDING_PAYMENT']),
      },
      /** Money received that could not be applied to an order. */
      refundPending: payments('REFUND_PENDING'),
      refunded: payments('REFUNDED'),
    },
    orders: {
      total: orderStatusCount(ordersByStatus.map((row) => row.status)),
      delivered: orderStatusCount(['DELIVERED']),
      cancelled: orderStatusCount(['CANCELLED']),
      expired: orderStatusCount(['EXPIRED']),
      byStatus: ordersByStatus
        .map((row) => ({ status: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    products: {
      active: productsByStatus.find((row) => row.status === 'ACTIVE')?._count._all ?? 0,
      draft: productsByStatus.find((row) => row.status === 'DRAFT')?._count._all ?? 0,
      archived: productsByStatus.find((row) => row.status === 'ARCHIVED')?._count._all ?? 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
      lowStock: lowStockProducts.map((product) => ({
        id: product.id,
        name: product.name,
        stockQuantity: product.stock_quantity,
        reservedQuantity: product.reserved_quantity,
        availableQuantity: Math.max(product.stock_quantity - product.reserved_quantity, 0),
      })),
    },
    recentOrders,
    salesTrend: salesTrend.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      orderCount: Number(row.order_count),
      revenuePaise: Number(row.revenue_paise ?? 0),
    })),
  };
}
