# Verifying payments against Stripe test mode

**Status: not verified.** Every automated test replaces Stripe's API with a mock, and the browser tests use the development simulator. The simulator signs events the way Stripe does and sends them through the same verification and handling code, but it is not Stripe.

The check against Stripe's own test environment was attempted on 2026-11-20 and could not be run:

- No test-mode key was configured.
- The Stripe CLI was not installed.
- The development container's network policy refuses connections to `api.stripe.com`.

This page is the procedure for running the check on your own machine. It uses test mode only. No real card is charged, and the API refuses to start with a live key (`sk_live_...`).

## Configure credentials

Keep keys out of chat, commits, shell history, and command-line arguments.

1. In the Stripe dashboard, switch to **Test mode** and open Developers → API keys. Copy the secret key (`sk_test_...`).
2. Open your local `.env`, which git ignores, in an editor, and set `STRIPE_SECRET_KEY=` to that value. Do not use `export` or `echo`, which leave the key in shell history.
3. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run `stripe login`, which authorises it in the browser.
4. Start forwarding webhooks to the local API:

   ```bash
   stripe listen --forward-to localhost:4000/api/v1/payments/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
   ```

   It prints a signing secret (`whsec_...`) valid for this `stripe listen` session. Put it in `.env` as `STRIPE_WEBHOOK_SECRET`.

5. Run `pnpm dev`. The API must not log "No Stripe key configured", and `/dev/payment-simulator` must answer 404.

The queries below use the development database:

```bash
docker exec -it cartforge-postgres-1 psql -U cartforge -d cartforge
```

## Checklist

| #   | What                    | Steps                                                                                                                                                                                        | Expected                                                                                                                                                                                                    |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hosted checkout         | Add a product to the cart, check out, and press "Place order and pay"                                                                                                                        | The browser is on `checkout.stripe.com` showing the order total in INR. `select status, stripe_checkout_session_id from payments order by created_at desc limit 1;` shows `PENDING` with a `cs_test_...` id |
| 2   | Successful payment      | Pay with `4242 4242 4242 4242`, any future expiry, and any CVC                                                                                                                               | `stripe listen` shows `checkout.session.completed` answered `200`. The order page shows Paid within seconds. The payment is `SUCCEEDED` with a `pi_...` id                                                  |
| 3   | Signed webhook delivery | Send a forged event: `curl -i -X POST localhost:4000/api/v1/payments/webhook -H 'Content-Type: application/json' -H 'Stripe-Signature: t=1,v1=forged' -d '{}'`                               | `400` with `INVALID_SIGNATURE`, and nothing changes. Only deliveries from step 2, signed by Stripe with the `stripe listen` secret, are accepted                                                            |
| 4   | Inventory finalisation  | Before and after step 2: `select stock_quantity, reserved_quantity from products where slug = '<slug>';`                                                                                     | Checkout raises `reserved_quantity` by the quantity bought. Payment lowers both `stock_quantity` and `reserved_quantity` by the same amount                                                                 |
| 5   | Duplicate webhook       | `stripe events resend <id of the completed event from step 2>`                                                                                                                               | Answered `200`. Nothing changes: still one `processed_stripe_events` row for that id, stock unchanged, payment still `SUCCEEDED`                                                                            |
| 6   | Declined payment        | New order; pay with `4000 0000 0000 0002`                                                                                                                                                    | Stripe shows the decline on its page and no webhook changes the order. The order stays Awaiting payment and can be paid with `4242...`                                                                      |
| 7   | Cancelled checkout      | New order; on Stripe's page, use the back link                                                                                                                                               | The "Payment not completed" page offers a retry. Cancelling the order on its page sets it to Cancelled, returns the stock, and closes the Stripe session                                                    |
| 8   | Reconciliation          | `select p.status, p.amount_paise, o.total_paise, p.failure_reason from payments p join orders o on o.id = p.order_id order by p.created_at desc limit 5;`                                    | Every `SUCCEEDED` payment's amount equals its order total. Mismatched amounts, currencies, or orders are rejected by tests that mock Stripe; Stripe's test mode cannot produce them                         |
| 9   | Late payment and refund | Open Stripe's page for a new order. In psql run `update orders set reservation_expires_at = now() - interval '1 minute' where id = '<order id>';`, reload the order page (Expired), then pay | The payment becomes `REFUND_PENDING` and then `REFUNDED` with a `re_...` id, and the dashboard shows the refund. The order stays Expired and its stock is not sold                                          |
| 10  | Unknown event           | `stripe trigger checkout.session.completed`                                                                                                                                                  | Answered `200` and logged as matching no payment. Nothing changes                                                                                                                                           |

Record the date, the Stripe API version shown in the dashboard, and the result of each row. Only then can the README say the Stripe integration was verified in test mode.

## Afterwards

Remove `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from `.env` to return to the simulator. If a key was ever pasted anywhere other than `.env`, roll it in the dashboard (Developers → API keys → Roll key).
