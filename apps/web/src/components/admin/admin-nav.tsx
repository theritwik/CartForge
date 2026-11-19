'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/categories', label: 'Categories' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration">
      <ul className="relative flex gap-1 overflow-x-auto lg:flex-col">
        {links.map((link) => {
          const isCurrent =
            link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                  isCurrent
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
