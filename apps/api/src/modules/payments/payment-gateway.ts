import { isPaymentSimulator } from '../../lib/stripe.js';
import { simulatorGateway } from './simulator-gateway.js';
import { stripeGateway } from './stripe-gateway.js';

export interface CheckoutSessionRequest {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  customerEmail: string;
  expiresAt: Date;
}

/** The calls made to the payment provider. None of them may run inside a database transaction. */
export interface PaymentGateway {
  /**
   * Creates the hosted payment page. Repeating the call for the same payment
   * returns the same session instead of creating another.
   */
  createCheckoutSession(request: CheckoutSessionRequest): Promise<{ id: string; url: string }>;
  /** Closes a hosted payment page so it can no longer be paid. */
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** Returns the money for a payment. Repeating the call does not refund twice. */
  refund(paymentId: string, paymentIntentId: string): Promise<{ refundId: string }>;
}

export const paymentGateway: PaymentGateway = isPaymentSimulator ? simulatorGateway : stripeGateway;
