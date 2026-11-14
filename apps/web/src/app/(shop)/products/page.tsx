import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CatalogView, CatalogViewSkeleton } from '@/components/catalog/catalog-view';
import type { RawSearchParams } from '@/lib/catalog-filters';

export const metadata: Metadata = { title: 'All products' };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    // Keyed by the filters so the skeleton shows again whenever they change.
    <Suspense key={JSON.stringify(resolvedSearchParams)} fallback={<CatalogViewSkeleton />}>
      <CatalogView
        heading="All products"
        basePath="/products"
        searchParams={resolvedSearchParams}
      />
    </Suspense>
  );
}
