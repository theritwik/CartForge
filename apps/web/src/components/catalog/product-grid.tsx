import type { ProductSummary } from '@/lib/catalog-api';
import { ProductCard } from './product-card';

const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6';

export function ProductGrid({
  products,
  wide = false,
}: {
  products: ProductSummary[];
  /** Use four columns on large screens, for sections without a filter sidebar. */
  wide?: boolean;
}) {
  return (
    <ul className={`${gridClass} ${wide ? 'lg:grid-cols-4' : ''}`}>
      {products.map((product) => (
        <li key={product.id} className="h-full">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className={gridClass} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="animate-pulse">
          <div className="bg-surface aspect-square rounded-lg" />
          <div className="bg-surface mt-3 h-3 w-1/3 rounded" />
          <div className="bg-surface mt-2 h-4 w-4/5 rounded" />
          <div className="bg-surface mt-2 h-4 w-1/4 rounded" />
        </li>
      ))}
    </ul>
  );
}
