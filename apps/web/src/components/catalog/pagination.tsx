import Link from 'next/link';

const linkClass =
  'border-border hover:bg-surface rounded-md border px-3 py-1.5 text-sm transition-colors';
const disabledClass = 'border-border text-muted rounded-md border px-3 py-1.5 text-sm opacity-50';

/** Page numbers to show: first, last, and the pages around the current one. */
function visiblePages(currentPage: number, totalPages: number): number[] {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

export function Pagination({
  currentPage,
  totalPages,
  hrefForPage,
}: {
  currentPage: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }
  const pages = visiblePages(currentPage, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2">
      {currentPage > 1 ? (
        <Link href={hrefForPage(currentPage - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass}>Previous</span>
      )}
      <ul className="flex items-center gap-2">
        {pages.map((page, index) => {
          const previousPage = pages[index - 1];
          return (
            <li key={page} className="flex items-center gap-2">
              {previousPage !== undefined && page - previousPage > 1 && (
                <span className="text-muted px-1" aria-hidden="true">
                  …
                </span>
              )}
              <Link
                href={hrefForPage(page)}
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                className={
                  page === currentPage
                    ? 'bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium'
                    : linkClass
                }
              >
                {page}
              </Link>
            </li>
          );
        })}
      </ul>
      {currentPage < totalPages ? (
        <Link href={hrefForPage(currentPage + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass}>Next</span>
      )}
    </nav>
  );
}
