import Image from 'next/image';
import Link from 'next/link';
import type { ProductSummary } from '@/lib/catalog-api';
import { formatPrice } from '@/lib/format';

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="bg-surface relative aspect-square overflow-hidden rounded-lg">
        {product.image && (
          <Image
            src={product.image.url}
            alt={product.image.altText}
            width={800}
            height={800}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className={`h-full w-full object-cover ${product.inStock ? '' : 'opacity-60'}`}
          />
        )}
        {!product.inStock && (
          <span className="bg-background text-foreground absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-medium">
            Out of stock
          </span>
        )}
      </div>
      <p className="text-muted mt-3 text-xs">{product.category.name}</p>
      <h3 className="mt-1 line-clamp-2 text-sm font-medium underline-offset-4 group-hover:underline">
        {product.name}
      </h3>
      <p className="mt-1 text-sm">{formatPrice(product.pricePaise)}</p>
    </Link>
  );
}
