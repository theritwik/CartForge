import Link from 'next/link';
import { Suspense } from 'react';
import { AccountNav } from './account-nav';
import { SearchForm } from './search-form';

export function SiteHeader() {
  return (
    <header className="border-border bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          CartForge
        </Link>
        <nav aria-label="Primary" className="text-muted text-sm">
          <Link href="/products" className="hover:text-foreground py-1 transition-colors">
            All products
          </Link>
        </nav>
        <SearchForm />
        {/* Streams in after the rest of the header, so pages do not wait on the session check. */}
        <Suspense fallback={<div className="ml-auto h-8 w-40" aria-hidden="true" />}>
          <AccountNav />
        </Suspense>
      </div>
    </header>
  );
}
