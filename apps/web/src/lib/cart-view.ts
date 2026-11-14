import type { CartItem } from './cart';

/** The warning to show for an item that cannot be bought as it stands, if any. */
export function availabilityWarning(
  item: Pick<CartItem, 'availability' | 'product'>,
): string | null {
  switch (item.availability) {
    case 'AVAILABLE':
      return null;
    case 'INSUFFICIENT_STOCK':
      return `Only ${item.product.availableQuantity} left. Lower the quantity to keep this item in your order.`;
    case 'OUT_OF_STOCK':
      return 'Out of stock. It will stay in your cart in case it returns.';
    case 'UNAVAILABLE':
      return 'No longer available.';
  }
}

/** Which of the quantity buttons should be enabled for an item. */
export function quantityControls(
  item: Pick<CartItem, 'quantity' | 'availability' | 'product'>,
  maxQuantityPerItem: number,
): { canDecrease: boolean; canIncrease: boolean } {
  const isOnSale = item.availability !== 'UNAVAILABLE';
  return {
    canDecrease: item.quantity > 1,
    canIncrease:
      isOnSale &&
      item.quantity < maxQuantityPerItem &&
      item.quantity < item.product.availableQuantity,
  };
}

export function itemCountLabel(itemCount: number): string {
  return itemCount === 1 ? '1 item' : `${itemCount} items`;
}

/** Sign-in link that brings the visitor back to the given path afterwards. */
export function signInHref(returnPath: string): string {
  return `/login?next=${encodeURIComponent(returnPath)}`;
}
