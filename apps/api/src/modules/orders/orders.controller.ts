import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticatedUser } from '../../middleware/authenticate.js';
import {
  checkoutSchema,
  idempotencyKeySchema,
  listOrdersQuerySchema,
  orderParamsSchema,
} from './orders.schemas.js';
import { closeOpenPaymentAttempts } from '../payments/payments.service.js';
import { cancelOrder, checkout, getOrder, listOrders } from './orders.service.js';

// Every handler takes the user from the session, and every query is limited to that user's orders.

export async function checkoutHandler(req: Request, res: Response): Promise<void> {
  const { idempotencyKey } = z
    .object({ idempotencyKey: idempotencyKeySchema })
    .parse({ idempotencyKey: req.get('Idempotency-Key') });
  const input = checkoutSchema.parse(req.body);

  const { order, isNew } = await checkout(authenticatedUser(req).id, idempotencyKey, input);
  res.status(isNew ? 201 : 200).json({ data: order });
}

export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  const query = listOrdersQuerySchema.parse(req.query);
  res.json(await listOrders(authenticatedUser(req).id, query));
}

export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  const { orderId } = orderParamsSchema.parse(req.params);
  res.json({ data: await getOrder(authenticatedUser(req).id, orderId) });
}

export async function cancelOrderHandler(req: Request, res: Response): Promise<void> {
  const { orderId } = orderParamsSchema.parse(req.params);
  await cancelOrder(authenticatedUser(req).id, orderId);
  // After the order is cancelled, so a failure here cannot undo the cancellation.
  await closeOpenPaymentAttempts(orderId);
  res.json({ data: await getOrder(authenticatedUser(req).id, orderId) });
}
