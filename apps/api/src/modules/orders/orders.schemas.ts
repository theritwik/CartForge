import { z } from 'zod';
import { wholeNumber } from '../../lib/query-params.js';

const line = (max: number) => z.string().trim().min(1).max(max);

const shippingAddressSchema = z.object({
  name: line(100),
  // An Indian mobile number, stored as +91 followed by ten digits.
  phone: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(\+91|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'))
    .transform((value) => `+91${value.slice(-10)}`),
  addressLine1: line(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: line(100),
  state: line(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
});

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  /**
   * The total the customer was shown. It is never used as the price: the order
   * is refused if it differs from the total the server calculates.
   */
  expectedTotalPaise: z.number().int().min(0),
});

export const idempotencyKeySchema = z.uuid('Send a UUID in the Idempotency-Key header');

export const orderParamsSchema = z.object({ orderId: z.uuid() });

export const listOrdersQuerySchema = z.object({
  page: wholeNumber(1, 10_000).default(1),
  pageSize: wholeNumber(1, 50).default(10),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
