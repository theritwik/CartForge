import Form from 'next/form';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** A row of filters submitted as a GET form, so the filters live in the URL. */
export function FilterBar({
  action,
  children,
  isFiltered,
}: {
  action: string;
  children: ReactNode;
  isFiltered: boolean;
}) {
  return (
    <Form
      action={action}
      className="border-border flex flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      {children}
      <button
        type="submit"
        className="border-border hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium transition-colors"
      >
        Apply
      </button>
      {isFiltered && (
        <Link
          href={action}
          className="text-muted hover:text-foreground py-2 text-sm underline underline-offset-4"
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}

export const filterInputClass =
  'bg-background border-border mt-1 block w-full rounded-md border px-3 py-2 text-sm';
