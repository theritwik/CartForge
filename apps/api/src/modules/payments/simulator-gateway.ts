import { env } from '../../config/env.js';
import type { PaymentGateway } from './payment-gateway.js';

/**
 * DEVELOPMENT SIMULATOR, not Stripe. Used only when no Stripe key is
 * configured. It sends the customer to a local page that stands in for
 * Stripe's hosted checkout; see payment-simulator.routes.ts.
 */
export const simulatorGateway: PaymentGateway = {
  createCheckoutSession({ paymentId }) {
    // Derived from the payment id, so repeating the call returns the same session.
    const id = `cs_sim_${paymentId.replaceAll('-', '')}`;
    return Promise.resolve({ id, url: `${env.WEB_ORIGIN}/dev/payment-simulator/${id}` });
  },

  expireCheckoutSession() {
    return Promise.resolve();
  },

  refund(paymentId) {
    // Derived from the payment id, so repeating the call reports the same refund.
    return Promise.resolve({ refundId: `re_sim_${paymentId.replaceAll('-', '')}` });
  },
};
