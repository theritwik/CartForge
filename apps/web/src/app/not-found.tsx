import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
      <p className="text-muted font-mono text-sm">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted mx-auto mt-3 max-w-md">
        The page or product you are looking for does not exist or is no longer available.
      </p>
      <Link
        href="/products"
        className="bg-foreground text-background mt-6 inline-block rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        Browse all products
      </Link>
    </div>
  );
}
