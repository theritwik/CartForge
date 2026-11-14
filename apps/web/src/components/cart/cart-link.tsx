import Link from 'next/link';
import { itemCountLabel } from '@/lib/cart-view';

export function CartLink({ itemCount }: { itemCount: number }) {
  return (
    <Link
      href="/cart"
      aria-label={`Cart, ${itemCountLabel(itemCount)}`}
      className="text-muted hover:text-foreground relative flex items-center py-1 transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 8h14l-1.2 11H6.2L5 8z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {itemCount > 0 && (
        <span className="bg-foreground text-background absolute -top-1 -right-2.5 min-w-5 rounded-full px-1 text-center text-xs leading-5 font-medium tabular-nums">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Link>
  );
}
