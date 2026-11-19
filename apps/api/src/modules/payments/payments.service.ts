import type { Prisma } from '@cartforge/db';
import Stripe from 'stripe';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { stripe, stripeWebhookSecret } from '../../lib/stripe.js';
import { confirmOrderPayment } from '../orders/orders.service.js';
import { paymentGateway } from './payment-gateway.js';

const MINUTE_MS = 60 * 1000;
/** Stripe requires a Checkout session to stay open for at least 30 minutes. */
const CHECKOUT_SESSION_MINUTES = 31;
/** Stock stays reserved a little longer than the session, to allow for the webhook to arrive. */
const RESERVATION_BUFFER_MINUTES = 5;
/** After a failed or abandoned attempt the customer has this long to try again. */
const RETRY_GRACE_MINUTES = 10;
/** Each attempt extends the stock reservation, so attempts per order are limited. */
export const MAX_PAYMENT_ATTEMPTS = 3;
const REFUND_BATCH_SIZE = 50;

type CheckoutSession = Stripe.Checkout.Session;

/** Statuses in which the money has already been accounted for. */
const SETTLED_STATUSES = ['SUCCEEDED', 'REFUND_PENDING', 'REFUNDED'];

interface PaymentAttempt {
  paymentId: string;
  amountPaise: number;
  checkoutExpiresAt: Date;
  /** Present when the hosted page already exists and can simply be reopened. */
  checkoutUrl: string | null;
  isNew: boolean;
}

/**
 * Step 1 of starting a payment, in one transaction: lock the order, check it
 * can be paid, and record the attempt. No provider call happens here.
 */
async function openPaymentAttempt(userId: string, orderId: string): Promise<PaymentAttempt> {
  return prisma.$transaction(async (tx) => {
    // The lock makes simultaneous requests for one order take turns.
    const [order] = await tx.$queryRaw<
      { status: string; total_paise: number; reservation_expires_at: Date | null }[]
    >`
      SELECT status, total_paise, reservation_expires_at
      FROM orders WHERE id = ${orderId}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE
    `;
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    }
    const now = new Date();
    const reservationEnded =
      order.reservation_expires_at === null || order.reservation_expires_at <= now;
    if (order.status !== 'PENDING_PAYMENT' || reservationEnded) {
      throw new AppError(409, 'ORDER_NOT_PAYABLE', 'This order can no longer be paid for.');
    }

    const openAttempt = await tx.payment.findFirst({ where: { orderId, status: 'PENDING' } });
    if (openAttempt) {
      const stillOpen = openAttempt.checkoutExpiresAt.getTime() > now.getTime() + MINUTE_MS;
      if (stillOpen) {
        // Reuse it. If it has no session yet, an earlier request was interrupted and
        // the provider call is repeated with the same idempotency key.
        return {
          paymentId: openAttempt.id,
          amountPaise: openAttempt.amountPaise,
          checkoutExpiresAt: openAttempt.checkoutExpiresAt,
          checkoutUrl: openAttempt.checkoutUrl,
          isNew: false,
        };
      }
      await tx.payment.update({
        where: { id: openAttempt.id },
        data: { status: 'EXPIRED', failureReason: 'CHECKOUT_SESSION_EXPIRED' },
      });
    }

    const attemptsUsed = await tx.payment.count({
      where: { orderId, stripeCheckoutSessionId: { not: null } },
    });
    if (attemptsUsed >= MAX_PAYMENT_ATTEMPTS) {
      throw new AppError(
        409,
        'PAYMENT_ATTEMPTS_EXHAUSTED',
        'This order has reached its limit of payment attempts. Please place a new order.',
      );
    }

    const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_SESSION_MINUTES * MINUTE_MS);
    const payment = await tx.payment.create({
      data: { orderId, amountPaise: order.total_paise, checkoutExpiresAt },
      select: { id: true },
    });
    // Keep the stock held for as long as the customer can still pay.
    await tx.order.update({
      where: { id: orderId },
      data: {
        reservationExpiresAt: new Date(
          checkoutExpiresAt.getTime() + RESERVATION_BUFFER_MINUTES * MINUTE_MS,
        ),
      },
    });

    return {
      paymentId: payment.id,
      amountPaise: order.total_paise,
      checkoutExpiresAt,
      checkoutUrl: null,
      isNew: true,
    };
  });
}

/**
 * Starts, or resumes, payment for one of the customer's own orders and returns
 * the hosted payment page to send them to.
 */
