import type { OrderStatus } from './orders';

export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
};

const PROGRESS_STEPS: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
];

export interface ProgressStep {
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

/**
 * The stages an order moves through, for the progress tracker. Returns null for
 * an order that left the normal path (cancelled, expired, refunded).
 */
export function orderProgress(status: OrderStatus): ProgressStep[] | null {
  const currentIndex = PROGRESS_STEPS.indexOf(status);
  if (currentIndex === -1) {
    return null;
  }
  return PROGRESS_STEPS.map((step, index) => ({
    label: index === 0 ? 'Order placed' : orderStatusLabels[step],
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});
const dateFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

export function formatOrderDate(date: Date): string {
  return dateFormat.format(date);
}

export function formatOrderDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/** What the current status means for the customer, in one or two sentences. */
export function orderStatusMessage(order: {
  status: OrderStatus;
  reservationExpiresAt: Date | null;
}): string {
  switch (order.status) {
    case 'PENDING_PAYMENT': {
      const held = order.reservationExpiresAt
        ? `Your items are reserved until ${timeFormat.format(order.reservationExpiresAt)} IST.`
        : 'Your items are reserved.';
      return `${held} Online payment is not available yet, so this order cannot be paid for and will expire.`;
    }
    case 'PAID':
      return 'Payment received. The order is waiting to be prepared.';
    case 'PROCESSING':
      return 'The order is being prepared for dispatch.';
    case 'SHIPPED':
      return 'The order is on its way.';
    case 'DELIVERED':
      return 'The order has been delivered.';
    case 'CANCELLED':
      return 'This order was cancelled and its items were returned to stock.';
    case 'EXPIRED':
      return 'This order was not paid for in time. Its items were returned to stock.';
    case 'REFUNDED':
      return 'This order was refunded.';
  }
}

/** A short reference for display. The full id stays in the URL. */
export function orderNumber(orderId: string): string {
  return `#${orderId.slice(-8).toUpperCase()}`;
}

export function canCancel(status: OrderStatus): boolean {
  return status === 'PENDING_PAYMENT';
}

/** "+919876543210" as "+91 98765 43210". */
export function formatPhone(phone: string): string {
  return phone.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
}
