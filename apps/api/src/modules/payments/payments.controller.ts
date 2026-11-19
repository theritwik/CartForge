import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { authenticatedUser } from '../../middleware/authenticate.js';
import { paymentParamsSchema } from './payments.schemas.js';
import { initiatePayment, receiveStripeWebhook } from './payments.service.js';

export async function initiatePaymentHandler(req: Request, res: Response): Promise<void> {
  const { orderId } = paymentParamsSchema.parse(req.params);
  const { isNew, ...payment } = await initiatePayment(authenticatedUser(req), orderId);
  res.status(isNew ? 201 : 200).json({ data: payment });
}

/**
 * Called by Stripe, not by a browser: there is no session cookie and no Origin
 * header. The signature over the raw body is what authenticates the request.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.get('Stripe-Signature');
  if (!signature || !Buffer.isBuffer(req.body)) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'The webhook signature could not be verified.');
  }
  await receiveStripeWebhook(req.body, signature);
  res.json({ received: true });
}