export async function initiatePayment(user: { id: string; email: string }, orderId: string) {
  const attempt = await openPaymentAttempt(user.id, orderId);
  if (attempt.checkoutUrl) {
    return { paymentId: attempt.paymentId, checkoutUrl: attempt.checkoutUrl, isNew: false };
  }

  // Step 2, with no transaction open: ask the provider for the hosted page.
  let session: { id: string; url: string };
  try {
    session = await paymentGateway.createCheckoutSession({
      paymentId: attempt.paymentId,
      orderId,
      amountPaise: attempt.amountPaise,
      customerEmail: user.email,
      expiresAt: attempt.checkoutExpiresAt,
    });
  } catch (error) {
    logger.error({ err: error, orderId, paymentId: attempt.paymentId }, 'Checkout session failed');
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      // Retrying the same request cannot succeed. Close the attempt so the next one starts fresh.
      await prisma.payment.updateMany({
        where: { id: attempt.paymentId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'PROVIDER_REJECTED_REQUEST' },
      });
    }
    // Otherwise the attempt stays open: trying again repeats the call with the same
    // idempotency key, so a session the provider did create is found, not duplicated.
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'The payment service could not be reached. Please try again.',
    );
  }

  // Step 3: remember the session.
  await prisma.payment.update({
    where: { id: attempt.paymentId },
    data: { stripeCheckoutSessionId: session.id, checkoutUrl: session.url },
  });
  return { paymentId: attempt.paymentId, checkoutUrl: session.url, isNew: attempt.isNew };
}

/** Records the event id. False means this event was already handled. */
async function claimEvent(tx: Prisma.TransactionClient, event: Stripe.Event): Promise<boolean> {
  const { count } = await tx.processedStripeEvent.createMany({
    data: [{ id: event.id, type: event.type }],
    skipDuplicates: true,
  });
  return count === 1;
}

/**
 * Finds the payment a Checkout session belongs to and locks its row, so two
 * events about the same payment are applied one after the other.
 */
