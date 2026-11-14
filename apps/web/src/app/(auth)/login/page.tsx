import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getCurrentUser } from '@/lib/current-user';
import { safeRedirectPath } from '@/lib/redirects';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const redirectTo = safeRedirectPath((await searchParams).next);
  if (await getCurrentUser()) {
    redirect(redirectTo);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted mt-2 text-sm">
        New to CartForge?{' '}
        <Link
          href={{ pathname: '/register', query: { next: redirectTo } }}
          className="text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
      <div className="mt-8">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </>
  );
}
