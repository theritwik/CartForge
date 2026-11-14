import Link from 'next/link';
import { getCurrentUser, type CurrentUser } from '@/lib/current-user';
import { LogoutButton } from './auth/logout-button';

const linkClass = 'text-muted hover:text-foreground py-1 transition-colors';

async function currentUserOrNull(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (error) {
    // The header is on every page; it falls back to the signed-out links if the API is unreachable.
    console.error(error);
    return null;
  }
}

export async function AccountNav() {
  const user = await currentUserOrNull();

  return (
    <nav aria-label="Account" className="ml-auto flex items-center gap-4 text-sm">
      {user ? (
        <>
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
