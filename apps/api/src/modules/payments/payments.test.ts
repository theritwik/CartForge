import { randomUUID } from 'node:crypto';
import { truncateAllTables } from '@cartforge/db/testing';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  app,
  clearRateLimits,
  post,
  signUp,
  type SignedUpUser,
} from '../../../tests/auth-helpers.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { stripe } from '../../lib/stripe.js';
import { expireOrder, expireOverdueOrders } from '../orders/orders.service.js';
import { refundPendingPayments } from './payments.service.js';

const WEBHOOK_SECRET = 'whsec_placeholder_for_automated_tests';
const address = {
  name: 'Asha Rao',
  phone: '9876543210',
  addressLine1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

let kettle: { id: string };
let user: SignedUpUser;

// Stand-ins for Stripe's API. Like Stripe, creating a session twice with the
// same idempotency key returns the same session.
const sessionsByIdempotencyKey = new Map<string, { id: string; url: string }>();
let createSession: ReturnType<typeof mockStripe>['createSession'];
let createRefund: ReturnType<typeof mockStripe>['createRefund'];
let expireSession: ReturnType<typeof mockStripe>['expireSession'];

function mockStripe() {
  return {
    createSession: vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockImplementation((_params, options) => {
        const key = (options as { idempotencyKey: string }).idempotencyKey;
        const existing = sessionsByIdempotencyKey.get(key);
        const id = existing?.id ?? `cs_test_${randomUUID().replaceAll('-', '')}`;
        const session = { id, url: `https://checkout.stripe.test/pay/${id}` };
        sessionsByIdempotencyKey.set(key, session);
        return Promise.resolve(session) as never;
      }),
    createRefund: vi
      .spyOn(stripe.refunds, 'create')
      .mockImplementation(() => Promise.resolve({ id: `re_test_${randomUUID()}` }) as never),
    expireSession: vi
      .spyOn(stripe.checkout.sessions, 'expire')
      .mockImplementation(() => Promise.resolve({}) as never),
  };
}

function stockOf(productId: string) {
  return prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stockQuantity: true, reservedQuantity: true },
  });
}

/** Places an order for two kettles (₹1,500 each) and returns its id. */
async function placeOrder(as: SignedUpUser): Promise<string> {
  await post('/api/v1/cart/items')
    .set('Cookie', as.cookie)
    .send({ productId: kettle.id, quantity: 2 });
  const response = await post('/api/v1/orders')
    .set('Cookie', as.cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ shippingAddress: address, expectedTotalPaise: 300_000 });
  if (response.status !== 201) {
    throw new Error(`Checkout failed with status ${response.status}`);
  }
  return (response.body as { data: { id: string } }).data.id;
}

function startPayment(as: SignedUpUser, orderId: string) {
  return post(`/api/v1/orders/${orderId}/payments`).set('Cookie', as.cookie);
}

/** Places an order, starts a payment, and returns the stored payment row. */
async function orderWithPayment(as: SignedUpUser = user) {
  const orderId = await placeOrder(as);
  const response = await startPayment(as, orderId);
  if (response.status !== 201) {
    throw new Error(`Starting the payment failed with status ${response.status}`);
  }
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId, status: 'PENDING' } });
  return { orderId, payment };
}

interface PaymentRow {
  id: string;
  orderId: string;
  amountPaise: number;
  stripeCheckoutSessionId: string | null;
}

/** A Stripe event about a payment's Checkout session, as Stripe would send it. */
function sessionEvent(
  type: string,
  payment: PaymentRow,
  sessionOverrides: Record<string, unknown> = {},
  eventId = `evt_test_${randomUUID()}`,
) {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type,
    data: {
      object: {
        id: payment.stripeCheckoutSessionId,
        object: 'checkout.session',
        payment_status: type === 'checkout.session.expired' ? 'unpaid' : 'paid',
        amount_total: payment.amountPaise,
        currency: 'inr',
        payment_intent: `pi_test_${payment.id}`,
        client_reference_id: payment.orderId,
        metadata: { orderId: payment.orderId, paymentId: payment.id },
        ...sessionOverrides,
      },
    },
  });
}

function paidEvent(payment: PaymentRow, overrides?: Record<string, unknown>, eventId?: string) {
  return sessionEvent('checkout.session.completed', payment, overrides, eventId);
}

