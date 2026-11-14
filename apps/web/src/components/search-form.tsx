'use client';

import Form from 'next/form';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SearchFields({ query }: { query: string }) {
  return (
    <Form
      action="/products"
      role="search"
      className="order-last flex w-full gap-2 md:order-none md:w-72"
    >
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <input
        // Remounts when the URL query changes, so the field always shows the active search.
        key={query}
        id="site-search"
        name="q"
        type="search"
        placeholder="Search products"
        maxLength={100}
        defaultValue={query}
        className="border-border bg-background placeholder:text-muted min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="border-border hover:bg-surface rounded-md border px-3 py-2 text-sm font-medium transition-colors"
      >
        Search
      </button>
    </Form>
  );
}

function SearchFieldsFromUrl() {
  return <SearchFields query={useSearchParams().get('q') ?? ''} />;
}

export function SearchForm() {
  return (
    // useSearchParams needs a Suspense boundary on prerendered pages such as the 404 page.
    <Suspense fallback={<SearchFields query="" />}>
      <SearchFieldsFromUrl />
    </Suspense>
  );
}
