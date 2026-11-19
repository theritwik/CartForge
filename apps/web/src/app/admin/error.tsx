'use client';

import { useEffect } from 'react';

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="border-border rounded-lg border px-6 py-16 text-center" role="alert">
      <h1 className="text-xl font-semibold tracking-tight">This page could not be loaded</h1>
      <p className="text-muted mx-auto mt-3 max-w-md text-sm">
        Something went wrong while contacting the store API. Nothing was changed.
      </p>
      <button
        type="button"
        onClick={retry}
        className="bg-foreground text-background mt-6 rounded-md px-5 py-2.5 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
