import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/admin-nav';
import { signInHref } from '@/lib/cart-view';
import { getCurrentUser } from '@/lib/current-user';

// Every admin page depends on who is signed in, so none can be prerendered.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | CartForge admin' },
  robots: { index: false },
};

/**
 * Keeps non-administrators out of the admin pages. This is for their benefit:
 * the API checks the role again on every request, and is what actually protects
 * the data.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(signInHref('/admin'));
  }
  if (user.role !== 'ADMIN') {
    notFound();
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[12rem_1fr] lg:gap-10">
      <aside>
        <p className="text-muted mb-3 hidden text-xs font-medium tracking-widest uppercase lg:block">
          Store admin
        </p>
        <AdminNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
