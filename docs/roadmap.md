# CartForge Roadmap

Milestones are built in order, one at a time. A milestone is complete only when its exit criteria pass. Status values: `planned`, `in progress`, `done`.

| #   | Milestone                                               | Status  |
| --- | ------------------------------------------------------- | ------- |
| 0   | Planning and architecture                               | done    |
| 1   | Monorepo foundation                                     | done    |
| 2   | Database foundation                                     | done    |
| 3   | Product catalog                                         | done    |
| 4   | Authentication and users                                | done    |
| 5   | Admin product and inventory management                  | planned |
| 6   | Cart                                                    | planned |
| 7   | Checkout and orders                                     | planned |
| 8   | Stripe payments                                         | planned |
| 9   | Caching and hardening                                   | planned |
| 10  | End-to-end tests, containers, and release documentation | planned |

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

Not done in this milestone: changing a password (and revoking the account's other sessions when it changes). It is listed under M5.

## M5 - Admin product and inventory management

- API: change password, revoking the account's other sessions.
- API: admin product create, update, archive; category management; stock adjustment.
- Web: admin area for products and stock, restricted to `ADMIN`.
- Tests: authorization on every admin endpoint, validation, stock adjustment rules.

Exit criteria: an admin can manage the catalog and stock through the UI; a customer cannot reach admin endpoints or pages.

## M6 - Cart

- API: get cart with computed totals, add item, update quantity, remove item, clear cart. Quantities are checked against available stock.
- Web: add-to-cart on product pages, cart page, cart count in the header.
- Tests: totals, quantity limits, inactive products, per-user isolation.

Exit criteria: cart persists across sessions and devices for a user; totals are always computed on the server.

## M7 - Checkout and orders

- API: checkout that reserves stock and creates a `PENDING_PAYMENT` order in one transaction; order history and detail for the owner; reservation expiry and release; admin order list and status transitions.
- Web: checkout page with shipping address, order history, order detail, admin order management.
- Tests: concurrent checkout for the last unit, price snapshot, ownership checks, status transition rules, reservation release.

Exit criteria: concurrent checkouts never oversell; expired reservations return stock; orders are visible only to their owner and admins.

## M8 - Stripe payments

- Schema: table of processed Stripe event IDs for webhook idempotency.
- API: PaymentIntent creation for an order; webhook endpoint with signature verification and idempotent handling of success and failure events.
- Web: payment step with Stripe Elements, confirmation and failure pages.
- Tests: signed webhook fixtures, duplicate delivery, invalid signature, amount mismatch, failure path releasing stock.

Exit criteria: a test-card payment moves the order to `PAID` through the webhook only, decrements stock, and clears the cart; replayed events have no effect.

## M9 - Caching and hardening

- Redis read-through cache for catalog endpoints with invalidation on writes.
- General API rate limiting, request size limits, review of headers and cookie settings.
- Database index review based on the queries actually written.
- Review of error responses and logs for leaked detail.

Exit criteria: cache invalidation is covered by tests; the API works correctly with Redis cache empty; security review checklist is recorded in `docs/`.

## M10 - End-to-end tests, containers, and release documentation

- Playwright suite for the main journeys: register, browse, cart, checkout with a test card, order history, admin product edit.
- Production Dockerfiles for `web` and `api`; compose profile to run the full stack.
- CI runs the end-to-end suite.
- Final README: features, architecture summary, setup, test commands, screenshots.

Exit criteria: full stack starts from containers; all test levels pass in CI; documentation matches what is implemented.

## Out of scope

Listed in `architecture.md` section 1. Items move into the roadmap only by explicit decision.
