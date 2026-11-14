import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckoutForm } from '@/components/checkout/checkout-form';
import { getCart } from '@/lib/cart';
import { itemCountLabel, signInHref } from '@/lib/cart-view';
import { getCurrentUser } from '@/lib/current-user';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  const [user, cart] = await Promise.all([getCurrentUser(), getCart()]);
  if (!user || !cart) {
    redirect(signInHref('/checkout'));
  }
  if (cart.items.length === 0) {
    redirect('/cart');
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>

      {cart.hasItemsNeedingAttention ? (
        <div className="border-danger mt-8 max-w-xl rounded-lg border p-6" role="alert">
          <h2 className="font-medium">Some items in your cart need attention</h2>
          <p className="text-muted mt-2 text-sm">
            One or more items are out of stock, short of stock, or no longer sold. Update or remove
            them before placing your order.
          </p>
          <Link
            href="/cart"
            className="bg-foreground text-background mt-4 inline-block rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Review cart
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
          <section aria-labelledby="shipping-heading">
            <h2 id="shipping-heading" className="text-lg font-medium">
              Shipping address
            </h2>
            <div className="mt-5 max-w-xl">
              <CheckoutForm
                defaultName={user.name}
                expectedTotalPaise={cart.subtotalPaise}
                idempotencyKey={randomUUID()}
              />
            </div>
          </section>

          <section
            aria-labelledby="order-summary-heading"
            className="border-border bg-surface rounded-lg border p-6"
          >
            <h2 id="order-summary-heading" className="text-lg font-medium">
              Order summary
            </h2>
            <p className="text-muted mt-1 text-sm">{itemCountLabel(cart.itemCount)}</p>
            <ul className="divide-border border-border mt-4 divide-y border-y">
              {cart.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                  <span>
                    {item.product.name}
                    <span className="text-muted"> × {item.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatPrice(item.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 flex items-baseline justify-between gap-4">
              <dt className="text-sm">Total</dt>
              <dd className="text-xl font-medium tabular-nums">
                {formatPrice(cart.subtotalPaise)}
              </dd>
            </dl>
            <Link href="/cart" className="mt-4 inline-block text-sm underline underline-offset-4">
              Edit cart
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
