import type { Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { MAX_QUANTITY_PER_ITEM, type AddCartItemInput } from './cart.schemas.js';

const cartItemSelect = {
  id: true,
  quantity: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      pricePaise: true,
      status: true,
      stockQuantity: true,
      reservedQuantity: true,
      images: { select: { url: true, altText: true }, orderBy: { position: 'asc' }, take: 1 },
    },
  },
} satisfies Prisma.CartItemSelect;

type CartItemRow = Prisma.CartItemGetPayload<{ select: typeof cartItemSelect }>;

/**
 * - AVAILABLE: can be bought in the quantity chosen.
 * - INSUFFICIENT_STOCK: fewer units are left than the quantity chosen.
 * - OUT_OF_STOCK: no units are left.
 * - UNAVAILABLE: the product is no longer sold.
 */
type CartItemAvailability = 'AVAILABLE' | 'INSUFFICIENT_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';

function availableQuantityOf(product: { stockQuantity: number; reservedQuantity: number }): number {
  return Math.max(product.stockQuantity - product.reservedQuantity, 0);
}

function toCartItem({ id, quantity, product }: CartItemRow) {
  const availableQuantity = availableQuantityOf(product);

  let availability: CartItemAvailability = 'AVAILABLE';
  if (product.status !== 'ACTIVE') {
    availability = 'UNAVAILABLE';
  } else if (availableQuantity === 0) {
    availability = 'OUT_OF_STOCK';
  } else if (quantity > availableQuantity) {
    availability = 'INSUFFICIENT_STOCK';
  }

  return {
    id,
    quantity,
    availability,
    // Always the current database price, never a value from the client or from when the item was added.
    lineTotalPaise: product.pricePaise * quantity,
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      pricePaise: product.pricePaise,
      image: product.images[0] ?? null,
      availableQuantity: availability === 'UNAVAILABLE' ? 0 : availableQuantity,
    },
  };
}

/**
 * The user's cart with current prices and availability. Items that can no
 * longer be bought stay in the cart, flagged, and are left out of the subtotal.
 */
export async function getCart(userId: string) {
  const rows = await prisma.cartItem.findMany({
    where: { cart: { userId } },
    select: cartItemSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const items = rows.map(toCartItem);
  const purchasableItems = items.filter((item) => item.availability === 'AVAILABLE');

  return {
    items,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    subtotalPaise: purchasableItems.reduce((total, item) => total + item.lineTotalPaise, 0),
    hasItemsNeedingAttention: purchasableItems.length < items.length,
    maxQuantityPerItem: MAX_QUANTITY_PER_ITEM,
  };
}

/**
 * Locks the user's cart row until the transaction ends and returns its id, or
 * undefined if the user has no cart yet. Every write to a cart takes this lock
 * first, so concurrent changes to one cart run one after another.
 */
async function lockCart(tx: Prisma.TransactionClient, userId: string): Promise<string | undefined> {
  const [cart] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM carts WHERE user_id = ${userId}::uuid FOR UPDATE
  `;
  return cart?.id;
}

/** Checks that a product can be held in a cart in the given quantity. Stock is not reserved. */
function assertCanHold(
  product: { status: string; stockQuantity: number; reservedQuantity: number } | null,
  quantity: number,
): void {
  if (product?.status !== 'ACTIVE') {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'This product is not available.');
  }
  if (quantity > MAX_QUANTITY_PER_ITEM) {
    throw new AppError(
      409,
      'QUANTITY_LIMIT_EXCEEDED',
      `You can have at most ${MAX_QUANTITY_PER_ITEM} of one product in your cart.`,
      { maxQuantityPerItem: MAX_QUANTITY_PER_ITEM },
    );
  }

  const availableQuantity = availableQuantityOf(product);
  if (availableQuantity === 0) {
    throw new AppError(409, 'OUT_OF_STOCK', 'This product is out of stock.', { availableQuantity });
  }
  if (quantity > availableQuantity) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${availableQuantity} left in stock.`, {
      availableQuantity,
    });
  }
}

const stockSelect = {
  status: true,
  stockQuantity: true,
  reservedQuantity: true,
} satisfies Prisma.ProductSelect;

/** Adds a product, or raises the quantity if the product is already in the cart. */
export async function addCartItem(userId: string, input: AddCartItemInput) {
  // INSERT ... ON CONFLICT DO NOTHING: safe when a customer's first two requests arrive together.
  // (Prisma's upsert is not: it can fail on the unique constraint under concurrency.)
  await prisma.cart.createMany({ data: [{ userId }], skipDuplicates: true });

  await prisma.$transaction(async (tx) => {
    const cartId = await lockCart(tx, userId);
    if (!cartId) {
      throw new Error(`Cart for user ${userId} disappeared while it was being changed.`);
    }

    const itemKey = { cartId_productId: { cartId, productId: input.productId } };
    const [product, existingItem] = await Promise.all([
      tx.product.findUnique({ where: { id: input.productId }, select: stockSelect }),
      tx.cartItem.findUnique({ where: itemKey, select: { quantity: true } }),
    ]);
    const quantity = (existingItem?.quantity ?? 0) + input.quantity;
    assertCanHold(product, quantity);

    await tx.cartItem.upsert({
      where: itemKey,
      create: { cartId, productId: input.productId, quantity },
      update: { quantity },
    });
  });
  return getCart(userId);
}

/**
 * Sets an item's quantity. Lowering it is always allowed, so a customer can fix
 * an item that has run short. Raising it requires the product to be on sale
 * with enough stock.
 */
export async function updateCartItemQuantity(userId: string, itemId: string, quantity: number) {
  await prisma.$transaction(async (tx) => {
    const cartId = await lockCart(tx, userId);
    // Scoped to the caller's own cart: another user's item id is simply not found.
    const item = cartId
      ? await tx.cartItem.findFirst({
          where: { id: itemId, cartId },
          select: { quantity: true, product: { select: stockSelect } },
        })
      : null;
    if (!item) {
      throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'This item is not in your cart.');
    }
    if (quantity > item.quantity) {
      assertCanHold(item.product, quantity);
    }

    await tx.cartItem.update({ where: { id: itemId }, data: { quantity } });
  });
  return getCart(userId);
}

/** Removes an item. Removing one that is already gone, or is not the caller's, changes nothing. */
export async function removeCartItem(userId: string, itemId: string) {
  await prisma.$transaction(async (tx) => {
    const cartId = await lockCart(tx, userId);
    if (cartId) {
      await tx.cartItem.deleteMany({ where: { id: itemId, cartId } });
    }
  });
  return getCart(userId);
}

export async function clearCart(userId: string) {
  await prisma.$transaction(async (tx) => {
    const cartId = await lockCart(tx, userId);
    if (cartId) {
      await tx.cartItem.deleteMany({ where: { cartId } });
    }
  });
  return getCart(userId);
}
