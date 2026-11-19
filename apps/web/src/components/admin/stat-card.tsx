import Link from 'next/link';
import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  /** Where to see the records behind the figure. */
  href?: string;
}) {
  const body = (
    <>
      <p className="text-muted text-sm">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="text-muted mt-1 text-xs">{detail}</p>}
    </>
  );
  const className = 'border-border block rounded-lg border p-5';

  return href ? (
    <Link href={href} className={`${className} hover:border-foreground transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
