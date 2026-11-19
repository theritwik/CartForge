import { formatDay } from '@/lib/admin-format';
import type { AdminDashboard } from '@/lib/admin-api';
import { formatPrice } from '@/lib/format';

const CHART_HEIGHT_PX = 160;

/**
 * Daily revenue from paid orders. One series, so no legend: the heading names
 * it. Each bar shows its exact figures on hover or keyboard focus, and the same
 * figures are in a table for screen readers.
 */
export function SalesTrendChart({ days }: { days: AdminDashboard['salesTrend'] }) {
  const highest = Math.max(...days.map((day) => day.revenuePaise), 0);
  const total = days.reduce((sum, day) => sum + day.revenuePaise, 0);

  return (
    <figure>
      <div className="flex items-baseline justify-between gap-4">
        <figcaption className="font-medium">Paid sales, last 14 days</figcaption>
        <p className="text-muted text-sm tabular-nums">{formatPrice(total)} in total</p>
      </div>

      <div className="mt-6">
        <div
          className="border-border flex items-end gap-0.5 border-b"
          style={{ height: CHART_HEIGHT_PX }}
        >
          {days.map((day) => {
            const heightPercent = highest === 0 ? 0 : (day.revenuePaise / highest) * 100;
            const summary = `${formatDay(day.date)}: ${formatPrice(day.revenuePaise)} from ${day.orderCount} ${day.orderCount === 1 ? 'order' : 'orders'}`;
            return (
              // The whole column is the hover and focus target, not only the bar.
              <div
                key={day.date}
                role="img"
                tabIndex={0}
                aria-label={summary}
                className="group relative flex h-full flex-1 items-end rounded-t outline-offset-2"
              >
                <div
                  className="bg-chart w-full rounded-t"
                  style={{ height: day.revenuePaise > 0 ? `max(${heightPercent}%, 2px)` : 0 }}
                />
                <div
                  aria-hidden="true"
                  className="bg-background border-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md border px-3 py-2 text-xs whitespace-nowrap shadow-sm group-hover:block group-focus:block"
                >
                  <p className="font-medium">{formatDay(day.date)}</p>
                  <p className="tabular-nums">{formatPrice(day.revenuePaise)}</p>
                  <p className="text-muted">
                    {day.orderCount} {day.orderCount === 1 ? 'order' : 'orders'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-muted mt-2 flex justify-between text-xs" aria-hidden="true">
          <span>{days[0] ? formatDay(days[0].date) : ''}</span>
          <span>{days.at(-1) ? formatDay(days.at(-1)?.date ?? '') : ''}</span>
        </div>
      </div>

      <table className="sr-only">
        <caption>Paid sales by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Revenue</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{formatDay(day.date)}</td>
              <td>{formatPrice(day.revenuePaise)}</td>
              <td>{day.orderCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted mt-3 text-xs">
        By the day the order was placed, in Indian time. Only orders that have been paid count.
      </p>
    </figure>
  );
}
