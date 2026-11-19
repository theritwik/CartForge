import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { stripe } from '../../lib/stripe.js';
import type { PaymentGateway } from './payment-gateway.js';

export const stripeGateway: PaymentGateway = {
  async createCheckoutSession({ paymentId, orderId, amountPaise, customerEmail, expiresAt }) {
    const reference = { orderId, paymentId };
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: orderId,
        customer_email: customerEmail,
        // One line for the order total, which the server calculated when the order was placed.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'inr',
              unit_amount: amountPaise,
              product_data: { name: `CartForge order #${orderId.slice(-8).toUpperCase()}` },
            },
          },
        ],
        metadata: reference,
        payment_intent_data: { metadata: reference },
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        // The customer only returns here. These pages never mark an order paid.
        success_url: `${env.WEB_ORIGIN}/orders/${orderId}/payment/success`,
        cancel_url: `${env.WEB_ORIGIN}/orders/${orderId}/payment/cancelled`,
      },
      { idempotencyKey: `checkout-session-${paymentId}` },
    );
    if (!session.url) {
      throw new Error(`Stripe returned checkout session ${session.id} without a URL.`);
    }
    return { id: session.id, url: session.url };
  },

  async expireCheckoutSession(sessionId) {
    await stripe.checkout.sessions.expire(sessionId);
  },

  async refund(paymentId, paymentIntentId) {
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntentId, metadata: { paymentId } },
        { idempotencyKey: `refund-${paymentId}` },
      );
      return { refundId: refund.id };
    } catch (error) {
      // Stripe forgets idempotency keys after 24 hours. A refund that succeeded before
      // then, but was never recorded here, now fails as already refunded: find it instead.
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'charge_already_refunded'
      ) {
        const existing = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 1 });
        const [refund] = existing.data;
        if (refund) {
          return { refundId: refund.id };
        }
      }
      throw error;
    }
  },
};
