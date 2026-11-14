import { z } from 'zod';
import { fetchAsCurrentUser } from './server-api';

export const orderStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

const orderSummarySchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  totalPaise: z.number().int(),
  itemCount: z.number().int(),
  createdAt: z.coerce.date(),
  reservationExpiresAt: z.coerce.date().nullable(),
});

const orderListSchema = z.object({
  data: z.array(orderSummarySchema),
  meta: z.object({
    page: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const orderDetailSchema = z.object({
  data: z.object({
    id: z.string(),
    status: orderStatusSchema,
    totalPaise: z.number().int(),
    createdAt: z.coerce.date(),
    reservationExpiresAt: z.coerce.date().nullable(),
    shippingAddress: z.object({
      name: z.string(),
      phone: z.string(),
      addressLine1: z.string(),
      addressLine2: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
    }),
    items: z.array(
      z.object({
        id: z.string(),
        productName: z.string(),
        unitPricePaise: z.number().int(),
        quantity: z.number().int(),
        lineTotalPaise: z.number().int(),
        productSlug: z.string().nullable(),
        image: z.object({ url: z.string(), altText: z.string() }).nullable(),
      }),
    ),
  }),
});

export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type OrderList = z.infer<typeof orderListSchema>;
export type OrderDetail = z.infer<typeof orderDetailSchema>['data'];

/** The signed-in customer's orders, or null for a visitor who is not signed in. */
export async function getOrders(page: number): Promise<OrderList | null> {
  const reply = await fetchAsCurrentUser(`/orders?page=${page}`);
  return reply.status === 'ok' ? orderListSchema.parse(reply.body) : null;
}

export type OrderLookup =
  { status: 'ok'; order: OrderDetail } | { status: 'unauthenticated' } | { status: 'not_found' };

export async function getOrder(orderId: string): Promise<OrderLookup> {
  const reply = await fetchAsCurrentUser(`/orders/${encodeURIComponent(orderId)}`);
  return reply.status === 'ok'
    ? { status: 'ok', order: orderDetailSchema.parse(reply.body).data }
    : reply;
}
