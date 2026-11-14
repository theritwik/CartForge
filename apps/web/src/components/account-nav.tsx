import Link from 'next/link';
import { getCart } from '@/lib/cart';
import { getCurrentUser, type CurrentUser } from '@/lib/current-user';
import { LogoutButton } from './auth/logout-button';
import { CartLink } from './cart/cart-link';

const linkClass = 'text-muted hover:text-foreground py-1 transition-colors';

async function currentUserAndCartCount(): Promise<{ user: CurrentUser | null; itemCount: number }> {
  try {
    const [user, cart] = await Promise.all([getCurrentUser(), getCart()]);
    return { user, itemCount: cart?.itemCount ?? 0 };
  } catch (error) {
    // The header is on every page; it falls back to the signed-out links if the API is unreachable.
    console.error(error);
    return { user: null, itemCount: 0 };
  }
}

export async function AccountNav() {
  const { user, itemCount } = await currentUserAndCartCount();

  return (
    <nav aria-label="Account" className="ml-auto flex items-center gap-4 text-sm">
      <CartLink itemCount={itemCount} />
      {user ? (
        <>
          <Link href="/orders" className={`${linkClass} hidden sm:block`}>
            Orders
          </Link>
          <Link href="/account" className={linkClass}>
            Account
          </Link>
          <LogoutButton className={linkClass} />
        </>
      ) : (
        <>
          <Link href="/login" className={linkClass}>
            Sign in
          </Link>
          <Link
            href="/register"
            className="border-border hover:bg-surface rounded-md border px-3 py-1.5 font-medium transition-colors"
          >
            Create account
          </Link>
        </>
      )}
    </nav>
  );
}
