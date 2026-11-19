import type { OrderStatus } from '@cartforge/db';

/**
 * The status changes an administrator may make. Anything not listed is refused.
 *
 * - PAID is never a target: only a verified payment webhook marks an order paid.
 * - Cancelling is allowed only before payment, because it returns the reserved
 *   stock. A paid order must be refunded, which is not supported here yet.
 * - CANCELLED, EXPIRED, DELIVERED, and REFUNDED are final.
 */
export const ADMIN_ORDER_TRANSITIONS: Readonly<
  Partial<Record<OrderStatus, readonly OrderStatus[]>>
> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['PROCESSING'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
};

export function allowedAdminTransitions(status: OrderStatus): readonly OrderStatus[] {
  return ADMIN_ORDER_TRANSITIONS[status] ?? [];
}

export function isAllowedAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedAdminTransitions(from).includes(to);
}
