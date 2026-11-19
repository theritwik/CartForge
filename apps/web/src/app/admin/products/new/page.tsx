import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductForm } from '@/components/admin/product-form';
import { getAdminCategories } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const categories = await getAdminCategories();

  return (
    <div className="max-w-2xl">
      <Link href="/admin/products" className="text-muted hover:text-foreground text-sm">
        ← Products
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">New product</h1>
      {categories.length === 0 ? (
        <p className="mt-6 text-sm">
          Create a{' '}
          <Link href="/admin/categories" className="underline underline-offset-4">
            category
          </Link>{' '}
          first.
        </p>
      ) : (
        <div className="mt-8">
          <ProductForm categories={categories} />
        </div>
      )}
    </div>
  );
}
