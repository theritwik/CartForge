import Form from 'next/form';
import Link from 'next/link';
import { catalogHref, type CatalogFilters } from '@/lib/catalog-filters';

const inputClass =
  'border-border bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm tabular-nums';

export function PriceFilter({ basePath, filters }: { basePath: string; filters: CatalogFilters }) {
  const hasPriceFilter = filters.minPrice !== undefined || filters.maxPrice !== undefined;

  return (
    <Form action={basePath} aria-labelledby="price-filter-heading">
      <h2 id="price-filter-heading" className="text-sm font-medium">
        Price
      </h2>
      {/* Keep the current search and sort order when the price range changes. */}
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {filters.sort !== 'newest' && <input type="hidden" name="sort" value={filters.sort} />}
      <div className="mt-3 flex items-end gap-2">
        <label className="text-muted flex-1 text-xs">
          Min (₹)
          <input
            name="minPrice"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={filters.minPrice}
            className={inputClass}
          />
        </label>
        <label className="text-muted flex-1 text-xs">
          Max (₹)
          <input
            name="maxPrice"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={filters.maxPrice}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="submit"
          className="border-border hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Apply
        </button>
        {hasPriceFilter && (
          <Link
            href={catalogHref(basePath, filters, { minPrice: undefined, maxPrice: undefined })}
            className="text-muted hover:text-foreground text-sm underline underline-offset-4"
          >
            Clear price
          </Link>
        )}
      </div>
    </Form>
  );
}
