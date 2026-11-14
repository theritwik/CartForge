'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from '@/lib/api-client';
import { signInHref } from '@/lib/cart-view';

const ADDED_MESSAGE_MS = 2500;

const variantClasses = {
  primary:
    'bg-foreground text-background w-full rounded-md px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 sm:w-auto sm:min-w-48',
  compact:
    'border-border hover:bg-surface w-full rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
};

export function AddToCartButton({
  productId,
  productName,
  variant = 'primary',
}: {
  productId: string;
  productName: string;
  variant?: keyof typeof variantClasses;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'idle' | 'adding' | 'added'>('idle');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (status !== 'added') {
      return;
    }
    const timer = setTimeout(() => {
      setStatus('idle');
    }, ADDED_MESSAGE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  async function addToCart() {
    setStatus('adding');
    setError(undefined);

    const result = await callApi('POST', '/cart/items', { productId, quantity: 1 });
    if (result.ok) {
      setStatus('added');
      // Re-renders the server components, which updates the cart count in the header.
      router.refresh();
      return;
    }
    if (result.code === 'UNAUTHENTICATED') {
      // Sign in first, then come back to this page.
      router.push(signInHref(pathname + window.location.search));
      return;
    }
    setStatus('idle');
    setError(result.message);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void addToCart()}
        disabled={status === 'adding'}
        aria-label={`Add ${productName} to cart`}
        className={`${variantClasses[variant]} disabled:opacity-60`}
      >
        {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added to cart' : 'Add to cart'}
      </button>
      <p role="status" className="sr-only">
        {status === 'added' && `${productName} was added to your cart.`}
      </p>
      <p role="alert" className="text-danger mt-1.5 text-xs empty:hidden">
        {error}
      </p>
    </div>
  );
}
