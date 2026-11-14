import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CatalogView, CatalogViewSkeleton } from '@/components/catalog/catalog-view';
import { getCategories } from '@/lib/catalog-api';
import type { RawSearchParams } from '@/lib/catalog-filters';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

async function findCategory(slug: string) {
  const categories = await getCategories();
  return categories.find((category) => category.slug === slug);
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  return { title: category?.name ?? 'Category not found' };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  // Resolved before any streaming starts, so an unknown category is a real 404 response.
  const category = await findCategory((await params).slug);
  if (!category) {
    notFound();
  }
  const resolvedSearchParams = await searchParams;

  return (
    <Suspense key={JSON.stringify(resolvedSearchParams)} fallback={<CatalogViewSkeleton />}>
      <CatalogView
        heading={category.name}
        basePath={`/categories/${category.slug}`}
        category={category}
        searchParams={resolvedSearchParams}
      />
    </Suspense>
  );
}
