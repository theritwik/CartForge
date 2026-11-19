import type { OrderStatus, Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AdminOrderQuery } from '../admin/admin.schemas.js';
import { closeOpenPaymentAttempts } from '../payments/payments.service.js';
import { allowedAdminTransitions, isAllowedAdminTransition } from './order-status-policy.js';
import { cancelPendingOrder, expireOrder, expireOverdueOrders } from './orders.service.js';

const customerSelect = { select: { id: true, name: true, email: true } } as const;

const adminOrderSummarySelect = {
  id: true,
  status: true,
  totalPaise: true,
  createdAt: true,
  user: customerSelect,
  items: { select: { quantity: true } },
  payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.OrderSelect;

const adminOrderDetailSelect = {
  id: true,
  status: true,
  totalPaise: true,
  createdAt: true,
  updatedAt: true,
  reservationExpiresAt: true,
  shippingName: true,
  shippingPhone: true,
  shippingAddressLine1: true,
  shippingAddressLine2: true,
  shippingCity: true,
  shippingState: true,
  shippingPostalCode: true,
  user: customerSelect,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      unitPricePaise: true,
      quantity: true,
      product: { select: { slug: true, status: true } },
    },
    orderBy: [{ productName: 'asc' }, { id: 'asc' }],
  },
  // Provider references are shown to administrators for support; the checkout URL is not.
  payments: {
    select: {
      id: true,
      status: true,
      amountPaise: true,
      failureReason: true,
      stripePaymentIntentId: true,
      stripeRefundId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.OrderSelect;

/**
 * Order ids that end with the given characters. Administrators usually have the
 * short reference shown to customers, which is the last eight characters.
 */
async function orderIdsMatching(reference: string): Promise<string[]> {
  // The schema allows only hex digits and hyphens, so the term cannot contain LIKE wildcards.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM orders WHERE id::text LIKE ${`%${reference}`} LIMIT 100
  `;
  return rows.map((row) => row.id);
}

export async function listAdminOrders(query: AdminOrderQuery) {
  // So that the list shows overdue orders as expired, not as still awaiting payment.
  await expireOverdueOrders();

  const where: Prisma.OrderWhereInput = { status: query.status };
  if (query.reference) {
    where.id = { in: await orderIdsMatching(query.reference) };
  }
  if (query.email) {
    where.user = { email: { contains: query.email } };
  }

  const [orders, totalItems] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: adminOrderSummarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: orders.map(({ items, payments, ...order }) => ({
      ...order,
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
      latestPaymentStatus: payments[0]?.status ?? null,
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function getAdminOrder(orderId: string) {
  const findOrder = () =>
    prisma.order.findUnique({ where: { id: orderId }, select: adminOrderDetailSelect });

  let order = await findOrder();
  if (
    order?.status === 'PENDING_PAYMENT' &&
    order.reservationExpiresAt !== null &&
    order.reservationExpiresAt <= new Date()
  ) {
    await expireOrder(order.id);
    order = await findOrder();
  }
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  const { items, ...rest } = order;
  return {
    ...rest,
    items: items.map(({ product, ...item }) => ({
      ...item,
      lineTotalPaise: item.unitPricePaise * item.quantity,
      productSlug: product.status === 'ACTIVE' ? product.slug : null,
    })),
    allowedTransitions: allowedAdminTransitions(order.status),
  };
}

/**
 * Moves an order from one status to another, as permitted by the policy. The
 * caller states the status it saw; if the order changed since (another
 * administrator, the webhook, or expiry), nothing happens and 409 is returned.
 */
export async function transitionOrder(orderId: string, from: OrderStatus, to: OrderStatus) {
  if (!isAllowedAdminTransition(from, to)) {
    throw new AppError(
      409,
      'TRANSITION_NOT_ALLOWED',
      `An order cannot be moved from ${from} to ${to}.`,
      { allowedTransitions: allowedAdminTransitions(from) },
    );
  }

  if (to === 'CANCELLED') {
    // The same path as a customer cancelling: releases the reserved stock in one transaction.
    if (!(await cancelPendingOrder({ id: orderId }))) {
      await throwStatusChanged(orderId);
    }
    // After the cancellation commits, so a provider failure cannot undo it.
    await closeOpenPaymentAttempts(orderId);
  } else {
    // Fulfilment steps do not touch stock: it was converted into a sale when the order was paid.
    const { count } = await prisma.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to },
    });
    if (count === 0) {
      await throwStatusChanged(orderId);
    }
  }

  return getAdminOrder(orderId);
}

async function throwStatusChanged(orderId: string): Promise<never> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  throw new AppError(
    409,
    'ORDER_STATUS_CHANGED',
    'The order changed since it was loaded. Reload it and try again.',
    { status: order.status },
  );
}
