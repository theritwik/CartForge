import { describe, expect, it } from 'vitest';
import {
  canCancel,
  formatPhone,
  orderNumber,
  orderProgress,
  orderStatusLabels,
  orderStatusMessage,
} from './order-view';
import { orderStatusSchema } from './orders';

describe('orderProgress', () => {
  it('marks earlier stages done and later stages upcoming', () => {
    expect(orderProgress('PROCESSING')).toEqual([
      { label: 'Order placed', state: 'done' },
      { label: 'Paid', state: 'done' },
      { label: 'Processing', state: 'current' },
      { label: 'Shipped', state: 'upcoming' },
      { label: 'Delivered', state: 'upcoming' },
    ]);
  });

  it('shows a new order as placed and not yet paid', () => {
    expect(orderProgress('PENDING_PAYMENT')?.map((step) => step.state)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it.each(['CANCELLED', 'EXPIRED', 'REFUNDED'] as const)(
    'has no tracker for a %s order',
    (status) => {
      expect(orderProgress(status)).toBeNull();
    },
  );
});

describe('orderStatusMessage', () => {
  it('says until when items are reserved, in Indian time, and that payment is unavailable', () => {
    const message = orderStatusMessage({
      status: 'PENDING_PAYMENT',
      reservationExpiresAt: new Date('2026-11-14T13:45:00Z'),
    });

    expect(message).toContain('reserved until 7:15 pm IST');
    expect(message).toContain('payment is not available yet');
  });

  it('never describes an unpaid order as paid', () => {
    for (const status of ['PENDING_PAYMENT', 'CANCELLED', 'EXPIRED'] as const) {
      expect(orderStatusMessage({ status, reservationExpiresAt: null })).not.toMatch(
        /payment received/i,
      );
    }
  });
});

describe('status labels', () => {
  it('has a label for every status the API can return', () => {
    expect(Object.keys(orderStatusLabels).sort()).toEqual([...orderStatusSchema.options].sort());
    expect(orderStatusLabels.PENDING_PAYMENT).toBe('Awaiting payment');
  });
});

describe('orderNumber', () => {
  it('shows the last eight characters of the id', () => {
    expect(orderNumber('01a1dc0e-1111-7222-8333-4444abcd1234')).toBe('#ABCD1234');
  });
});

describe('canCancel', () => {
  it('allows cancelling only while awaiting payment', () => {
    expect(orderStatusSchema.options.filter(canCancel)).toEqual(['PENDING_PAYMENT']);
  });
});

describe('formatPhone', () => {
  it('groups a stored Indian mobile number for reading', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });
});
