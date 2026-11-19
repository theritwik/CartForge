# CartForge Roadmap

Milestones are built in order, one at a time. A milestone is complete only when its exit criteria pass. Status values: `planned`, `in progress`, `done`.

| #   | Milestone                                                              | Status  |
| --- | ---------------------------------------------------------------------- | ------- |
| 0   | Planning and architecture                                              | done    |
| 1   | Monorepo foundation                                                    | done    |
| 2   | Database foundation                                                    | done    |
| 3   | Product catalog                                                        | done    |
| 4   | Authentication and users                                               | done    |
| 5   | Cart and password change                                               | done    |
| 6   | Order management and inventory                                         | done    |
| 7   | Payments                                                               | done    |
| 8   | Admin dashboard                                                        | done    |
| 9   | Caching and database performance                                       | done    |
| 10  | API hardening, end-to-end tests, containers, and release documentation | planned |

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

Not done: an end-to-end run against Stripe's own test environment, which needs a test-mode key and the Stripe CLI to forward webhooks. See README.

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

Planned for M10:

- Playwright suite for the main journeys: register, browse, cart, checkout with a test card, order history, admin product edit.
- Production Dockerfiles for `web` and `api`; compose profile to run the full stack.
- CI runs the end-to-end suite.
- Final README: features, architecture summary, setup, test commands, screenshots.

Exit criteria: security review checklist is recorded in `docs/`; full stack starts from containers; all test levels pass in CI; documentation matches what is implemented.

## Backlog

Improvements identified after M8 and M9. None is implemented. An item becomes work only when it is scheduled into a milestone; those marked with a milestone already fit its stated scope.

| Item                        | What it involves                                                                                                                                                                                       | Fits                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Stock adjustment history    | A table recording each adjustment: product, change, resulting stock, administrator, reason, and time. Written in the same transaction as the adjustment, and shown on the product and inventory pages. | Unscheduled                     |
| Product image management    | Uploading, ordering, replacing, and removing product images from the admin area, with storage outside the database and validation of file type and size. Products created today have no image.         | Unscheduled                     |
| Administrative activity log | A record of every state-changing admin action (product, category, stock, and order changes) with the administrator and time, viewable by administrators. Overlaps with the stock adjustment history.   | Unscheduled                     |
| Admin API rate limiting     | Per-administrator limits on `/api/v1/admin` writes, using the existing Redis rate limiter.                                                                                                             | M10 (general API rate limiting) |
| Catalog search improvements | Full-text or prefix search for terms shorter than three characters, and keyset pagination for deep pages. See `performance.md`.                                                                        | Unscheduled                     |
| Automated browser tests     | A committed Playwright suite in CI covering the storefront, checkout, payment simulator, and admin journeys. The browser checks so far were scripted by hand and are not in the repository.            | M10 (end-to-end tests)          |

## Out of scope

Listed in `architecture.md` section 1. Items move into the roadmap only by explicit decision.
