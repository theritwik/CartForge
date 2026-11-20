# Interview Notes

The main engineering decisions in CartForge, why they were made, what they cost, and questions an interviewer might ask about them. Everything here describes code in this repository; where something was not done or not verified, it says so.

## Decisions

### A modular monolith, not microservices

One Express process holds the feature modules: auth, users, products, cart, inventory, orders, payments and admin. Each module has its own routes, controller, service and schemas.

- **Why:** checkout must reserve stock, create the order and empty the cart atomically. In one database that is a single transaction. Across services it would be a saga with compensating actions.
- **Cost:** modules share a deploy and a database.
- **Boundaries:** enforced by convention rather than by a network. Stock changes only through three inventory functions, and an order is marked paid only through the payments module.

### Opaque database sessions instead of JWTs

The cookie holds a random 32-byte token, and the database stores only its SHA-256.

- **Why:** revocation is immediate. Signing out, signing out everywhere, changing the password or demoting an admin takes effect on the next request. A copy of the database contains no usable tokens.
- **Cost:** one primary-key lookup per authenticated request, and sessions don't work offline.
- **Write load:** expiry is extended at most once an hour, so reads don't each cause a write.

### Integer paise everywhere

- **Why:** floating-point money produces rounding errors.
- **How:** all amounts are integers in the database, the API and the client. Formatting happens only at display time.
- **Line prices:** order items snapshot the unit price and name at purchase, and a trigger makes those rows immutable.

### Stock as two counters, changed only by conditional updates

`stock_quantity` and `reserved_quantity` live on the product, and available stock is their difference.

- **Reservation:** reserving runs `UPDATE ... SET reserved = reserved + n WHERE reserved + n <= stock`. Zero rows changed means not enough stock.
- **Lock order:** products are updated in id order, so two checkouts with overlapping items cannot deadlock.
- **Last guard:** a CHECK constraint `0 <= reserved <= stock` catches anything the application gets wrong.
- **Alternatives considered:**
  - A separate reservations table would give a per-order audit trail but needs aggregation to know availability.
  - `SELECT ... FOR UPDATE`, then a check, then an update, takes more round trips and is easier to get wrong.

### Status changes as compare-and-set

Every order status change is `updateMany` with the expected current status in `where`. Stock is released or committed only if that update changed a row.

- **Why:** expiry, customer cancellation, admin cancellation and a late payment webhook can all race for the same order. Exactly one wins, and stock moves exactly once.
- **Tested:** concurrent expiry runs, double cancellation, and payment racing expiry.

### Payments: the webhook is the only source of truth

- **Return page:** it never marks anything paid. It polls for the webhook's result.
- **Verifying the webhook:** it is registered before the JSON parser, so the signature can be checked over the raw bytes.
- **Applying an event:** the event id is recorded in the same transaction as its effects, so redelivery is a no-op and a failure leaves nothing behind.
- **Reconciliation:** amount, currency, order and session are checked before the order is marked paid. A payment that cannot be applied (late, duplicate or mismatched) becomes `REFUND_PENDING` and is refunded with an idempotency key.
- **Transaction rule:** no database transaction is held open across a Stripe call. The payment attempt is committed first, then Stripe is called with an idempotency key derived from the payment id, so a retry after a crash finds the same session.
- **Not verified against real Stripe test mode;** see [stripe-test-mode.md](stripe-test-mode.md).

### Idempotent checkout

The client sends an `Idempotency-Key`, unique per customer, and the total it showed the customer.

- **Concurrency:** the cart row lock makes a customer's checkouts run one at a time, so a retried request waits and then finds the order the first one created.
- **Price:** the client's total is compared with the server's, never used. A mismatch answers 409 with the new total.
- **Known gap:** a reused key with a different body returns the first order instead of an error.

### Cache-aside that never caches what must be correct

- **What's cached:** which products match a query, their order, the total count, and display fields.
- **What isn't:** price, status and stock are read by primary key on every request, cache hit or not. A stale entry can show an old name for at most one TTL, but never an old price, and never sells a withdrawn product.
- **Invalidation:** a generation number is part of every key, and any catalog write increments it. One `INCR` invalidates every instance's view, with no key scanning. The cost is that one edit discards the whole cache, which suits a catalog edited far less often than it is read.
- **Measured:** indexes were the larger win. The cache adds throughput, but a miss is 0.6 to 1.3 ms slower than no cache, and product detail barely improves. Both findings are in [performance.md](performance.md) rather than hidden.

### Two Redis instances

- **Why:** memory limits and eviction apply per instance, not per database index. A cache that fills up under many distinct searches would otherwise evict login rate-limit counters.
- **Setup:** the cache gets a memory limit and `volatile-ttl`. The rate-limit instance never evicts. The API refuses to start if both URLs are the same.

### Rate limits and the client address

- **What's limited:**
  - login, per email and per address;
  - registration and password change;
  - every state-changing request, per address;
  - admin writes, per administrator.
