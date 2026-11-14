import type { Prisma } from '@cartforge/db';

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
