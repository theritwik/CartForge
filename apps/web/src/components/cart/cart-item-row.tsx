'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { callApi } from '@/lib/api-client';
import type { CartItem } from '@/lib/cart';
import { availabilityWarning, quantityControls } from '@/lib/cart-view';
import { formatPrice } from '@/lib/format';

const stepButtonClass =
  'hover:bg-surface flex h-9 w-9 items-center justify-center text-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent';

export function CartItemRow({
  item,
  maxQuantityPerItem,
}: {
  item: CartItem;
  maxQuantityPerItem: number;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  const { product } = item;
  const isBusy = isSaving || isRefreshing;
  const warning = availabilityWarning(item);
  const { canDecrease, canIncrease } = quantityControls(item, maxQuantityPerItem);
  const isOnSale = item.availability !== 'UNAVAILABLE';

  async function change(method: 'PATCH' | 'DELETE', body?: { quantity: number }) {
    setIsSaving(true);
    setError(undefined);
    const result = await callApi(method, `/cart/items/${item.id}`, body);
    setIsSaving(false);

    if (!result.ok) {
      setError(result.message);
    }
    // Refresh either way: after an error the page should show what the server actually holds.
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <li className="flex gap-4 py-6 sm:gap-6" aria-busy={isBusy}>
      <div className="bg-surface h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-28">
        {product.image && (
          <Image
            src={product.image.url}
            alt={product.image.altText}
            width={224}
            height={224}
            className={`h-full w-full object-cover ${item.availability === 'AVAILABLE' ? '' : 'opacity-60'}`}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
          <h2 className="font-medium">
            {isOnSale ? (
              <Link
                href={`/products/${product.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {product.name}
              </Link>
            ) : (
              product.name
            )}
          </h2>
          {item.availability === 'AVAILABLE' && (
            <p className="tabular-nums">{formatPrice(item.lineTotalPaise)}</p>
          )}
        </div>
        {isOnSale && (
          <p className="text-muted mt-1 text-sm tabular-nums">
            {formatPrice(product.pricePaise)} each
          </p>
        )}
        {warning && (
          <p className="text-danger mt-2 text-sm">
            {warning} <span className="text-muted">Not included in the subtotal.</span>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div
            role="group"
            aria-label={`Quantity of ${product.name}`}
            className="border-border flex items-center rounded-md border"
          >
            <button
              type="button"
              onClick={() => void change('PATCH', { quantity: item.quantity - 1 })}
              disabled={isBusy || !canDecrease}
              aria-label="Decrease quantity"
              className={stepButtonClass}
            >
              −
            </button>
            <span className="w-9 text-center text-sm tabular-nums" aria-live="polite">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => void change('PATCH', { quantity: item.quantity + 1 })}
              disabled={isBusy || !canIncrease}
              aria-label="Increase quantity"
              className={stepButtonClass}
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => void change('DELETE')}
            disabled={isBusy}
            aria-label={`Remove ${product.name} from cart`}
            className="text-muted hover:text-foreground text-sm underline underline-offset-4 disabled:opacity-60"
          >
            Remove
          </button>
        </div>
        <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
          {error}
        </p>
      </div>
    </li>
  );
}
