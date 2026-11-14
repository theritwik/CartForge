import Link from 'next/link';
import { REPOSITORY_URL } from './site-links';

export function SiteFooter() {
  return (
    <footer className="border-border mt-16 border-t">
      <div className="text-muted mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <p className="max-w-md">
          CartForge is a portfolio project. Product images are placeholders, and checkout is not
          available yet.
        </p>
        <ul className="flex gap-6">
          <li>
            <Link href="/products" className="hover:text-foreground underline underline-offset-4">
              All products
            </Link>
          </li>
          <li>
            <a href={REPOSITORY_URL} className="hover:text-foreground underline underline-offset-4">
              Source on GitHub
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
