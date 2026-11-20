import type { Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Stock movements. Each product row has two counters: stock_quantity (units on
 * hand) and reserved_quantity (units held by unpaid orders). Every function
 * here must be called inside a transaction, so that the stock change commits or
 * rolls back together with the order change it belongs to.
 */

export interface StockLine {
  productId: string;
  quantity: number;
}

export interface ReservedLine extends StockLine {
  /** Product name and price at the moment of reservation. */
  name: string;
  pricePaise: number;
}

/** A product was not on sale, or did not have enough unreserved stock. */
export class StockUnavailableError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super(`Product ${productId} could not be reserved.`);
    this.name = 'StockUnavailableError';
    this.productId = productId;
  }
}

/**
 * Product rows are always changed in id order. Two transactions that touch the
 * same products therefore take their row locks in the same sequence and cannot
 * deadlock.
 */
function inLockOrder<T extends StockLine>(lines: T[]): T[] {
  return lines.toSorted((a, b) => a.productId.localeCompare(b.productId));
}

/**
 * Reserves stock for every line or throws StockUnavailableError. The WHERE
 * clause makes each reservation a single atomic check-and-update: of two
 * transactions competing for the last unit, the second waits for the first to
 * commit, re-evaluates the condition, and matches no row.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  lines: StockLine[],
): Promise<ReservedLine[]> {
  const reserved: ReservedLine[] = [];

  for (const line of inLockOrder(lines)) {
    const [product] = await tx.$queryRaw<{ name: string; price_paise: number }[]>`
      UPDATE products
      SET reserved_quantity = reserved_quantity + ${line.quantity}, updated_at = now()
      WHERE id = ${line.productId}::uuid
        AND status = 'ACTIVE'
        AND stock_quantity - reserved_quantity >= ${line.quantity}
      RETURNING name, price_paise
    `;
    if (!product) {
      throw new StockUnavailableError(line.productId);
    }
    reserved.push({ ...line, name: product.name, pricePaise: product.price_paise });
  }

  return reserved;
}

/** Returns reserved units to available stock, when an order is cancelled or expires. */
export async function releaseStock(
  tx: Prisma.TransactionClient,
  lines: StockLine[],
): Promise<void> {
  for (const line of inLockOrder(lines)) {
    await tx.$executeRaw`
      UPDATE products
      SET reserved_quantity = reserved_quantity - ${line.quantity}, updated_at = now()
      WHERE id = ${line.productId}::uuid
    `;
  }
}

/** Turns a reservation into a sale, when an order is paid: the units leave the stock. */
export async function commitStock(tx: Prisma.TransactionClient, lines: StockLine[]): Promise<void> {
  for (const line of inLockOrder(lines)) {
    await tx.$executeRaw`
      UPDATE products
      SET stock_quantity = stock_quantity - ${line.quantity},
          reserved_quantity = reserved_quantity - ${line.quantity},
          updated_at = now()
      WHERE id = ${line.productId}::uuid
    `;
  }
}

const STOCK_HISTORY_SIZE = 20;

/** The most recent adjustments of one product's stock, newest first. */
export async function listStockAdjustments(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  return prisma.stockAdjustment.findMany({
    where: { productId },
    select: {
      id: true,
      delta: true,
      stockAfter: true,
      reason: true,
      createdAt: true,
      admin: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: STOCK_HISTORY_SIZE,
  });
}

/** The most physical stock one product may record. */
const MAX_STOCK_QUANTITY = 1_000_000;

/**
 * Adds or removes physical stock, for an administrator's adjustment. A single
 * conditional statement applies the change, so concurrent adjustments and
 * checkouts compose correctly: stock can never drop below the units reserved
 * by unpaid orders, nor below zero. The adjustment is recorded, with who made
 * it and the resulting stock, in the same transaction.
 */
export async function adjustProductStock(adjustment: {
  productId: string;
  adminId: string;
  delta: number;
  reason?: string;
}): Promise<void> {
  const { productId, delta } = adjustment;
  await prisma.$transaction(async (tx) => {
    const [updated] = await tx.$queryRaw<{ stock_quantity: number }[]>`
      UPDATE products
      SET stock_quantity = stock_quantity + ${delta}, updated_at = now()
      WHERE id = ${productId}::uuid
        AND stock_quantity + ${delta} >= reserved_quantity
        AND stock_quantity + ${delta} <= ${MAX_STOCK_QUANTITY}
      RETURNING stock_quantity
    `;
    if (updated) {
      await tx.stockAdjustment.create({
        data: {
          productId,
          adminId: adjustment.adminId,
          delta,
          stockAfter: updated.stock_quantity,
          reason: adjustment.reason,
        },
      });
      return;
    }

    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { stockQuantity: true, reservedQuantity: true },
    });
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }
    const resultingQuantity = product.stockQuantity + delta;
    if (resultingQuantity > MAX_STOCK_QUANTITY) {
      throw new AppError(
        409,
        'STOCK_LIMIT_EXCEEDED',
        'Stock cannot exceed 1,000,000 units.',
        product,
      );
    }
    if (product.reservedQuantity === 0) {
      throw new AppError(
        409,
        'STOCK_BELOW_ZERO',
        `Only ${product.stockQuantity} units are in stock, so at most ${product.stockQuantity} can be removed.`,
        product,
      );
    }
    throw new AppError(
      409,
      'STOCK_BELOW_RESERVED',
      `Stock cannot go below the ${product.reservedQuantity} units reserved by unpaid orders.`,
      product,
    );
  });
}
