import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CartItemRow } from '@/components/cart/cart-item-row';
import { ClearCartButton } from '@/components/cart/clear-cart-button';
import { getCart } from '@/lib/cart';
import { itemCountLabel, signInHref } from '@/lib/cart-view';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = { title: 'Your cart' };

export default async function CartPage() {
  const cart = await getCart();
  if (!cart) {
    redirect(signInHref('/cart'));
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="text-muted mx-auto mt-3 max-w-md">
          Items you add are saved to your account, so they will be here when you come back.
        </p>
        <Link
          href="/products"
          className="bg-foreground text-background mt-6 inline-block rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your cart</h1>
      <p className="text-muted mt-2 text-sm">{itemCountLabel(cart.itemCount)}</p>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div>
          <ul className="border-border divide-border divide-y border-y">
            {cart.items.map((item) => (
              <CartItemRow key={item.id} item={item} maxQuantityPerItem={cart.maxQuantityPerItem} />
            ))}
          </ul>
          <div className="mt-6">
            <ClearCartButton />
          </div>
        </div>

        <section
          aria-labelledby="cart-summary-heading"
          className="border-border bg-surface rounded-lg border p-6"
        >
          <h2 id="cart-summary-heading" className="text-lg font-medium">
            Summary
          </h2>
          <dl className="mt-4 flex items-baseline justify-between gap-4">
            <dt className="text-sm">Subtotal</dt>
            <dd className="text-xl font-medium tabular-nums">{formatPrice(cart.subtotalPaise)}</dd>
          </dl>
          {cart.hasItemsNeedingAttention && (
            <p className="text-danger mt-3 text-sm">
              Some items cannot be bought as they are and are not included in the subtotal.
            </p>
          )}
          {cart.hasItemsNeedingAttention ? (
            <p className="text-muted border-border mt-4 border-t pt-4 text-sm">
              Update or remove those items to continue to checkout.
            </p>
          ) : (
            <Link
              href="/checkout"
              className="bg-foreground text-background mt-5 block rounded-md px-5 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90"
            >
              Proceed to checkout
            </Link>
          )}
          <p className="text-muted mt-4 text-sm">
            Prices and stock are checked again when you place the order.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            Continue shopping
          </Link>
        </section>
      </div>
    </div>
  );
}
