import { z } from 'zod';
import { wholeNumber } from '../../lib/query-params.js';
import { slugSchema } from '../products/products.schemas.js';

const MAX_PRICE_PAISE = 1_000_000_000;
export const MAX_STOCK_QUANTITY = 1_000_000;
const MAX_STOCK_ADJUSTMENT = 100_000;

const productStatus = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
const orderStatus = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
]);

const pagination = {
  page: wholeNumber(1, 10_000).default(1),
  pageSize: wholeNumber(1, 100).default(20),
};

export const idParamsSchema = z.object({ id: z.uuid() });

// Fields listed explicitly: anything else in the body, such as reservedQuantity, is dropped.
const productFields = {
  name: z.string().trim().min(1, 'Enter a name').max(200),
  slug: slugSchema,
  description: z.string().trim().min(1, 'Enter a description').max(5000),
  pricePaise: z
    .number('Enter the price in paise as a whole number')
    .int('Enter the price in paise as a whole number')
    .min(100, 'The price must be at least ₹1')
    .max(MAX_PRICE_PAISE, 'The price is too high'),
  categoryId: z.uuid('Choose a category'),
  status: productStatus,
};

export const createProductSchema = z.object({
  ...productFields,
  status: productStatus.default('DRAFT'),
  stockQuantity: z.number().int().min(0).max(MAX_STOCK_QUANTITY).default(0),
});

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: 'Nothing to update' });

export const adminProductQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: productStatus.optional(),
  categoryId: z.uuid().optional(),
  lowStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  ...pagination,
});

export const stockAdjustmentSchema = z.object({
  /** Units to add (positive) or remove (negative) from physical stock. */
  delta: z
    .number()
    .int()
    .min(-MAX_STOCK_ADJUSTMENT)
    .max(MAX_STOCK_ADJUSTMENT)
    .refine((value) => value !== 0, 'Enter a change other than zero'),
  /** Why the stock changed, for the adjustment history. An empty value means none. */
  reason: z
    .string()
    .trim()
    .max(200, 'Keep the reason to 200 characters')
    .optional()
    .transform((value) => value || undefined),
});

const categoryFields = {
  name: z.string().trim().min(1, 'Enter a name').max(100),
  slug: slugSchema,
};
export const categorySchema = z.object(categoryFields);
export const updateCategorySchema = z
  .object(categoryFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: 'Nothing to update' });

export const adminOrderQuerySchema = z.object({
  status: orderStatus.optional(),
  /** The end of an order id, as shown to customers ("#ABCD1234"), or a full id. */
  reference: z
    .string()
    .trim()
    .transform((value) => value.replace(/^#/, '').toLowerCase())
    .pipe(z.string().regex(/^[0-9a-f-]{4,36}$/, 'Enter at least 4 characters of the order number'))
    .optional(),
  email: z.string().trim().toLowerCase().min(3).max(254).optional(),
  ...pagination,
});

export const orderTransitionSchema = z.object({
  /** The status the administrator saw. The change is refused if the order has moved on. */
  from: orderStatus,
  to: orderStatus,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;
