import Link from 'next/link';
import { getCategories, getProducts, type Category } from '@/lib/catalog-api';
import {
  catalogHref,
  parseCatalogFilters,
  sortOptions,
  type RawSearchParams,
} from '@/lib/catalog-filters';
import { CategoryFilter } from './category-filter';
import { Pagination } from './pagination';
import { PriceFilter } from './price-filter';
import { ProductGrid, ProductGridSkeleton } from './product-grid';
import { SortSelect } from './sort-select';

const PAGE_SIZE = 12;

/** The product listing with filters, shared by the all-products and category pages. */
export async function CatalogView({
  heading,
  basePath,
  category,
  searchParams,
}: {
  heading: string;
  basePath: string;
  category?: Category;
  searchParams: RawSearchParams;
}) {
  const filters = parseCatalogFilters(searchParams);
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({
      q: filters.q,
      category: category?.slug,
      minPricePaise: filters.minPrice === undefined ? undefined : filters.minPrice * 100,
      maxPricePaise: filters.maxPrice === undefined ? undefined : filters.maxPrice * 100,
      sort: filters.sort,
      page: filters.page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const { totalItems, totalPages } = products.meta;
  const hasFilters =
    filters.q !== undefined || filters.minPrice !== undefined || filters.maxPrice !== undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-muted mt-2 text-sm" role="status">
            {totalItems} {totalItems === 1 ? 'product' : 'products'}
            {filters.q && (
              <>
                {' '}
                matching <span className="text-foreground">“{filters.q}”</span>
                {' · '}
                <Link
                  href={catalogHref(basePath, filters, { q: undefined })}
                  className="hover:text-foreground underline underline-offset-4"
                >
                  Clear search
                </Link>
              </>
            )}
          </p>
        </div>
        <SortSelect
          value={filters.sort}
          choices={sortOptions.map((option) => ({
            ...option,
            href: catalogHref(basePath, filters, { sort: option.value }),
          }))}
        />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[14rem_1fr]">
        <aside className="space-y-8">
          <CategoryFilter categories={categories} activeSlug={category?.slug} filters={filters} />
          <PriceFilter basePath={basePath} filters={filters} />
        </aside>

        <section aria-labelledby="product-results-heading">
          <h2 id="product-results-heading" className="sr-only">
            Products
          </h2>
          {products.data.length > 0 ? (
            <ProductGrid products={products.data} />
          ) : (
            <div className="border-border rounded-lg border border-dashed px-6 py-16 text-center">
              <h3 className="font-medium">No products found</h3>
              <p className="text-muted mt-2 text-sm">
                {hasFilters
                  ? 'Nothing matches the current search and filters.'
                  : 'There are no products here yet.'}
              </p>
              {(hasFilters || filters.page > 1) && (
                <Link
                  href={basePath}
                  className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
                >
                  Clear search and filters
                </Link>
              )}
            </div>
          )}
          <Pagination
            currentPage={filters.page}
            totalPages={totalPages}
            hrefForPage={(page) => catalogHref(basePath, filters, { page })}
          />
        </section>
      </div>
    </div>
  );
}

export function CatalogViewSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" role="status">
      <span className="sr-only">Loading products</span>
      <div className="bg-surface h-9 w-56 animate-pulse rounded" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[14rem_1fr]">
        <div className="bg-surface hidden h-64 animate-pulse rounded-lg lg:block" />
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
