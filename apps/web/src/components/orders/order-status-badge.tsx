import { orderStatusLabels } from '@/lib/order-view';
import type { OrderStatus } from '@/lib/orders';

const toneClasses = {
  pending: 'border-border text-foreground',
  positive: 'border-transparent bg-emerald-600 text-white',
  ended: 'border-border text-muted',
};

const tones: Record<OrderStatus, keyof typeof toneClasses> = {
  PENDING_PAYMENT: 'pending',
  PAID: 'positive',
  PROCESSING: 'positive',
  SHIPPED: 'positive',
  DELIVERED: 'positive',
  CANCELLED: 'ended',
  EXPIRED: 'ended',
  REFUNDED: 'ended',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${toneClasses[tones[status]]}`}
    >
      {orderStatusLabels[status]}
    </span>
  );
}
