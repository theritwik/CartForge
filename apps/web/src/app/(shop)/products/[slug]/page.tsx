import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCartButton } from '@/components/cart/add-to-cart-button';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { getProduct } from '@/lib/catalog-api';
import { formatPrice } from '@/lib/format';

const LOW_STOCK_THRESHOLD = 5;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) {
    return { title: 'Product not found' };
  }
  return { title: product.name, description: product.description };
}

function StockStatus({ availableQuantity }: { availableQuantity: number }) {
  if (availableQuantity === 0) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="bg-muted h-2 w-2 rounded-full" aria-hidden="true" />
        Out of stock
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
      {availableQuantity <= LOW_STOCK_THRESHOLD ? `Only ${availableQuantity} left` : 'In stock'}
    </p>
  );
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct((await params).slug);
  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-muted text-sm">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/products" className="hover:text-foreground">
              All products
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/categories/${product.category.slug}`} className="hover:text-foreground">
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductGallery images={product.images} />

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{product.name}</h1>
          <p className="mt-4 text-2xl tabular-nums">{formatPrice(product.pricePaise)}</p>
          <div className="mt-4">
            <StockStatus availableQuantity={product.availableQuantity} />
          </div>

          <div className="mt-8">
            {product.inStock ? (
              <AddToCartButton productId={product.id} productName={product.name} />
            ) : (
              <p className="border-border text-muted rounded-lg border px-4 py-3 text-sm">
                This product cannot be added to the cart while it is out of stock.
              </p>
            )}
          </div>

          <h2 className="mt-8 text-sm font-medium">Description</h2>
          <p className="text-muted mt-2 leading-relaxed">{product.description}</p>
        </div>
      </div>
    </div>
  );
}
