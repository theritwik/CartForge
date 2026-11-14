import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ProductGrid } from '@/components/catalog/product-grid';
import { getCategories, getProducts } from '@/lib/catalog-api';

// The catalog is read from the API on every request, not at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CartForge | Electronics, home, fashion, books, and fitness',
};

const FEATURED_PRODUCT_COUNT = 8;

export default async function HomePage() {
  const [categories, newest] = await Promise.all([
    getCategories(),
    getProducts({ sort: 'newest', pageSize: FEATURED_PRODUCT_COUNT }),
  ]);
  const heroProducts = newest.data.filter((product) => product.image).slice(0, 4);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Well-made things for home, work, and play.
          </h1>
          <p className="text-muted mt-5 max-w-md text-lg leading-relaxed">
            A small catalog of electronics, kitchenware, clothing, books, and fitness gear, priced
            in rupees.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="bg-foreground text-background rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              Shop all products
            </Link>
            <a
              href="#categories"
              className="border-border hover:bg-surface rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Browse categories
            </a>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4">
          {heroProducts.map((product, index) => (
            <li key={product.id}>
              <Link
                href={`/products/${product.slug}`}
                className="bg-surface block aspect-square overflow-hidden rounded-lg"
              >
                {product.image && (
                  <Image
                    src={product.image.url}
                    alt={product.image.altText}
                    width={800}
                    height={800}
                    priority={index < 2}
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="h-full w-full object-cover"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="categories" className="border-border border-t">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Shop by category</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="border-border hover:border-foreground block rounded-lg border p-5 transition-colors"
                >
                  <span className="block font-medium">{category.name}</span>
                  <span className="text-muted mt-1 block text-sm">
                    {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-border border-t">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">New arrivals</h2>
            <Link href="/products" className="text-sm font-medium underline underline-offset-4">
              View all
            </Link>
          </div>
          <div className="mt-8">
            <ProductGrid products={newest.data} wide />
          </div>
        </div>
      </section>
    </>
  );
}
