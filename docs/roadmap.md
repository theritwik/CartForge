# CartForge Roadmap

Milestones are built in order, one at a time. A milestone is complete only when its exit criteria pass. Status values: `planned`, `in progress`, `done`.

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Planning and architecture | done |
| 1 | Monorepo foundation | planned |
| 2 | Database and product catalog | planned |
| 3 | Authentication and users | planned |
| 4 | Admin product and inventory management | planned |
| 5 | Cart | planned |
| 6 | Checkout and orders | planned |
| 7 | Stripe payments | planned |
| 8 | Caching and hardening | planned |
| 9 | End-to-end tests, containers, and release documentation | planned |

## M0 - Planning and architecture

- `CLAUDE.md` with engineering standards and workflow.
- `docs/architecture.md` and `docs/roadmap.md`.

Exit criteria: documents reviewed and approved.

## M1 - Monorepo foundation

- pnpm workspace, root scripts, shared strict `tsconfig`, ESLint, Prettier, `.gitignore`, `.nvmrc`.
- `docker-compose.yml` with PostgreSQL and Redis.
- `apps/api`: Express app with validated environment config, structured logging, security headers, central error handler, 404 handler, and a health endpoint that checks database and Redis connectivity.
- `packages/db`: Prisma setup with an initial migration and exported client.
- `apps/web`: Next.js App Router with Tailwind, base layout, and the `/api` rewrite.
- GitHub Actions workflow: install, lint, typecheck, test, build.
- README with setup instructions.

Exit criteria: a fresh clone starts with documented commands; health endpoint returns OK; CI is green.

## M2 - Database and product catalog

- Schema: `Category`, `Product`, `InventoryItem`. Seed script with realistic data.
- API: list products (pagination, category filter, search, sort), product detail by slug, list categories.
- Web: catalog page with filters and pagination, product detail page, loading and empty states.
- Integration tests for catalog endpoints.

Exit criteria: seeded catalog is browsable in the web app; query parameter validation is tested.

## M3 - Authentication and users

- Schema: `User`, `Session`.
- API: register, login, logout, log out of all devices, change password, current user. Opaque database-backed sessions in an httpOnly cookie with idle and absolute expiry. Authentication, role, and CSRF origin-check middleware. Redis-backed rate limiting on auth endpoints.
- Web: register and login pages, session-aware header, protected account page.
- Tests: credential handling, session expiry (idle and absolute), revocation on logout and password change, cookie attributes, rejection of cross-origin state-changing requests, access to protected routes.

Exit criteria: a user can register, log in, stay logged in while the session is active, and log out; a revoked or expired session is rejected on the next request; protected endpoints reject anonymous and wrong-role requests.

## M4 - Admin product and inventory management

- API: admin product create, update, deactivate; category management; stock adjustment.
- Web: admin area for products and stock, restricted to `ADMIN`.
- Tests: authorization on every admin endpoint, validation, stock adjustment rules.

Exit criteria: an admin can manage the catalog and stock through the UI; a customer cannot reach admin endpoints or pages.

## M5 - Cart

- Schema: `CartItem`.
- API: get cart with computed totals, add item, update quantity, remove item, clear cart. Quantities are checked against available stock.
- Web: add-to-cart on product pages, cart page, cart count in the header.
- Tests: totals, quantity limits, inactive products, per-user isolation.

Exit criteria: cart persists across sessions and devices for a user; totals are always computed on the server.

## M6 - Checkout and orders

- Schema: `Order`, `OrderItem`.
- API: checkout that reserves stock and creates a `PENDING_PAYMENT` order in one transaction; order history and detail for the owner; reservation expiry and release; admin order list and status transitions.
- Web: checkout page with shipping address, order history, order detail, admin order management.
- Tests: concurrent checkout for the last unit, price snapshot, ownership checks, status transition rules, reservation release.

Exit criteria: concurrent checkouts never oversell; expired reservations return stock; orders are visible only to their owner and admins.

## M7 - Stripe payments

- Schema: `Payment`, `ProcessedStripeEvent`.
- API: PaymentIntent creation for an order; webhook endpoint with signature verification and idempotent handling of success and failure events.
- Web: payment step with Stripe Elements, confirmation and failure pages.
- Tests: signed webhook fixtures, duplicate delivery, invalid signature, amount mismatch, failure path releasing stock.

Exit criteria: a test-card payment moves the order to `PAID` through the webhook only, decrements stock, and clears the cart; replayed events have no effect.

## M8 - Caching and hardening

- Redis read-through cache for catalog endpoints with invalidation on writes.
- General API rate limiting, request size limits, review of headers and cookie settings.
- Database index review based on the queries actually written.
- Review of error responses and logs for leaked detail.

Exit criteria: cache invalidation is covered by tests; the API works correctly with Redis cache empty; security review checklist is recorded in `docs/`.

## M9 - End-to-end tests, containers, and release documentation

- Playwright suite for the main journeys: register, browse, cart, checkout with a test card, order history, admin product edit.
- Production Dockerfiles for `web` and `api`; compose profile to run the full stack.
- CI runs the end-to-end suite.
- Final README: features, architecture summary, setup, test commands, screenshots.

Exit criteria: full stack starts from containers; all test levels pass in CI; documentation matches what is implemented.

## Out of scope

Listed in `architecture.md` section 1. Items move into the roadmap only by explicit decision.
