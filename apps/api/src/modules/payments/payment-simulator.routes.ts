/**
 * DEVELOPMENT SIMULATOR, not Stripe. Mounted only when no Stripe key is
 * configured, which production does not allow.
 *
 * It plays Stripe's part after the customer leaves the hosted page: it builds
 * an event shaped like Stripe's, signs it with the webhook secret exactly as
 * Stripe would, and passes it through the same verification and handling code
 * as a real webhook delivery.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { stripe, stripeWebhookSecret } from '../../lib/stripe.js';
import { receiveStripeWebhook } from './payments.service.js';

const paramsSchema = z.object({ sessionId: z.string().regex(/^cs_sim_[0-9a-f]{32}$/) });
const outcomeSchema = z.object({ outcome: z.enum(['paid', 'failed', 'expired']) });

const eventTypes = {
  paid: 'checkout.session.completed',
  failed: 'checkout.session.async_payment_failed',
  expired: 'checkout.session.expired',
} as const;

async function findSimulatedPayment(sessionId: string) {
  const payment = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true, orderId: true, amountPaise: true, status: true },
  });
  if (!payment) {
    throw new AppError(404, 'SIMULATED_SESSION_NOT_FOUND', 'No simulated payment session found.');
  }
  return payment;
}

export const paymentSimulatorRouter = Router();

paymentSimulatorRouter.get('/sessions/:sessionId', async (req, res) => {
  const { sessionId } = paramsSchema.parse(req.params);
  res.json({ data: await findSimulatedPayment(sessionId) });
});

paymentSimulatorRouter.post('/sessions/:sessionId/events', async (req, res) => {
  const { sessionId } = paramsSchema.parse(req.params);
  const { outcome } = outcomeSchema.parse(req.body);
  const payment = await findSimulatedPayment(sessionId);

  const payload = JSON.stringify({
    id: `evt_sim_${randomUUID().replaceAll('-', '')}`,
    object: 'event',
    type: eventTypes[outcome],
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: outcome === 'paid' ? 'paid' : 'unpaid',
        amount_total: payment.amountPaise,
        currency: 'inr',
        payment_intent: outcome === 'paid' ? `pi_sim_${payment.id.replaceAll('-', '')}` : null,
        client_reference_id: payment.orderId,
        metadata: { orderId: payment.orderId, paymentId: payment.id },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: stripeWebhookSecret,
  });

  await receiveStripeWebhook(Buffer.from(payload), signature);
  res.status(204).end();
});