/** Delivers a webhook the way Stripe does: no cookie, no Origin, signed raw body. */
function deliver(payload: string, signature?: string) {
  return request(app)
    .post('/api/v1/payments/webhook')
    .set('Content-Type', 'application/json')
    .set(
      'Stripe-Signature',
      signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
    )
    .send(payload);
}

async function stateOf(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const payments = await prisma.payment.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  });
  return { order: order.status, payments: payments.map((payment) => payment.status) };
}

function makeOverdue(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { reservationExpiresAt: new Date(Date.now() - 1000) },
  });
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  sessionsByIdempotencyKey.clear();
  ({ createSession, createRefund, expireSession } = mockStripe());

  await truncateAllTables(prisma);
  await clearRateLimits();
  const category = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  kettle = await prisma.product.create({
    data: {
      name: 'Steel Kettle',
      slug: 'steel-kettle',
      description: 'Kettle for tests.',
      pricePaise: 150_000,
      stockQuantity: 5,
      status: 'ACTIVE',
      categoryId: category.id,
    },
  });
  user = await signUp();
});

afterAll(async () => {
  await redis.close();
  await prisma.$disconnect();
});

describe('POST /api/v1/orders/:orderId/payments', () => {
  it('creates a Checkout session for the order total and returns its URL', async () => {
    const orderId = await placeOrder(user);

    const response = await startPayment(user, orderId);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        paymentId: payment.id,
        checkoutUrl: `https://checkout.stripe.test/pay/${payment.stripeCheckoutSessionId}`,
      },
    });
    expect(payment).toMatchObject({ status: 'PENDING', amountPaise: 300_000 });
    expect(createSession).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        mode: 'payment',
        client_reference_id: orderId,
        customer_email: user.email,
        metadata: { orderId, paymentId: payment.id },
        success_url: `http://localhost:3000/orders/${orderId}/payment/success`,
        cancel_url: `http://localhost:3000/orders/${orderId}/payment/cancelled`,
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: 'inr',
              unit_amount: 300_000,
            }) as unknown,
          }),
        ],
      }),
      { idempotencyKey: `checkout-session-${payment.id}` },
    );
  });

  it('keeps the stock reserved for as long as the payment page stays open', async () => {
    const orderId = await placeOrder(user);
    await startPayment(user, orderId);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    const sessionParams = createSession.mock.calls[0]?.[0] as { expires_at: number };
    const minutesUntil = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / 60_000;

    // Stripe requires at least 30 minutes; the reservation outlasts the session.
    expect(sessionParams.expires_at * 1000 - Date.now()).toBeGreaterThan(30 * 60_000);
    expect(minutesUntil(payment.checkoutExpiresAt)).toBeGreaterThan(30);
    expect(minutesUntil(order.reservationExpiresAt)).toBeGreaterThan(
      minutesUntil(payment.checkoutExpiresAt),
    );
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 2 });
  });

  it('holds no database transaction open while calling Stripe', async () => {
    const orderId = await placeOrder(user);
    let openTransactions = -1;
    createSession.mockImplementationOnce(async () => {
      const [activity] = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND state LIKE 'idle in transaction%'
      `;
      openTransactions = Number(activity?.count);
      return { id: 'cs_test_no_transaction', url: 'https://checkout.stripe.test/pay/x' } as never;
    });

    await startPayment(user, orderId);

    expect(openTransactions).toBe(0);
  });

  it('returns the same payment page when the request is repeated', async () => {
    const orderId = await placeOrder(user);

    const first = await startPayment(user, orderId);
    const repeat = await startPayment(user, orderId);

    expect([first.status, repeat.status]).toEqual([201, 200]);
    expect(repeat.body).toEqual(first.body);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('opens one payment attempt when several requests arrive at once', async () => {
    const orderId = await placeOrder(user);

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => startPayment(user, orderId)),
    );
    const urls = responses.map(
      (response) => (response.body as { data: { checkoutUrl: string } }).data.checkoutUrl,
    );

    expect(responses.every((response) => response.status < 300)).toBe(true);
    expect(new Set(urls).size).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    // Any repeated call to Stripe carried the same idempotency key.
    expect(new Set(createSession.mock.calls.map((call) => JSON.stringify(call[1]))).size).toBe(1);
  });

  it('returns only the page to open, and keeps provider identifiers out of the order', async () => {
    const orderId = await placeOrder(user);

    const payment = await startPayment(user, orderId);
    const order = await request(app).get(`/api/v1/orders/${orderId}`).set('Cookie', user.cookie);

    expect(Object.keys((payment.body as { data: object }).data).sort()).toEqual([
      'checkoutUrl',
      'paymentId',
    ]);
    expect(order.body).toMatchObject({
      data: { payments: [{ status: 'PENDING', amountPaise: 300_000 }] },
    });
    expect(JSON.stringify(order.body)).not.toMatch(
      /cs_test|pi_test|checkout\.stripe|sk_test|whsec/,
    );
  });

  describe('access', () => {
    it('requires a session', async () => {
      const orderId = await placeOrder(user);

      expect((await post(`/api/v1/orders/${orderId}/payments`)).status).toBe(401);
      expect(createSession).not.toHaveBeenCalled();
    });

    it("does not let a customer pay for, or learn of, another customer's order", async () => {
      const otherUser = await signUp();
      const orderId = await placeOrder(user);

      const response = await startPayment(otherUser, orderId);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'ORDER_NOT_FOUND' } });
      expect(createSession).not.toHaveBeenCalled();
      expect(await prisma.payment.count()).toBe(0);
    });

    it('rejects a request that does not come from the web app origin', async () => {
      const orderId = await placeOrder(user);

      const response = await request(app)
        .post(`/api/v1/orders/${orderId}/payments`)
        .set('Origin', 'https://evil.example')
        .set('Cookie', user.cookie);

      expect(response.status).toBe(403);
      expect(createSession).not.toHaveBeenCalled();
    });
  });

  describe('orders that cannot be paid', () => {
    it.each(['CANCELLED', 'EXPIRED', 'PAID'] as const)('refuses a %s order', async (status) => {
      const orderId = await placeOrder(user);
      await prisma.order.update({ where: { id: orderId }, data: { status } });

      const response = await startPayment(user, orderId);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'ORDER_NOT_PAYABLE' } });
      expect(createSession).not.toHaveBeenCalled();
    });

    it('refuses an order whose reservation has run out', async () => {
      const orderId = await placeOrder(user);
      await makeOverdue(orderId);

      expect((await startPayment(user, orderId)).status).toBe(409);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('allows three payment attempts per order', async () => {
      const orderId = await placeOrder(user);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await startPayment(user, orderId)).status).toBe(201);
        await prisma.payment.updateMany({ where: { orderId }, data: { status: 'EXPIRED' } });
      }

      const response = await startPayment(user, orderId);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'PAYMENT_ATTEMPTS_EXHAUSTED' } });
    });
  });

  describe('when Stripe cannot be reached', () => {
    it('reports the failure and lets the same attempt be retried safely', async () => {
      const orderId = await placeOrder(user);
      createSession.mockRejectedValueOnce(
        new Stripe.errors.StripeConnectionError({ message: 'connection reset' }),
      );

      const failed = await startPayment(user, orderId);
      const afterFailure = await stateOf(orderId);
      const retried = await startPayment(user, orderId);

      expect(failed.status).toBe(502);
      expect(failed.body).toEqual({
        error: {
          code: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message: 'The payment service could not be reached. Please try again.',
        },
      });
      expect(afterFailure).toEqual({ order: 'PENDING_PAYMENT', payments: ['PENDING'] });
      expect(retried.status).toBeLessThan(300);
      expect(await prisma.payment.count()).toBe(1);
      // Same idempotency key both times: Stripe cannot end up with two sessions.
      expect(createSession.mock.calls[0]?.[1]).toEqual(createSession.mock.calls[1]?.[1]);
    });

    it('closes an attempt Stripe rejected outright, so the next one starts fresh', async () => {
      const orderId = await placeOrder(user);
      createSession.mockRejectedValueOnce(
        new Stripe.errors.StripeInvalidRequestError({ message: 'expires_at is too soon' }),
      );

      const failed = await startPayment(user, orderId);
      const retried = await startPayment(user, orderId);

      expect([failed.status, retried.status]).toEqual([502, 201]);
      expect(await stateOf(orderId)).toEqual({
        order: 'PENDING_PAYMENT',
        payments: ['FAILED', 'PENDING'],
      });
    });
  });
});

describe('POST /api/v1/payments/webhook', () => {
  describe('signature verification', () => {
    it('accepts a correctly signed event without a cookie or Origin header', async () => {
      const { orderId, payment } = await orderWithPayment();

      const response = await deliver(paidEvent(payment));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
    });

    it.each([
      [
        'a signature made with another secret',
        (payload: string) =>
          stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_someone_else' }),
      ],
      [
        'a signature for a different body',
        () => stripe.webhooks.generateTestHeaderString({ payload: '{}', secret: WEBHOOK_SECRET }),
      ],
      [
        'an old signature being replayed',
        (payload: string) =>
          stripe.webhooks.generateTestHeaderString({
            payload,
            secret: WEBHOOK_SECRET,
            timestamp: Math.floor(Date.now() / 1000) - 3600,
          }),
      ],
      ['a malformed signature', () => 't=1,v1=deadbeef'],
    ])('rejects %s', async (_description, sign) => {
      const { orderId, payment } = await orderWithPayment();
      const payload = paidEvent(payment);

      const response = await deliver(payload, sign(payload));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'INVALID_SIGNATURE' } });
      expect(await stateOf(orderId)).toEqual({ order: 'PENDING_PAYMENT', payments: ['PENDING'] });
      expect(await prisma.processedStripeEvent.count()).toBe(0);
    });

    it('rejects a request with no signature', async () => {
      const { payment } = await orderWithPayment();

      const response = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .send(paidEvent(payment));

      expect(response.status).toBe(400);
    });
  });

  describe('a successful payment', () => {
    it('marks the order paid and turns the reservation into a sale', async () => {
      const { orderId, payment } = await orderWithPayment();

      await deliver(paidEvent(payment));

      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: 'PAID',
        reservationExpiresAt: null,
      });
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
        status: 'SUCCEEDED',
        stripePaymentIntentId: `pi_test_${payment.id}`,
        failureReason: null,
      });
      expect(createRefund).not.toHaveBeenCalled();
    });

    it('ignores a session that completed without the money having arrived', async () => {
      const { orderId, payment } = await orderWithPayment();

      const response = await deliver(paidEvent(payment, { payment_status: 'unpaid' }));

      expect(response.status).toBe(200);
      expect(await stateOf(orderId)).toEqual({ order: 'PENDING_PAYMENT', payments: ['PENDING'] });
    });

    it('accepts a delayed payment that succeeds later', async () => {
      const { orderId, payment } = await orderWithPayment();

      await deliver(sessionEvent('checkout.session.async_payment_succeeded', payment));

      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
    });
  });

  describe('duplicate delivery', () => {
    it('applies an event once when it is delivered again', async () => {
      const { orderId, payment } = await orderWithPayment();
      const payload = paidEvent(payment);

      const responses = [await deliver(payload), await deliver(payload), await deliver(payload)];

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
      expect(await prisma.processedStripeEvent.count()).toBe(1);
    });

    it('applies an event once when copies arrive at the same moment', async () => {
      const { payment } = await orderWithPayment();
      const payload = paidEvent(payment);

      const responses = await Promise.all(Array.from({ length: 6 }, () => deliver(payload)));

      expect(responses.map((response) => response.status)).toEqual(Array(6).fill(200));
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
      expect(createRefund).not.toHaveBeenCalled();
    });

    it('applies the payment once when two different events report it', async () => {
      const { orderId, payment } = await orderWithPayment();

      await Promise.all([
        deliver(paidEvent(payment)),
        deliver(sessionEvent('checkout.session.async_payment_succeeded', payment)),
      ]);

      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
      expect(createRefund).not.toHaveBeenCalled();
    });
  });

  describe('reconciliation', () => {
    it.each([
      ['a different amount', { amount_total: 100 }, 'AMOUNT_MISMATCH'],
      ['a different currency', { currency: 'usd' }, 'CURRENCY_MISMATCH'],
      ['a different order', { metadata: { orderId: randomUUID() } }, 'ORDER_MISMATCH'],
      ['a different session', { id: 'cs_test_another_session' }, 'SESSION_MISMATCH'],
    ])(
      'does not mark the order paid for %s, and refunds the money',
      async (_d, override, reason) => {
        const { orderId, payment } = await orderWithPayment();
        const metadata = {
          orderId,
          paymentId: payment.id,
          ...(override as { metadata?: object }).metadata,
        };

        const response = await deliver(paidEvent(payment, { ...override, metadata }));

        expect(response.status).toBe(200);
        expect(await stateOf(orderId)).toEqual({
          order: 'PENDING_PAYMENT',
          payments: ['REFUNDED'],
        });
        expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject(
          {
            failureReason: reason,
          },
        );
        expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 2 });
        expect(createRefund).toHaveBeenCalledTimes(1);
      },
    );

    it('ignores a paid session that belongs to no payment here', async () => {
      const { orderId, payment } = await orderWithPayment();
      const stranger = {
        ...payment,
        id: randomUUID(),
        stripeCheckoutSessionId: 'cs_test_unknown',
      };

      const response = await deliver(paidEvent(stranger));

      expect(response.status).toBe(200);
      expect(await stateOf(orderId)).toEqual({ order: 'PENDING_PAYMENT', payments: ['PENDING'] });
    });

    it('acknowledges event types it does not act on', async () => {
      const { orderId, payment } = await orderWithPayment();

      const response = await deliver(sessionEvent('customer.created', payment));

      expect(response.status).toBe(200);
      expect(await stateOf(orderId)).toEqual({ order: 'PENDING_PAYMENT', payments: ['PENDING'] });
    });
  });

  describe('failed and abandoned payments', () => {
    it.each([
      ['checkout.session.async_payment_failed', 'FAILED'],
      ['checkout.session.expired', 'EXPIRED'],
    ])(
      'closes the attempt on %s but keeps the order payable for a short while',
      async (type, status) => {
        const { orderId, payment } = await orderWithPayment();

        const response = await deliver(sessionEvent(type, payment, { payment_status: 'unpaid' }));
        const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        const minutesLeft = ((order.reservationExpiresAt?.getTime() ?? 0) - Date.now()) / 60_000;

        expect(response.status).toBe(200);
        expect(await stateOf(orderId)).toEqual({ order: 'PENDING_PAYMENT', payments: [status] });
        expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 2 });
        // No longer held for the full session length: ten minutes to try again.
        expect(minutesLeft).toBeGreaterThan(9);
        expect(minutesLeft).toBeLessThanOrEqual(10);
      },
    );

    it('lets the customer retry with a new attempt after a failure', async () => {
      const { orderId, payment } = await orderWithPayment();
      await deliver(sessionEvent('checkout.session.async_payment_failed', payment));

      const retry = await startPayment(user, orderId);
      const secondAttempt = await prisma.payment.findFirstOrThrow({
        where: { orderId, status: 'PENDING' },
      });
      await deliver(paidEvent(secondAttempt));

      expect(retry.status).toBe(201);
      expect(secondAttempt.id).not.toBe(payment.id);
      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['FAILED', 'SUCCEEDED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
    });

    it('releases the stock when an unpaid order then runs out of time', async () => {
      const { orderId, payment } = await orderWithPayment();
      await deliver(sessionEvent('checkout.session.expired', payment));
      await makeOverdue(orderId);

      await expireOverdueOrders();

      expect(await stateOf(orderId)).toEqual({ order: 'EXPIRED', payments: ['EXPIRED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 0 });
    });
  });

  describe('events out of order', () => {
    it('does not undo a payment when an expiry event arrives after it', async () => {
      const { orderId, payment } = await orderWithPayment();

      await deliver(paidEvent(payment));
      await deliver(sessionEvent('checkout.session.expired', payment));
      await deliver(sessionEvent('checkout.session.async_payment_failed', payment));

      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
    });

    it('accepts a payment whose expiry event arrived first, while the order is still held', async () => {
      const { orderId, payment } = await orderWithPayment();

      await deliver(sessionEvent('checkout.session.expired', payment));
      await deliver(paidEvent(payment));

      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
    });
  });

  describe('late payments', () => {
    it('does not fulfil an order that expired before the payment arrived, and refunds it', async () => {
      const { orderId, payment } = await orderWithPayment();
      await makeOverdue(orderId);
      await expireOverdueOrders();
      // Someone else has since bought the released stock.
      await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 0 } });

      const response = await deliver(paidEvent(payment));

      expect(response.status).toBe(200);
      expect(await stateOf(orderId)).toEqual({ order: 'EXPIRED', payments: ['REFUNDED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 0, reservedQuantity: 0 });
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
        failureReason: 'ORDER_NOT_AWAITING_PAYMENT',
        stripeRefundId: expect.stringMatching(/^re_test_/) as unknown,
      });
      expect(createRefund).toHaveBeenCalledExactlyOnceWith(
        { payment_intent: `pi_test_${payment.id}`, metadata: { paymentId: payment.id } },
        { idempotencyKey: `refund-${payment.id}` },
      );
    });

    it('refunds a payment made after the customer cancelled the order', async () => {
      const { orderId, payment } = await orderWithPayment();
      await post(`/api/v1/orders/${orderId}/cancel`).set('Cookie', user.cookie);

      await deliver(paidEvent(payment));

      // Cancelling closed the payment page at Stripe and locally.
      expect(expireSession).toHaveBeenCalledExactlyOnceWith(payment.stripeCheckoutSessionId);
      expect(await stateOf(orderId)).toEqual({ order: 'CANCELLED', payments: ['REFUNDED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 0 });
    });

    it('refunds the second payment when two attempts for one order are both paid', async () => {
      const { orderId, payment: firstAttempt } = await orderWithPayment();
      await prisma.payment.update({ where: { id: firstAttempt.id }, data: { status: 'EXPIRED' } });
      await startPayment(user, orderId);
      const secondAttempt = await prisma.payment.findFirstOrThrow({
        where: { orderId, status: 'PENDING' },
      });

      await deliver(paidEvent(secondAttempt));
      await deliver(paidEvent(firstAttempt));

      expect(await stateOf(orderId)).toEqual({
        order: 'PAID',
        payments: ['REFUNDED', 'SUCCEEDED'],
      });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
      expect(createRefund).toHaveBeenCalledTimes(1);
    });

    it('keeps a refund owed when Stripe is unreachable, and completes it on a later run', async () => {
      const { orderId, payment } = await orderWithPayment();
      await makeOverdue(orderId);
      await expireOverdueOrders();
      createRefund.mockRejectedValueOnce(
        new Stripe.errors.StripeConnectionError({ message: 'connection reset' }),
      );

      const response = await deliver(paidEvent(payment));
      const afterFailure = await stateOf(orderId);
      const refundedOnRetry = await refundPendingPayments();
      const refundedAgain = await refundPendingPayments();

      // The event is still acknowledged: the refund is tracked in the database, not by Stripe's retries.
      expect(response.status).toBe(200);
      expect(afterFailure).toEqual({ order: 'EXPIRED', payments: ['REFUND_PENDING'] });
      expect([refundedOnRetry, refundedAgain]).toEqual([1, 0]);
      expect(await stateOf(orderId)).toEqual({ order: 'EXPIRED', payments: ['REFUNDED'] });
      // Both calls carried the same idempotency key, so Stripe would refund once.
      expect(createRefund.mock.calls.map((call) => call[1])).toEqual([
        { idempotencyKey: `refund-${payment.id}` },
        { idempotencyKey: `refund-${payment.id}` },
      ]);
    });
  });

  describe('refund coordination', () => {
    async function owedRefund() {
      const { orderId, payment } = await orderWithPayment();
      await makeOverdue(orderId);
      await expireOverdueOrders();
      createRefund.mockRejectedValueOnce(
        new Stripe.errors.StripeConnectionError({ message: 'connection reset' }),
      );
      await deliver(paidEvent(payment));
      return { orderId, payment };
    }

    it('records one refund when several workers retry the same payment at once', async () => {
      const { orderId, payment } = await owedRefund();
      // Like Stripe, return the same refund for the same idempotency key.
      createRefund.mockImplementation(
        (_params, options) =>
          Promise.resolve({
            id: `re_test_${(options as { idempotencyKey: string }).idempotencyKey}`,
          }) as never,
      );

      const refunded = await Promise.all([
        refundPendingPayments(),
        refundPendingPayments(),
        refundPendingPayments(),
      ]);

      expect(refunded.reduce((total, count) => total + count, 0)).toBeGreaterThanOrEqual(1);
      expect(new Set(createRefund.mock.calls.map((call) => JSON.stringify(call[1])))).toEqual(
        new Set([JSON.stringify({ idempotencyKey: `refund-${payment.id}` })]),
      );
      expect(await stateOf(orderId)).toEqual({ order: 'EXPIRED', payments: ['REFUNDED'] });
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
        stripeRefundId: `re_test_refund-${payment.id}`,
      });
    });

    it('records an existing refund when Stripe reports the payment as already refunded', async () => {
      const { orderId, payment } = await owedRefund();
      createRefund.mockRejectedValueOnce(
        new Stripe.errors.StripeInvalidRequestError({
          message: 'Charge has already been refunded.',
          code: 'charge_already_refunded',
        }),
      );
      const listRefunds = vi
        .spyOn(stripe.refunds, 'list')
        .mockImplementation(() => Promise.resolve({ data: [{ id: 're_test_earlier' }] }) as never);

      expect(await refundPendingPayments()).toBe(1);

      expect(listRefunds).toHaveBeenCalledExactlyOnceWith({
        payment_intent: `pi_test_${payment.id}`,
        limit: 1,
      });
      expect(await stateOf(orderId)).toEqual({ order: 'EXPIRED', payments: ['REFUNDED'] });
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
        stripeRefundId: 're_test_earlier',
      });
    });

    it('keeps retrying a refund that Stripe rejects for any other reason', async () => {
      const { orderId } = await owedRefund();
      createRefund.mockRejectedValueOnce(
        new Stripe.errors.StripeInvalidRequestError({ message: 'No such payment_intent' }),
      );

      expect(await refundPendingPayments()).toBe(0);
      expect(await stateOf(orderId)).toEqual({ order: 'EXPIRED', payments: ['REFUND_PENDING'] });
    });
  });

  describe('payment confirmation racing reservation expiry', () => {
    it('ends either paid with the stock sold, or expired with the stock released and a refund', async () => {
      const outcomes = new Set<string>();

      for (let round = 0; round < 6; round += 1) {
        await prisma.product.update({
          where: { id: kettle.id },
          data: { stockQuantity: 5, reservedQuantity: 0 },
        });
        const { orderId, payment } = await orderWithPayment();
        await makeOverdue(orderId);

        const [webhook] = await Promise.all([deliver(paidEvent(payment)), expireOrder(orderId)]);
        const state = await stateOf(orderId);
        const stock = await stockOf(kettle.id);
        outcomes.add(state.order);

        expect(webhook.status).toBe(200);
        // The stock was sold or released, never both and never neither.
        if (state.order === 'PAID') {
          expect(state.payments).toEqual(['SUCCEEDED']);
          expect(stock).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
        } else {
          expect(state).toEqual({ order: 'EXPIRED', payments: ['REFUNDED'] });
          expect(stock).toEqual({ stockQuantity: 5, reservedQuantity: 0 });
        }
      }

      expect([...outcomes].every((outcome) => ['PAID', 'EXPIRED'].includes(outcome))).toBe(true);
    });
  });

  describe('a database failure while handling an event', () => {
    it('changes nothing, answers 500, and succeeds when Stripe delivers the event again', async () => {
      const { orderId, payment } = await orderWithPayment();
      const payload = paidEvent(payment);
      // Selling 2 units when none are reserved violates the stock constraint mid-transaction.
      await prisma.product.update({ where: { id: kettle.id }, data: { reservedQuantity: 0 } });

      const failed = await deliver(payload);
      const afterFailure = await stateOf(orderId);
      const eventsRecorded = await prisma.processedStripeEvent.count();

      await prisma.product.update({ where: { id: kettle.id }, data: { reservedQuantity: 2 } });
      const redelivered = await deliver(payload);

      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
      });
      // Rolled back completely, including the record that the event was seen.
      expect(afterFailure).toEqual({ order: 'PENDING_PAYMENT', payments: ['PENDING'] });
      expect(eventsRecorded).toBe(0);
      expect(redelivered.status).toBe(200);
      expect(await stateOf(orderId)).toEqual({ order: 'PAID', payments: ['SUCCEEDED'] });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
    });
  });
});

describe('what cannot mark an order paid', () => {
  it('ignores the success page: only the webhook changes the order', async () => {
    const { orderId } = await orderWithPayment();

    // The customer landing on the success URL sends nothing to the API that could confirm payment.
    const order = await request(app).get(`/api/v1/orders/${orderId}`).set('Cookie', user.cookie);

    expect(order.body).toMatchObject({ data: { status: 'PENDING_PAYMENT' } });
  });

  it('does not expose the development simulator when a Stripe key is configured', async () => {
    const { payment } = await orderWithPayment();

    const response = await post(
      `/api/v1/dev/payment-simulator/sessions/${payment.stripeCheckoutSessionId}/events`,
    ).send({ outcome: 'paid' });

    expect(response.status).toBe(404);
  });
});
