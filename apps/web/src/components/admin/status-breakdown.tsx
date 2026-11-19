import Link from 'next/link';
import type { AdminDashboard } from '@/lib/admin-api';
import { orderStatusLabels } from '@/lib/order-view';

/** Orders by status: a labelled bar per status, with the count written beside it. */
export function StatusBreakdown({ rows }: { rows: AdminDashboard['orders']['byStatus'] }) {
  const highest = Math.max(...rows.map((row) => row.count), 0);

  return (
    <figure>
      <figcaption className="font-medium">Orders by status</figcaption>
      {rows.length === 0 ? (
        <p className="text-muted mt-4 text-sm">No orders yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.status}>
              <Link
                href={`/admin/orders?status=${row.status}`}
                className="group grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm"
              >
                <span className="group-hover:underline">{orderStatusLabels[row.status]}</span>
                <span className="bg-surface h-2.5 overflow-hidden rounded-full" aria-hidden="true">
                  <span
                    className="bg-chart block h-full rounded-full"
                    style={{ width: `${(row.count / highest) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{row.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
