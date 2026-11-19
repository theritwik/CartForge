'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { productStatusLabels, type ProductStatus } from '@/lib/admin-format';
import { callApi } from '@/lib/api-client';

const consequences: Record<ProductStatus, string> = {
  ACTIVE: 'It will be on sale in the store.',
  DRAFT: 'It will be hidden from the store but kept for editing.',
  ARCHIVED:
    'It will be removed from the store. Carts that hold it will flag it as unavailable; orders already placed are not affected.',
};

const actions: Record<ProductStatus, ProductStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: ['ACTIVE'],
};

const actionLabels: Record<ProductStatus, string> = {
  ACTIVE: 'Publish',
  DRAFT: 'Move to drafts',
  ARCHIVED: 'Archive',
};

export function ProductStatusActions({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<ProductStatus>();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm(target: ProductStatus) {
    setIsSaving(true);
    setError(undefined);
    const result = await callApi('PATCH', `/admin/products/${productId}`, { status: target });
    setIsSaving(false);
    setPendingStatus(undefined);
    if (!result.ok) {
      setError(result.message);
    }
    router.refresh();
  }

  return (
    <div>
      {pendingStatus ? (
        <div role="group" aria-label="Confirm status change" className="space-y-3">
          <p className="text-sm">
            Change status to <strong>{productStatusLabels[pendingStatus]}</strong>?{' '}
            {consequences[pendingStatus]}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void confirm(pendingStatus)}
              disabled={isSaving}
              autoFocus
              className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : `Yes, ${actionLabels[pendingStatus].toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingStatus(undefined);
              }}
              disabled={isSaving}
              className="text-muted hover:text-foreground text-sm underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {actions[status].map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => {
                setPendingStatus(target);
              }}
              className="border-border hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              {actionLabels[target]}
            </button>
          ))}
        </div>
      )}
      <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
        {error}
      </p>
    </div>
  );
}
