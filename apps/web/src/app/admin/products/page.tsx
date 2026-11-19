import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { FilterBar, filterInputClass } from '@/components/admin/filter-bar';
import { ProductStatusBadge, StockFigure } from '@/components/admin/product-status-badge';
import { Pagination } from '@/components/catalog/pagination';
import { getAdminCategories, getAdminProducts } from '@/lib/admin-api';
import { parseProductFilters, toQuery } from '@/lib/admin-filters';
import type { RawSearchParams } from '@/lib/catalog-filters';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = { title: 'Products' };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseProductFilters(await searchParams);
  const query = toQuery(filters);
  const [products, categories] = await Promise.all([
    getAdminProducts(query, `/admin/products?${query}`),
    getAdminCategories(),
  ]);
  const isFiltered = Boolean(filters.q ?? filters.status ?? filters.categoryId ?? filters.lowStock);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <Link
          href="/admin/products/new"
          className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        >
          New product
        </Link>
      </div>

      <FilterBar action="/admin/products" isFiltered={isFiltered}>
        <label className="text-muted min-w-48 flex-1 text-xs">
          Search
          <input
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Name or slug"
            className={filterInputClass}
          />
        </label>
        <label className="text-muted text-xs">
          Status
          <select name="status" defaultValue={filters.status ?? ''} className={filterInputClass}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label className="text-muted text-xs">
          Category
          <select
            name="categoryId"
            defaultValue={filters.categoryId ?? ''}
            className={filterInputClass}
          >
            <option value="">Any category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            name="lowStock"
            value="true"
            defaultChecked={filters.lowStock === 'true'}
          />
          Low stock only
        </label>
      </FilterBar>

      <p className="text-muted text-sm" role="status">
        {products.meta.totalItems} {products.meta.totalItems === 1 ? 'product' : 'products'}
      </p>

      {products.data.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center text-sm">
          No products match these filters.
        </div>
      ) : (
        <div className="relative border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-muted border-border border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Product
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Price
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Stock
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {products.data.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-surface h-10 w-10 shrink-0 overflow-hidden rounded">
                        {product.image && (
                          <Image
                            src={product.image.url}
                            alt=""
                            width={80}
                            height={80}
                            className="h-full w-full"
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-muted text-xs">
                          {product.category.name} · /{product.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ProductStatusBadge status={product.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPrice(product.pricePaise)}
                  </td>
                  <td className="px-4 py-3">
                    <StockFigure
                      availableQuantity={product.availableQuantity}
                      reservedQuantity={product.reservedQuantity}
                      isLowStock={product.isLowStock}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="font-medium underline underline-offset-4"
                    >
                      Edit<span className="sr-only"> {product.name}</span>
                    </Link>
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
        hrefForPage={(page) => `/admin/products?${toQuery({ ...filters, page })}`}
      />
    </div>
  );
}
