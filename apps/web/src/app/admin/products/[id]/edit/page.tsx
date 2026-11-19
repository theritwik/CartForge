import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductForm } from '@/components/admin/product-form';
import { ProductStatusActions } from '@/components/admin/product-status-actions';
import { ProductStatusBadge } from '@/components/admin/product-status-badge';
import { StockAdjustForm } from '@/components/admin/stock-adjust-form';
import { getAdminCategories, getAdminProduct } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([getAdminProduct(id), getAdminCategories()]);

  return (
    <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1fr_20rem]">
      <div className="max-w-2xl">
        <Link href="/admin/products" className="text-muted hover:text-foreground text-sm">
          ← Products
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <ProductStatusBadge status={product.status} />
        </div>
        {product.status === 'ACTIVE' && (
          <Link
            href={`/products/${product.slug}`}
            className="mt-2 inline-block text-sm underline underline-offset-4"
          >
            View in store
          </Link>
        )}
        <div className="mt-8">
          <ProductForm
            key={product.updatedAt.toISOString()}
            product={product}
            categories={categories}
          />
        </div>
      </div>

      <aside className="space-y-6">
        <section
          aria-labelledby="visibility-heading"
          className="border-border rounded-lg border p-5"
        >
          <h2 id="visibility-heading" className="font-medium">
            Visibility
          </h2>
          <div className="mt-4">
            <ProductStatusActions productId={product.id} status={product.status} />
          </div>
        </section>
        <section aria-labelledby="stock-heading" className="border-border rounded-lg border p-5">
          <h2 id="stock-heading" className="font-medium">
            Stock
          </h2>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['In stock', product.stockQuantity],
              ['Reserved', product.reservedQuantity],
              ['Available', product.availableQuantity],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface rounded-md py-3">
                <dt className="text-muted text-xs">{label}</dt>
                <dd
                  className={`mt-1 text-lg font-semibold tabular-nums ${label === 'Available' && product.isLowStock ? 'text-danger' : ''}`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted mt-3 text-xs">
            Reserved units are held by orders awaiting payment.
          </p>
          <div className="mt-4">
            <StockAdjustForm
              productId={product.id}
              productName={product.name}
              reservedQuantity={product.reservedQuantity}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
