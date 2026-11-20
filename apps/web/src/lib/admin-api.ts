import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { signInHref } from './cart-view';
import { orderStatusSchema } from './orders';
import { fetchAsCurrentUser } from './server-api';

const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
const paymentStatusSchema = z.enum([
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
]);
const metaSchema = z.object({
  page: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});
const moneyCountSchema = z.object({ count: z.number().int(), amountPaise: z.number().int() });

const dashboardSchema = z.object({
  data: z.object({
    sales: z.object({
      revenuePaise: z.number().int(),
      paidOrderCount: z.number().int(),
      awaitingPayment: moneyCountSchema,
      refundPending: moneyCountSchema,
      refunded: moneyCountSchema,
    }),
    orders: z.object({
      total: z.number().int(),
      delivered: z.number().int(),
      cancelled: z.number().int(),
      expired: z.number().int(),
      byStatus: z.array(z.object({ status: orderStatusSchema, count: z.number().int() })),
    }),
    products: z.object({
      active: z.number().int(),
      draft: z.number().int(),
      archived: z.number().int(),
      lowStockThreshold: z.number().int(),
      lowStockCount: z.number().int(),
      lowStock: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          stockQuantity: z.number().int(),
          reservedQuantity: z.number().int(),
          availableQuantity: z.number().int(),
        }),
      ),
    }),
    recentOrders: z.array(
      z.object({
        id: z.string(),
        status: orderStatusSchema,
        totalPaise: z.number().int(),
        createdAt: z.coerce.date(),
        user: z.object({ name: z.string(), email: z.string() }),
      }),
    ),
    salesTrend: z.array(
      z.object({ date: z.string(), orderCount: z.number().int(), revenuePaise: z.number().int() }),
    ),
  }),
});

const adminProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  pricePaise: z.number().int(),
  status: productStatusSchema,
  stockQuantity: z.number().int(),
  reservedQuantity: z.number().int(),
  availableQuantity: z.number().int(),
  isLowStock: z.boolean(),
  updatedAt: z.coerce.date(),
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  image: z.object({ url: z.string(), altText: z.string() }).nullable(),
});

const adminCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  productCount: z.number().int(),
  activeProductCount: z.number().int(),
});

const adminOrderSummarySchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  totalPaise: z.number().int(),
  createdAt: z.coerce.date(),
  itemCount: z.number().int(),
  latestPaymentStatus: paymentStatusSchema.nullable(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});

const adminOrderDetailSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  totalPaise: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  reservationExpiresAt: z.coerce.date().nullable(),
  shippingName: z.string(),
  shippingPhone: z.string(),
  shippingAddressLine1: z.string(),
  shippingAddressLine2: z.string().nullable(),
  shippingCity: z.string(),
  shippingState: z.string(),
  shippingPostalCode: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  items: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      productName: z.string(),
      unitPricePaise: z.number().int(),
      quantity: z.number().int(),
      lineTotalPaise: z.number().int(),
      productSlug: z.string().nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      status: paymentStatusSchema,
      amountPaise: z.number().int(),
      failureReason: z.string().nullable(),
      stripePaymentIntentId: z.string().nullable(),
      stripeRefundId: z.string().nullable(),
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
    }),
  ),
  allowedTransitions: z.array(orderStatusSchema),
});

export type AdminDashboard = z.infer<typeof dashboardSchema>['data'];
export type AdminProduct = z.infer<typeof adminProductSchema>;
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Loads an admin resource for a Server Component. The API decides access: a
 * visitor who is not signed in is sent to sign in, and anyone who is not an
 * administrator, or asks for something that does not exist, gets the 404 page.
 */
async function loadAdmin<T>(path: string, schema: z.ZodType<T>, returnPath: string): Promise<T> {
  const reply = await fetchAsCurrentUser(`/admin${path}`);
  if (reply.status === 'unauthenticated') {
    redirect(signInHref(returnPath));
  }
  if (reply.status !== 'ok') {
    notFound();
  }
  return schema.parse(reply.body);
}

export async function getAdminDashboard() {
  return (await loadAdmin('/dashboard', dashboardSchema, '/admin')).data;
}

export async function getAdminProducts(query: URLSearchParams, returnPath: string) {
  return loadAdmin(
    `/products?${query}`,
    z.object({ data: z.array(adminProductSchema), meta: metaSchema }),
    returnPath,
  );
}

export async function getAdminProduct(productId: string) {
  const path = `/products/${encodeURIComponent(productId)}`;
  return (await loadAdmin(path, z.object({ data: adminProductSchema }), `/admin${path}/edit`)).data;
}

const stockAdjustmentSchema = z.object({
  id: z.string(),
  delta: z.number().int(),
  stockAfter: z.number().int(),
  reason: z.string().nullable(),
  createdAt: z.coerce.date(),
  admin: z.object({ name: z.string(), email: z.string() }),
});

export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;

/** The most recent stock adjustments of one product, newest first. */
export async function getStockAdjustments(productId: string) {
  const path = `/products/${encodeURIComponent(productId)}`;
  const schema = z.object({ data: z.array(stockAdjustmentSchema) });
  return (await loadAdmin(`${path}/stock-adjustments`, schema, `/admin${path}/edit`)).data;
}

export async function getAdminCategories() {
  const schema = z.object({ data: z.array(adminCategorySchema) });
  return (await loadAdmin('/categories', schema, '/admin/categories')).data;
}

export async function getAdminOrders(query: URLSearchParams) {
  return loadAdmin(
    `/orders?${query}`,
    z.object({ data: z.array(adminOrderSummarySchema), meta: metaSchema }),
    '/admin/orders',
  );
}

export async function getAdminOrder(orderId: string) {
  const path = `/orders/${encodeURIComponent(orderId)}`;
  return (await loadAdmin(path, z.object({ data: adminOrderDetailSchema }), `/admin${path}`)).data;
}
