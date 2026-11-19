import { z } from 'zod';

export const paymentParamsSchema = z.object({ orderId: z.uuid() });
