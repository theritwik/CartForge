import Link from 'next/link';
import { REPOSITORY_URL } from './site-links';

const sectionLinks = [
  { href: '/#overview', label: 'Overview' },
  { href: '/#stack', label: 'Stack' },
  { href: '/#roadmap', label: 'Roadmap' },
];

export function SiteHeader() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          CartForge
        </Link>
        <nav aria-label="Primary" className="order-3 w-full sm:order-none sm:w-auto">
          <ul className="text-muted flex gap-6 text-sm">
            {sectionLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-foreground py-1 transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={REPOSITORY_URL}
          className="border-border hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
