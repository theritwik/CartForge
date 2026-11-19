import type { Metadata } from 'next';
import { CategoryManager } from '@/components/admin/category-manager';
import { getAdminCategories } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'Categories' };

export default async function AdminCategoriesPage() {
  const categories = await getAdminCategories();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Categories</h1>
      <CategoryManager categories={categories} />
    </div>
  );
}
