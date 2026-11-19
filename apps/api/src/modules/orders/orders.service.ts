import type { Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { getCart, lockCart } from '../cart/cart.service.js';
import {
  commitStock,
  releaseStock,
  reserveStock,
  StockUnavailableError,
} from '../inventory/inventory.service.js';
import type { CheckoutInput } from './orders.schemas.js';

/** How long an unpaid order holds its stock. */
const RESERVATION_MINUTES = 30;
const EXPIRY_BATCH_SIZE = 100;

const orderSummarySelect = {
  id: true,
  status: true,
  totalPaise: true,
  createdAt: true,
  reservationExpiresAt: true,
  items: { select: { quantity: true } },
} satisfies Prisma.OrderSelect;

const orderDetailSelect = {
  id: true,
  status: true,
  totalPaise: true,
  createdAt: true,
  reservationExpiresAt: true,
  shippingName: true,
  shippingPhone: true,
  shippingAddressLine1: true,
  shippingAddressLine2: true,
  shippingCity: true,
  shippingState: true,
  shippingPostalCode: true,
  items: {
    select: {
      id: true,
      productName: true,
      unitPricePaise: true,
      quantity: true,
      product: {
        select: {
          slug: true,
          status: true,
          images: { select: { url: true, altText: true }, orderBy: { position: 'asc' }, take: 1 },
        },
      },
    },
    orderBy: [{ productName: 'asc' }, { id: 'asc' }],
  },
  payments: {
    select: { id: true, status: true, amountPaise: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.OrderSelect;

type OrderSummaryRow = Prisma.OrderGetPayload<{ select: typeof orderSummarySelect }>;
type OrderDetailRow = Prisma.OrderGetPayload<{ select: typeof orderDetailSelect }>;

function toOrderSummary({ items, ...order }: OrderSummaryRow) {
  return { ...order, itemCount: items.reduce((count, item) => count + item.quantity, 0) };
}

function toOrderDetail(order: OrderDetailRow) {
  return {
    id: order.id,
    status: order.status,
    totalPaise: order.totalPaise,
    createdAt: order.createdAt,
    reservationExpiresAt: order.reservationExpiresAt,
    shippingAddress: {
      name: order.shippingName,
      phone: order.shippingPhone,
      addressLine1: order.shippingAddressLine1,
      addressLine2: order.shippingAddressLine2,
      city: order.shippingCity,
      state: order.shippingState,
      postalCode: order.shippingPostalCode,
    },
    // Name and price are the snapshot taken at checkout, not the product's current values.
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      unitPricePaise: item.unitPricePaise,
      quantity: item.quantity,
      lineTotalPaise: item.unitPricePaise * item.quantity,
      // Only for linking to a product that is still on sale.
      productSlug: item.product.status === 'ACTIVE' ? item.product.slug : null,
      image: item.product.images[0] ?? null,
    })),
    // Payment attempts, newest first. Provider identifiers are not exposed.
    payments: order.payments,
  };
}

function isOverdue(order: { status: string; reservationExpiresAt: Date | null }): boolean {
  return (
    order.status === 'PENDING_PAYMENT' &&
    order.reservationExpiresAt !== null &&
    order.reservationExpiresAt <= new Date()
  );
}

async function orderStockLines(tx: Prisma.TransactionClient, orderId: string) {
  return tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
}

/**
 * Creates an order from the customer's cart and reserves its stock, all in one
 * transaction. Repeating the request with the same idempotency key returns the
 * order that was already created.
 */
export async function checkout(userId: string, idempotencyKey: string, input: CheckoutInput) {
  let placed: { orderId: string; isNew: boolean };
  try {
    placed = await prisma.$transaction(async (tx) => {
      // Holding the cart lock makes a customer's checkouts run one at a time, so a
      // repeated request waits here and then finds the order made by the first.
      const cartId = await lockCart(tx, userId);
      const existingOrder = await tx.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        select: { id: true },
      });
      if (existingOrder) {
        return { orderId: existingOrder.id, isNew: false };
      }

      const cartItems = cartId
        ? await tx.cartItem.findMany({
            where: { cartId },
            select: { productId: true, quantity: true },
          })
        : [];
      if (cartItems.length === 0) {
        throw new AppError(409, 'CART_EMPTY', 'Your cart is empty.');
      }

      // Prices come back from the same statement that reserves the stock.
      const reservedLines = await reserveStock(tx, cartItems);
      const totalPaise = reservedLines.reduce(
        (total, line) => total + line.pricePaise * line.quantity,
        0,
      );
      if (totalPaise !== input.expectedTotalPaise) {
        throw new AppError(
          409,
          'CART_CHANGED',
          'The prices or items in your cart have changed. Review the updated total before ordering.',
          { totalPaise },
        );
      }

      const { shippingAddress } = input;
      const order = await tx.order.create({
        data: {
          userId,
          idempotencyKey,
          totalPaise,
          reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000),
          shippingName: shippingAddress.name,
          shippingPhone: shippingAddress.phone,
          shippingAddressLine1: shippingAddress.addressLine1,
          shippingAddressLine2: shippingAddress.addressLine2 || null,
          shippingCity: shippingAddress.city,
          shippingState: shippingAddress.state,
          shippingPostalCode: shippingAddress.postalCode,
          items: {
            create: reservedLines.map((line) => ({
              productId: line.productId,
              productName: line.name,
              unitPricePaise: line.pricePaise,
              quantity: line.quantity,
            })),
          },
        },
        select: { id: true },
      });
      // The order now holds these items. Emptying the cart keeps it from reserving them twice.
      await tx.cartItem.deleteMany({ where: { cartId } });

      return { orderId: order.id, isNew: true };
    });
  } catch (error) {
    if (!(error instanceof StockUnavailableError)) {
      throw error;
    }
    // The transaction rolled back, so no stock is held. Report which items need attention.
    const cart = await getCart(userId);
    throw new AppError(
      409,
      'ITEMS_UNAVAILABLE',
      'Some items in your cart are no longer available in the quantity you chose.',
      {
        items: cart.items
          .filter((item) => item.availability !== 'AVAILABLE')
          .map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            availability: item.availability,
            availableQuantity: item.product.availableQuantity,
          })),
      },
    );
  }

  return { order: await getOrder(userId, placed.orderId), isNew: placed.isNew };
}