async function lockPaymentForSession(tx: Prisma.TransactionClient, session: CheckoutSession) {
  const paymentId = session.metadata?.paymentId;
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM payments
    WHERE id::text = ${paymentId ?? ''} OR stripe_checkout_session_id = ${session.id}
    ORDER BY (id::text = ${paymentId ?? ''}) DESC
    LIMIT 1
    FOR UPDATE
  `;
  return row ? tx.payment.findUniqueOrThrow({ where: { id: row.id } }) : null;
}

/** Why a paid session must not be accepted for this payment, or null if everything matches. */
function reconciliationProblem(
  payment: { orderId: string; amountPaise: number; stripeCheckoutSessionId: string | null },
  orderTotalPaise: number,
  session: CheckoutSession,
): string | null {
  if (session.amount_total !== payment.amountPaise || orderTotalPaise !== payment.amountPaise) {
    return 'AMOUNT_MISMATCH';
  }
  if (session.currency !== 'inr') {
    return 'CURRENCY_MISMATCH';
  }
  if (session.metadata?.orderId !== payment.orderId) {
    return 'ORDER_MISMATCH';
  }
  if (payment.stripeCheckoutSessionId && payment.stripeCheckoutSessionId !== session.id) {
    return 'SESSION_MISMATCH';
  }
  return null;
}

/**
 * Applies a paid Checkout session. The order is marked paid only if it is still
 * awaiting payment and the amount, currency, and order all match. Otherwise the
 * money cannot be kept: the payment is marked REFUND_PENDING and its id is
 * returned so it can be refunded once this transaction has committed.
 */
async function applyPaidSession(
  tx: Prisma.TransactionClient,
  session: CheckoutSession,
): Promise<string | null> {
  const payment = await lockPaymentForSession(tx, session);
  if (!payment) {
    logger.error({ sessionId: session.id }, 'Paid checkout session matches no payment');
    return null;
  }
  if (SETTLED_STATUSES.includes(payment.status)) {
    return null;
  }

  const order = await tx.order.findUniqueOrThrow({
    where: { id: payment.orderId },
    select: { totalPaise: true },
  });
  const problem = reconciliationProblem(payment, order.totalPaise, session);
  // Fails if the order expired, was cancelled, or was already paid by another attempt.
  const isOrderPaid = problem === null && (await confirmOrderPayment(tx, payment.orderId));

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: isOrderPaid ? 'SUCCEEDED' : 'REFUND_PENDING',
      failureReason: isOrderPaid ? null : (problem ?? 'ORDER_NOT_AWAITING_PAYMENT'),
      stripeCheckoutSessionId: payment.stripeCheckoutSessionId ?? session.id,
      stripePaymentIntentId: paymentIntentId,
    },
  });

  if (isOrderPaid) {
    return null;
  }
  logger.warn(
    { paymentId: payment.id, orderId: payment.orderId, reason: problem ?? 'late payment' },
    'Payment received for an order that cannot be fulfilled; refund required',
  );
  return payment.id;
}

/** Closes an attempt that ended without payment and gives the customer a short window to retry. */
async function applyUnpaidSession(
  tx: Prisma.TransactionClient,
  session: CheckoutSession,
  outcome: 'FAILED' | 'EXPIRED',
): Promise<void> {
  const payment = await lockPaymentForSession(tx, session);
  // Anything but PENDING means a later event was handled first; this one changes nothing.
  if (payment?.status !== 'PENDING') {
    return;
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: outcome,
      failureReason: outcome === 'FAILED' ? 'PAYMENT_FAILED' : 'CHECKOUT_SESSION_EXPIRED',
    },
  });
  // Stop holding stock for the full session length now that the attempt is over.
  const retryDeadline = new Date(Date.now() + RETRY_GRACE_MINUTES * MINUTE_MS);
  await tx.order.updateMany({
    where: {
      id: payment.orderId,
      status: 'PENDING_PAYMENT',
      reservationExpiresAt: { gt: retryDeadline },
    },
    data: { reservationExpiresAt: retryDeadline },
  });
}

/**
 * Handles one verified Stripe event. The event id is recorded in the same
 * transaction as the event's effects, so a redelivered event does nothing and a
 * failure leaves no trace, letting Stripe's retry start clean.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status !== 'paid') {
        // Completed with a delayed payment method: the money has not arrived yet.
        return;
      }
      const paymentToRefund = await prisma.$transaction(async (tx) =>
        (await claimEvent(tx, event)) ? applyPaidSession(tx, session) : null,
      );
      if (paymentToRefund) {
        // After the commit, and not fatal: the periodic refund run retries failures.
        await refundPayment(paymentToRefund);
      }
      return;
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const outcome = event.type === 'checkout.session.expired' ? 'EXPIRED' : 'FAILED';
      await prisma.$transaction(async (tx) => {
        if (await claimEvent(tx, event)) {
          await applyUnpaidSession(tx, event.data.object, outcome);
        }
      });
      return;
    }
    default:
      // Not an event this application acts on.
      return;
  }
}

/** Verifies a webhook delivery against its signature and handles the event. */
export async function receiveStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    logger.warn({ err: error }, 'Rejected webhook with an invalid signature');
    throw new AppError(400, 'INVALID_SIGNATURE', 'The webhook signature could not be verified.');
  }
  await handleStripeEvent(event);
}

/**
 * Refunds a payment marked REFUND_PENDING. Returns false, leaving it pending
 * for the next run, if the provider call fails.
 *
 * Safe to run from several API instances at once, and alongside the refund
 * attempted straight after a webhook: every call for one payment carries the
 * same idempotency key, so Stripe creates a single refund, and the status only
 * moves from REFUND_PENDING to REFUNDED once.
 */
export async function refundPayment(paymentId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, status: 'REFUND_PENDING' },
    select: { stripePaymentIntentId: true },
  });
  if (!payment?.stripePaymentIntentId) {
    return false;
  }

  let refundId: string;
  try {
    ({ refundId } = await paymentGateway.refund(paymentId, payment.stripePaymentIntentId));
  } catch (error) {
    logger.error({ err: error, paymentId }, 'Refund failed; it will be retried');
    return false;
  }
  await prisma.payment.updateMany({
    where: { id: paymentId, status: 'REFUND_PENDING' },
    data: { status: 'REFUNDED', stripeRefundId: refundId },
  });
  return true;
}

/** Retries every refund that is still owed. Run periodically. */
export async function refundPendingPayments(): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: { status: 'REFUND_PENDING', stripePaymentIntentId: { not: null } },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: REFUND_BATCH_SIZE,
  });

  let refundedCount = 0;
  for (const { id } of payments) {
    if (await refundPayment(id)) {
      refundedCount += 1;
    }
  }
  return refundedCount;
}

/**
 * Closes any hosted payment page still open for an order, after the customer
 * cancels it. Best effort: if the page is paid anyway, the payment arrives for
 * an order that is no longer awaiting payment and is refunded.
 */
export async function closeOpenPaymentAttempts(orderId: string): Promise<void> {
  const openAttempts = await prisma.payment.findMany({
    where: { orderId, status: 'PENDING' },
    select: { id: true, stripeCheckoutSessionId: true },
  });

  for (const attempt of openAttempts) {
    await prisma.payment.updateMany({
      where: { id: attempt.id, status: 'PENDING' },
      data: { status: 'EXPIRED', failureReason: 'ORDER_CANCELLED' },
    });
    if (attempt.stripeCheckoutSessionId) {
      await paymentGateway
        .expireCheckoutSession(attempt.stripeCheckoutSessionId)
        .catch((error: unknown) => {
          logger.warn({ err: error, paymentId: attempt.id }, 'Could not close checkout session');
        });
    }
  }
}
