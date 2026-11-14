'use client';

import { useEffect } from 'react';

export default function ShopError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6" role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">The catalog could not be loaded</h1>
      <p className="text-muted mx-auto mt-3 max-w-md">
        Something went wrong while contacting the store. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={retry}
        className="bg-foreground text-background mt-6 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
