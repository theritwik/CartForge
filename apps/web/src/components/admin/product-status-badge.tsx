import { productStatusLabels, type ProductStatus } from '@/lib/admin-format';

const toneClasses: Record<ProductStatus, string> = {
  ACTIVE: 'border-transparent bg-emerald-600 text-white',
  DRAFT: 'border-border text-foreground',
  ARCHIVED: 'border-border text-muted',
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${toneClasses[status]}`}
    >
      {productStatusLabels[status]}
    </span>
  );
}

export function StockFigure({
  availableQuantity,
  reservedQuantity,
  isLowStock,
}: {
  availableQuantity: number;
  reservedQuantity: number;
  isLowStock: boolean;
}) {
  return (
    <span className="tabular-nums">
      <span className={isLowStock ? 'text-danger font-medium' : undefined}>
        {availableQuantity} available
      </span>
      {reservedQuantity > 0 && <span className="text-muted"> · {reservedQuantity} reserved</span>}
      {isLowStock && <span className="sr-only"> (low stock)</span>}
    </span>
  );
}
