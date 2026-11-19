import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductStatusBadge } from '@/components/admin/product-status-badge';
import { StockAdjustForm } from '@/components/admin/stock-adjust-form';
import { Pagination } from '@/components/catalog/pagination';
import { getAdminProducts } from '@/lib/admin-api';
import { parseProductFilters, toQuery } from '@/lib/admin-filters';
import type { RawSearchParams } from '@/lib/catalog-filters';

export const metadata: Metadata = { title: 'Inventory' };

const PAGE_SIZE = 50;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseProductFilters(await searchParams);
  const products = await getAdminProducts(
    toQuery({ lowStock: filters.lowStock, page: filters.page, pageSize: PAGE_SIZE }),
    `/admin/inventory?${toQuery({ lowStock: filters.lowStock })}`,
  );
  const tabs = [
    { label: 'All products', href: '/admin/inventory', isCurrent: !filters.lowStock },
    {
      label: 'Low stock',
      href: '/admin/inventory?lowStock=true',
      isCurrent: filters.lowStock === 'true',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm">
          Available units are those in stock minus those reserved by orders awaiting payment. Stock
          cannot be reduced below the reserved amount.
        </p>
      </div>

      <nav aria-label="Inventory views" className="flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.isCurrent ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${tab.isCurrent ? 'bg-foreground text-background font-medium' : 'border-border hover:bg-surface border'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {products.data.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center text-sm">
          {filters.lowStock ? 'No active product is low on stock.' : 'No products yet.'}
        </div>
      ) : (
        <div className="relative border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="text-muted border-border border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Product
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  In stock
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Reserved
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Available
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Adjust
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {products.data.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="mt-1 block">
                      <ProductStatusBadge status={product.status} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{product.stockQuantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{product.reservedQuantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={product.isLowStock ? 'text-danger font-medium' : undefined}>
                      {product.availableQuantity}
                    </span>
                    {product.isLowStock && (
                      <span className="text-danger block text-xs">Low stock</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StockAdjustForm
                      productId={product.id}
                      productName={product.name}
                      reservedQuantity={product.reservedQuantity}
                      compact
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={products.meta.page}
        totalPages={products.meta.totalPages}
        hrefForPage={(page) => `/admin/inventory?${toQuery({ lowStock: filters.lowStock, page })}`}
      />
    </div>
  );
}