- **Failure mode:** fixed windows in Redis that fail open, so a Redis outage does not lock every user out.
- **A bug found in review:** the Next.js proxy forwards the browser's `X-Forwarded-For` unchanged. Trusting one proxy hop therefore let clients pick their own address and escape the limits. The fix was configuration plus a regression test: trust only proxies in front of the web app that set the header.
- **Reads aren't limited per address,** because server-rendered pages all reach the API from the web server.

### Background jobs on several instances

The jobs are order expiry, refund retries and the session sweep.

- **Correctness:** they are correct when runs overlap, through compare-and-set and idempotency keys.
- **Efficiency:** a small scheduler skips a tick while the previous run in the process is still going, and claims each tick in Redis so normally one instance works.
- **Why the overlap guard matters:** during a Stripe outage, a refund run can last longer than its interval.

### Testing against real infrastructure

- **No in-memory fakes:** integration tests run against PostgreSQL and Redis. A fake would not show lock behaviour, CHECK constraints or Prisma's real queries.
- **Isolation:** tests can only connect to a database whose name ends in `_test`.
- **Browser tests:** they run against production builds with their own database, Redis indexes and ports, and pay through the labelled simulator.

## Likely questions

**How do you stop two customers buying the last unit?**
The reservation is one conditional `UPDATE`, and PostgreSQL's row lock serialises the two. The second sees the first's increment and its condition fails, so its checkout rolls back with `ITEMS_UNAVAILABLE`. A CHECK constraint backs this up. A test runs eight concurrent checkouts for limited stock and asserts exactly the available number succeed.

**What happens if the payment webhook arrives after the order expired?**
The expiry already released the stock with a compare-and-set, so `confirmOrderPayment` finds the order no longer `PENDING_PAYMENT` and changes nothing. The payment is marked `REFUND_PENDING` and refunded after the transaction commits, and a background job retries if Stripe is down. The customer sees the order as expired with a refund note.

**Why not mark the order paid on Stripe's success redirect?**
The redirect comes from the browser and can be forged or never arrive. Only the signed webhook proves payment.

**What if Stripe sends the same event twice, or out of order?**
The event id is inserted with `skipDuplicates` in the same transaction as its effects, so a duplicate does nothing. Out-of-order events are handled by status checks: an "expired" event after a payment acts only on a `PENDING` attempt, so it changes nothing.

**How would you scale this?**

- **API:** it is stateless apart from PostgreSQL and Redis, so more instances behind a load balancer work today. Jobs coordinate and the cache invalidates globally.
- **Bottlenecks:** PostgreSQL writes at checkout, and hot rows for popular products.
- **Next steps:** read replicas for the catalog; keyset pagination instead of `OFFSET`; and, if one product's row became contended, splitting its stock into several counter rows.

**Why is the cache not the source of truth for stock?**
Stock changes on every checkout, payment, expiry and adjustment. Caching it would mean invalidating on all of those paths, and any missed path would sell stock that isn't there. Reading a few columns by primary key is cheap. One request at a time, a cached list page still answers 2.8 to 6.4 times faster than an uncached one; product detail only 1.2 times, which is why it gains little.

**What did the performance work show?**

- Trigram indexes took two-term search from 38 to 282 requests per second with no cache.
- The cache took list pages to about 2,000.
- A miss costs about a millisecond more than no cache, and product detail barely benefits.
- Measured on one machine, so the numbers compare configurations, not production capacity.

**How are database migrations deployed safely?**

- Forward-only SQL migrations, applied by a separate job before the new API rolls out.
- Each one must work with both the old and new code (expand, then contract), because both run during a rollout.
- CI applies them to an empty database and fails on drift.
- Rollback means redeploying the previous image, or writing a new migration; data lost to a destructive migration comes back only from a backup.

**What security issues did your review find?**

- The spoofable client address for rate limits.
- No framing protection on web pages.
- No general write limit.
- A body-size limit that rejected valid non-ASCII input.
- Overlapping background jobs.
- No HTTPS check in production.
- A dependency advisory.

Each has a regression test; see [security-review.md](security-review.md).

**What would you do next?**

1. Verify payments against Stripe test mode.
2. Build password reset with email.
3. Add a nonce-based script CSP.
4. Add refunds for paid orders from the admin area.
5. Add a delivery pipeline.
6. Shrink the images.

## Resume bullets

Each is limited to what is implemented and verified locally in this repository:

- Built a full-stack e-commerce platform (Next.js, TypeScript, Express, PostgreSQL/Prisma, Redis) with opaque database-backed sessions, Argon2id hashing, CSRF origin checks and Redis rate limiting. It is covered by 560 integration and unit tests against real PostgreSQL and Redis, and 21 Playwright end-to-end tests against production builds.
- Designed oversell-proof inventory and idempotent checkout using conditional SQL updates, row locks and compare-and-set order transitions. Integrated Stripe Checkout (test mode) through signature-verified, deduplicated webhooks with automatic refunds for late or mismatched payments, tested with mocked Stripe and a signed-event simulator.
- Raised catalog throughput up to 50x (38 to 1,895 requests/s for search) with trigram and sort indexes and a Redis cache-aside layer that keeps prices and stock exact. Also cut a dashboard query from 132 ms to 7.5 ms, all measured with a reproducible autocannon benchmark on 50,000 products.
