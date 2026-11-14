import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';
import { getCurrentUser } from '@/lib/current-user';
import { safeRedirectPath } from '@/lib/redirects';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({
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
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="text-muted mt-2 text-sm">
        Already have an account?{' '}
        <Link
          href={{ pathname: '/login', query: { next: redirectTo } }}
          className="text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
      <div className="mt-8">
        <RegisterForm redirectTo={redirectTo} />
      </div>
    </>
  );
}
