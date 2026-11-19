'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const INTERVAL_MS = 2000;
const MAX_REFRESHES = 20;

/**
 * Re-renders the server page every two seconds while it waits for the payment
 * provider's confirmation to reach the server. It only re-reads the order; it
 * sends nothing that could mark it paid.
 */
export function AutoRefresh() {
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);
  const hasGivenUp = refreshes >= MAX_REFRESHES;

  useEffect(() => {
    if (hasGivenUp) {
      return;
    }
    const timer = setTimeout(() => {
      router.refresh();
      setRefreshes((count) => count + 1);
    }, INTERVAL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [refreshes, hasGivenUp, router]);

  return hasGivenUp ? (
    <p className="text-muted mt-4 text-sm">
      This is taking longer than usual. You can leave this page: the order will update on its own,
      and you will not be charged twice.
    </p>
  ) : null;
}