/**
 * Ends an unpaid order whose reservation has run out and returns its stock.
 * The status change is conditional, so however many callers race to expire the
 * same order, exactly one releases the stock.
 */
export async function expireOrder(orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        status: 'PENDING_PAYMENT',
        reservationExpiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED', reservationExpiresAt: null },
    });
    if (count === 0) {
      return false;
    }
    await releaseStock(tx, await orderStockLines(tx, orderId));
    return true;
  });
}

/**
 * Expires every overdue order, or only one customer's. Each order is handled in
 * its own transaction: a failure leaves that order to be retried on the next
 * run and does not stop the others.
 */
export async function expireOverdueOrders(userId?: string): Promise<number> {
  const overdueOrders = await prisma.order.findMany({
    where: { userId, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { reservationExpiresAt: 'asc' },
    take: EXPIRY_BATCH_SIZE,
  });

  let expiredCount = 0;
  for (const { id } of overdueOrders) {
    try {
      if (await expireOrder(id)) {
        expiredCount += 1;
      }
    } catch (error) {
      logger.error({ err: error, orderId: id }, 'Could not expire order');
    }
  }
  return expiredCount;
}

/**
 * Marks an unpaid order as paid and turns its reservation into a sale, inside
 * the caller's transaction. Only the payment webhook calls this: no HTTP route
 * can mark an order paid. Returns false, changing nothing, if the order is not
 * awaiting payment (already paid, cancelled, or expired), so the caller knows
 * the money cannot be applied to it.
 */
export async function confirmOrderPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'PAID', reservationExpiresAt: null },
  });
  if (count === 0) {
    return false;
  }
  await commitStock(tx, await orderStockLines(tx, orderId));
  return true;
}

/**
 * Cancels an order that is still awaiting payment and releases its stock, in
 * one transaction. Returns false, changing nothing, if no such order is
 * awaiting payment. Used by customers (scoped to their own orders) and by
 * administrators.
 */
export async function cancelPendingOrder(where: { id: string; userId?: string }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { ...where, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED', reservationExpiresAt: null },
    });
    if (count === 0) {
      return false;
    }
    await releaseStock(tx, await orderStockLines(tx, where.id));
    return true;
  });
}

/** A customer may cancel their own order while it is still awaiting payment. */
export async function cancelOrder(userId: string, orderId: string) {
  if (!(await cancelPendingOrder({ id: orderId, userId }))) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
    throw order
      ? new AppError(409, 'ORDER_NOT_CANCELLABLE', 'This order can no longer be cancelled.')
      : new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  return getOrder(userId, orderId);
}

/** One of the customer's own orders. Another customer's order is reported as not found. */
export async function getOrder(userId: string, orderId: string) {
  const findOrder = () =>
    prisma.order.findFirst({ where: { id: orderId, userId }, select: orderDetailSelect });

  let order = await findOrder();
  if (order && isOverdue(order)) {
    // Do not wait for the periodic sweep: the customer should see the true state.
    await expireOrder(order.id);
    order = await findOrder();
  }
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  return toOrderDetail(order);
}

export async function listOrders(userId: string, query: { page: number; pageSize: number }) {
  await expireOverdueOrders(userId);

  const where = { userId };
  const [orders, totalItems] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: orderSummarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: orders.map(toOrderSummary),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}
