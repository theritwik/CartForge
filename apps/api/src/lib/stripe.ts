import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { env } from '../config/env.js';

/**
 * Without a Stripe key (development and tests only: production refuses to
 * start without one, and is excluded here as a second guard), payments run against the local simulator. The client below is then
 * used only to sign and verify simulated webhook events and never calls Stripe.
 */
export const isPaymentSimulator =
  env.NODE_ENV !== 'production' && env.STRIPE_SECRET_KEY === undefined;

export const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? 'sk_test_simulator_makes_no_requests', {
  maxNetworkRetries: 2,
  timeout: 10_000,
});

export const stripeWebhookSecret =
  env.STRIPE_WEBHOOK_SECRET ?? `whsec_simulator_${randomBytes(24).toString('hex')}`;
