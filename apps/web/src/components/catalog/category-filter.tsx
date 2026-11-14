import Link from 'next/link';
import type { Category } from '@/lib/catalog-api';
import { catalogHref, type CatalogFilters } from '@/lib/catalog-filters';

export function CategoryFilter({
  categories,
  activeSlug,
  filters,
}: {
  categories: Category[];
  activeSlug: string | undefined;
  filters: CatalogFilters;
}) {
  const links = [
    { key: 'all', label: 'All products', basePath: '/products', active: activeSlug === undefined },
    ...categories.map((category) => ({
      key: category.slug,
      label: category.name,
      basePath: `/categories/${category.slug}`,
      active: category.slug === activeSlug,
    })),
  ];

  return (
    <nav aria-label="Categories">
      <h2 className="text-sm font-medium">Category</h2>
      <ul className="mt-3 flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
        {links.map((link) => (
          <li key={link.key}>
            <Link
              href={catalogHref(link.basePath, filters)}
              aria-current={link.active ? 'page' : undefined}
              className={`block rounded-md px-3 py-1.5 text-sm transition-colors lg:-mx-3 ${
                link.active
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted hover:bg-surface hover:text-foreground border-border border lg:border-transparent'
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
