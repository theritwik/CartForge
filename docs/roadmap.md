# CartForge Roadmap

Milestones are built in order, one at a time. A milestone is complete only when its exit criteria pass. Status values: `planned`, `in progress`, `done`.

All ten development milestones are done. The [release verification](#release-verification) steps below are still pending.

| #   | Milestone                                                              | Status |
| --- | ---------------------------------------------------------------------- | ------ |
| 0   | Planning and architecture                                              | done   |
| 1   | Monorepo foundation                                                    | done   |
| 2   | Database foundation                                                    | done   |
| 3   | Product catalog                                                        | done   |
| 4   | Authentication and users                                               | done   |
| 5   | Cart and password change                                               | done   |
| 6   | Order management and inventory                                         | done   |
| 7   | Payments                                                               | done   |
| 8   | Admin dashboard                                                        | done   |
| 9   | Caching and database performance                                       | done   |
| 10  | API hardening, end-to-end tests, containers, and release documentation | done   |

## M0 - Planning and architecture

- `CLAUDE.md` with engineering standards and workflow.
- `docs/architecture.md` and `docs/roadmap.md`.

Exit criteria: documents reviewed and approved.

## M1 - Monorepo foundation

- pnpm workspace, root scripts, shared strict `tsconfig`, ESLint, Prettier, `.gitignore`, `.nvmrc`.
- `docker-compose.yml` with PostgreSQL and Redis.
- `apps/api`: Express app with validated environment config, structured logging, security headers, central error handler, 404 handler, and a health endpoint that checks database and Redis connectivity.
- `packages/db`: Prisma setup and exported client.
- `apps/web`: Next.js App Router with Tailwind, base layout, and the `/api` rewrite.
- GitHub Actions workflow: install, lint, typecheck, test, build.
- README with setup instructions.

Exit criteria: a fresh clone starts with documented commands; health endpoint returns OK; CI is green.

## M2 - Database foundation

- Prisma schema for all core tables: `User`, `Session`, `Category`, `Product`, `ProductImage`, `Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, with enums for roles and for product, order, and payment status.
- Initial migration, including CHECK constraints and the order-item immutability trigger.
- Separate test database with guards that keep tests away from development data.
- Idempotent development seed for categories and products.
- Database integration tests for constraints, relationships, and the seed.
- `docs/database.md`.

Exit criteria: migrations apply to an empty database; the seed can be run repeatedly; constraint tests pass against the test database only.

## M3 - Product catalog

- API: list products (pagination, category filter, price range, search, sort), product detail by slug, list categories. Only `ACTIVE` products are exposed.
- Web: storefront homepage, product listing with search, category and price filters, sorting and pagination, category pages, product detail page with image gallery, and loading, empty, error, and not-found states.
- Local, labelled placeholder product images served by the web app, replacing the external placeholder URLs.
- Integration tests for catalog endpoints.

Exit criteria: seeded catalog is browsable in the web app; query parameter validation is tested.

## M4 - Authentication and users

- API: register, login, logout, log out of all devices, current user, and an administrator-only user list. Opaque database-backed sessions in an httpOnly cookie with idle and absolute expiry. Authentication and role middleware, CSRF origin check, and Redis-backed rate limiting on login and registration.
- `pnpm admin:create` creates or promotes an administrator from environment variables. Registration always creates a customer.
- Web: sign-in and registration pages with validation feedback, account page, and header account navigation with sign-out.
- Tests: credential handling, session expiry (idle and absolute), revocation on logout, cookie attributes, rejection of cross-origin state-changing requests, access to protected routes, and customer versus administrator permissions.

Exit criteria: a user can register, log in, stay logged in while the session is active, and log out; a revoked or expired session is rejected on the next request; protected endpoints reject anonymous and wrong-role requests.

Changing a password was added in M5.

## M5 - Cart and password change

- API: get cart with server-computed totals, add item, update quantity, remove item, clear cart. Only published products can be added; quantities are checked against available stock and a limit of 10 per product. Adding to the cart does not reserve stock.
- Items that become unavailable or run short stay in the cart, flagged, and are excluded from the subtotal.
- Every cart write locks the cart row, so concurrent changes are applied one after another.
- Web: add-to-cart on product pages and cards, cart page with quantity controls, removal, and clear with confirmation, and a cart count in the header. Signed-out visitors are sent to sign in and returned to the page they were on.
- API and web: change password, which requires the current password and ends the account's other sessions.
- Tests: totals, quantity and stock limits, stale items, ownership, concurrency, persistence across logins, and password change.

Exit criteria: cart persists across sessions and devices for a user; totals are always computed on the server; concurrent changes never produce duplicate rows or exceed limits.

## M6 - Order management and inventory

- API: idempotent checkout that rechecks price, status, and stock, reserves stock, creates a `PENDING_PAYMENT` order from the cart, and empties the cart, in one transaction; order history and detail for the owner; cancellation while awaiting payment.
- Inventory: reserve, release, and sale operations that always run inside the caller's transaction and update products in a fixed order. Conditional updates mean concurrent checkouts cannot oversell.
- Reservations expire after 30 minutes, through a per-minute sweep and on view, releasing stock exactly once.
- `confirmOrderPayment` is implemented for the payment webhook, which M7 wires up.
- Schema: `PROCESSING` and `EXPIRED` order statuses and a per-customer idempotency key.
- Web: checkout page with shipping address and order summary, order history, and order detail with status tracker and cancellation.
- Tests: concurrent checkout for the last unit, multi-product rollback, duplicate requests, price changes, expiry and recovery, cancellation, ownership.

Exit criteria: concurrent checkouts never oversell; expired reservations return stock; orders are visible only to their owner.

## M7 - Payments

- Stripe Checkout in test mode: payment attempts for an order, with the Stripe call made outside any database transaction and keyed for idempotency. Live keys are rejected.
- Webhook endpoint verified against the raw body, with each event recorded in the same transaction as its effects so redelivery has no effect.
- Payments reconciled on amount, currency, order, and session before an order is marked paid. A payment that arrives too late, or for an order already cancelled or paid, is refunded instead of fulfilled, with retries if Stripe is unreachable.
- Failed or abandoned attempts can be retried; cancelling an order closes its open Checkout session.
- Schema: several payment attempts per order with at most one pending, new payment statuses, and `processed_stripe_events`.
- Web: "Place order and pay", payment return pages that wait for the webhook, retry and status on the order page.
- A clearly labelled local simulator stands in for Stripe's hosted page when no key is configured.
- Tests: signature verification, duplicate and out-of-order events, reconciliation, late payments and refunds, payment racing expiry, database failure during an event, retries, provider outages.

Exit criteria: a test payment moves the order to `PAID` through the webhook only and converts the reservation into a sale; replayed events have no effect; money that cannot be applied is refunded.

Not done: an end-to-end run against Stripe's own test environment, which needs a test-mode key and the Stripe CLI to forward webhooks. See [stripe-test-mode.md](stripe-test-mode.md).

## M8 - Admin dashboard

- API under `/api/v1/admin`, administrators only: dashboard figures; product list with search and filters, create, edit, archive, and reactivate; categories with create, rename, and delete-when-empty; stock adjustments that cannot go below reserved units; order list with status, reference, and email filters, order detail with payments, and status changes limited to an explicit policy.
- Administrators can never mark an order paid, and can cancel only unpaid orders.
- Web: admin area with sidebar navigation, dashboard cards, a 14-day sales chart, orders by status, recent orders, low stock, and pages for products, inventory, categories, and orders.
- Tests: access for customers and administrators, validation, uniqueness, archiving, stock rules under concurrency, order filtering, allowed and refused transitions, payment detail access, and dashboard calculations.

Exit criteria: an admin can manage the catalog, stock, and orders through the UI; a customer cannot reach admin endpoints or pages.

Not done: refunding or cancelling orders that have been paid. Further admin improvements are listed in the [backlog](#backlog).

## M9 - Caching and database performance

- Cache-aside Redis cache for the product list, product detail, and categories, with generation-versioned keys, TTLs, Zod-validated entries, and invalidation on every catalog write. Price, status, and stock are always read from PostgreSQL.
- Fallback to PostgreSQL when the cache is unreachable or an entry is unreadable, with rate-limited logging. The cache runs on its own Redis instance with bounded memory and eviction, so rate-limit counters are never evicted.
- Index review with `EXPLAIN ANALYZE`: trigram indexes for search, a price index for catalog-wide sorting, and an orders `(created_at, id)` index with a date-bounded sales trend query for the dashboard.
- Reproducible benchmarks on an isolated 50,000-product dataset, with baseline, indexes-only, cache-hit, cache-miss, and cache-down results in `docs/performance.md`.
- Tests: hits and misses, TTL expiry, key normalisation, invalidation on product and category changes, live prices and stock when invalidation fails, malformed entries, Redis outages, concurrent requests, and checkout pricing from the database.

Exit criteria: cache invalidation is covered by tests; the API works correctly with the cache empty or Redis unreachable; measurements are recorded and reproducible.

Not done: the security hardening originally planned for this milestone (general API rate limiting, request size limits, header and cookie review, error and log review, security checklist). It was outside the requested scope and moved to M10 unchanged.

## M10 - API hardening, end-to-end tests, containers, and release documentation

Moved from M9:

- General API rate limiting, request size limits, review of headers and cookie settings.
- Review of error responses and logs for leaked detail.

Delivered:

- Security and reliability review recorded in `docs/security-review.md`, with seven findings fixed and regression-tested:
  - client-address spoofing in rate limits;
  - missing web security headers;
  - no general write rate limit (now per address, and per administrator for admin writes);
  - admin body-size mismatch;
  - overlapping background job runs;
  - HTTPS required in production;
  - one dependency advisory.
- Background jobs coordinated across API instances; liveness endpoint `/health/live` beside readiness `/health`.
- Stock adjustment history: who changed stock, by how much, why, and the stock afterwards, written in the same transaction and shown on the product page.
- Playwright suite (`e2e/`, 21 tests) covering registration and sign-in, search and filters, product detail, cart quantities and persistence across devices, address validation, order creation, simulated payment success, failure and retry, cancellation, order history and status updates, admin access, product creation and editing, stock adjustments, order fulfilment, sign-out, and session expiry. It runs against production builds with its own database and Redis indexes.
- CI runs the suite in a second job and checks migrations against the schema.
- Production Dockerfiles for the API (with a migration target) and the web app, and a Compose `full` profile that runs the whole stack from them.
- `docs/deployment.md` (hosting options, environment, migrations, backups, checklist), `docs/stripe-test-mode.md`, `docs/interview-notes.md`, and a rewritten README.

Exit criteria: security review checklist is recorded in `docs/`; full stack starts from containers; all test levels pass in CI; documentation matches what is implemented.

Status: done. All four exit criteria are met:

- The security review checklist is in `docs/security-review.md`.
- The full stack starts from containers.
- All test levels pass in CI: the `verify` and `e2e` jobs passed on commit `a721391`, which was merged into `main` in [theritwik/CartForge#11](https://github.com/theritwik/CartForge/pull/11).
- The documentation matches what is implemented.

Locally, 560 unit and integration tests and 21 Playwright tests pass.

Not done (outside the exit criteria; see [release verification](#release-verification)):

- Verification against real Stripe test mode: no key, CLI, or network access to Stripe was available. See `docs/stripe-test-mode.md`.
- Deployment to a hosting provider: hosting options are presented in `docs/deployment.md` for a decision first.
- A delivery pipeline that builds, pushes, and deploys images.

## Release verification

These steps verify the finished application in its intended environment. They are not development milestones, and neither has been done.

| Step                  | Status  | What it needs                                                                                                                                                                                                    |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real Stripe test mode | pending | A test-mode key and the Stripe CLI on a machine that can reach Stripe; the ten-step checklist in [stripe-test-mode.md](stripe-test-mode.md). Until then, payments are verified only with mocks and the simulator |
| Production deployment | pending | A hosting choice from [deployment.md](deployment.md), provisioned PostgreSQL and two Redis instances, secrets, a Stripe test-mode webhook endpoint, and the deployment checklist                                 |

## Backlog

Improvements identified after M8, M9 and M10. None is implemented. An item becomes work only when it is scheduled into a milestone; those marked with a milestone already fit its stated scope.

| Item                                  | What it involves                                                                                                                                                                                     | Fits        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Product image management              | Uploading, ordering, replacing, and removing product images from the admin area, with storage outside the database and validation of file type and size. Products created today have no image.       | Unscheduled |
| Administrative activity log           | A record of every state-changing admin action (product, category, stock, and order changes) with the administrator and time, viewable by administrators. Overlaps with the stock adjustment history. | Unscheduled |
| Catalog search improvements           | Full-text or prefix search for terms shorter than three characters, and keyset pagination for deep pages. See `performance.md`.                                                                      | Unscheduled |
| Script Content Security Policy        | A nonce-based `script-src` policy for every page, generated per request in the web app's proxy.                                                                                                      | Unscheduled |
| Password reset and email verification | Email delivery, single-use reset tokens stored as hashes, and verified addresses.                                                                                                                    | Unscheduled |
| Cache stampede protection             | Coalescing concurrent misses for one catalog key, after the generation changes. Measured cost of not doing it is low (see `performance.md`).                                                         | Unscheduled |
| Smaller images                        | Next.js standalone output for the web image and leaving the Prisma CLI out of the API runtime image (746 MB and 935 MB uncompressed today).                                                          | Unscheduled |
| Delivery pipeline                     | Build and push images on `main`, run the migration job, roll out, smoke-check, roll back on failure.                                                                                                 | Unscheduled |

## Out of scope

Listed in `architecture.md` section 1. Items move into the roadmap only by explicit decision.
