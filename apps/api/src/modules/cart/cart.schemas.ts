import { z } from 'zod';

/** The most units of one product a cart may hold. */
export const MAX_QUANTITY_PER_ITEM = 10;

const quantity = z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM);

// Unknown keys such as a price are dropped: z.object() keeps only the fields listed.
export const addCartItemSchema = z.object({
  productId: z.uuid(),
  quantity: quantity.default(1),
});

export const updateCartItemSchema = z.object({ quantity });

export const cartItemParamsSchema = z.object({ itemId: z.uuid() });

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
