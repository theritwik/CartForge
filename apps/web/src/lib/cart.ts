import { cache } from 'react';
import { z } from 'zod';
import { fetchAsCurrentUser } from './server-api';

const cartItemSchema = z.object({
  id: z.string(),
  quantity: z.number().int(),
  availability: z.enum(['AVAILABLE', 'INSUFFICIENT_STOCK', 'OUT_OF_STOCK', 'UNAVAILABLE']),
  lineTotalPaise: z.number().int(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    pricePaise: z.number().int(),
    image: z.object({ url: z.string(), altText: z.string() }).nullable(),
    availableQuantity: z.number().int(),
  }),
});

const cartSchema = z.object({
  data: z.object({
    items: z.array(cartItemSchema),
    itemCount: z.number().int(),
    subtotalPaise: z.number().int(),
    hasItemsNeedingAttention: z.boolean(),
    maxQuantityPerItem: z.number().int(),
  }),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type Cart = z.infer<typeof cartSchema>['data'];

/** The signed-in customer's cart, or null for a visitor who is not signed in. */
export const getCart = cache(async (): Promise<Cart | null> => {
  const reply = await fetchAsCurrentUser('/cart');
  return reply.status === 'ok' ? cartSchema.parse(reply.body).data : null;
});
