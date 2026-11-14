# CartForge Architecture

Status: proposed. Nothing described here is implemented yet. Each section is realised by a milestone in `roadmap.md`, and this document is updated when a decision changes.

## 1. Goals and non-goals

Goals:

- A working storefront: browse products, manage a cart, check out, pay, view orders.
- An admin area for managing products, stock, and orders.
- Correct handling of the hard parts of e-commerce: overselling, payment confirmation, price changes, and duplicate webhook delivery.
- A codebase that a reviewer can navigate quickly and run locally with a few commands.

Non-goals (not planned unless a later milestone adds them):

- Microservices, message brokers, or event sourcing.
- Product variants (size, colour), tax calculation, shipping carrier integration.
- Multi-currency. All prices and payments are in INR.
- Guest checkout. A cart and an order always belong to an authenticated user.
- Live Stripe payments. Test mode only.

## 2. System overview

```
Browser
   |
   v
Next.js web app (apps/web)  --- /api/* rewrite --->  Express API (apps/api)
                                                        |          |         |
                                                        v          v         v
                                                   PostgreSQL    Redis     Stripe
                                                   (Prisma)                  |
                                                        ^                    |
                                                        +---- webhook -------+
```

- The system is a modular monolith: one API process, one database, one web app.
- The web app proxies `/api/*` to the API through a Next.js rewrite. The browser sees a single origin, so the session cookie is first-party and no cross-site cookie configuration is needed. CORS on the API stays restricted to the web origin.
- Stripe calls the API webhook endpoint directly.

## 3. Repository structure

```
cartforge/
├── apps/
│   ├── web/                      Next.js App Router application
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (shop)/       catalog, product detail, cart, checkout
│   │   │   │   ├── (auth)/       login, register
│   │   │   │   ├── account/      profile, order history
│   │   │   │   ├── admin/        product, stock, and order management
│   │   │   │   ├── layout.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/       shared UI components
│   │   │   └── lib/              API client, formatting
│   │   ├── e2e/                  Playwright tests
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── products/
│       │   │   ├── cart/
│       │   │   ├── inventory/
│       │   │   ├── orders/
│       │   │   └── payments/
│       │   ├── middleware/       authentication, validation, rate limit, error handler
│       │   ├── config/           validated environment configuration
│       │   ├── lib/              redis client, stripe client, logger, error classes
│       │   ├── app.ts            Express app assembly (importable by tests)
│       │   └── server.ts         process entry point
│       ├── tests/                integration test setup
│       └── package.json
├── packages/
│   ├── db/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/index.ts          exports the Prisma client and generated types
│   └── shared/                   only if web and api need shared schemas or types
├── docs/
│   ├── architecture.md
│   └── roadmap.md
├── .github/
│   └── workflows/ci.yml
├── CLAUDE.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── docker-compose.yml
```

Directories are created in the milestone that first needs them. This tree is the target, not a scaffold to generate up front.

## 4. Backend

### 4.1 Layering

```
route  ->  middleware (auth, validation)  ->  controller  ->  service  ->  Prisma
```

- **Routes** bind paths to middleware and controllers.
- **Controllers** read the validated request, call one service function, and shape the HTTP response. They contain no business rules.
- **Services** hold business logic and call Prisma directly.
- There is no repository layer. Prisma already is the data access abstraction; wrapping it would add indirection without a second implementation to justify it.
- Modules may call another module's service (orders calls inventory). They do not reach into another module's controllers or routes.

A typical module:

```
modules/products/
├── products.routes.ts
├── products.controller.ts
├── products.service.ts
├── products.schemas.ts
└── products.service.test.ts
```

A module omits any file it does not need.

### 4.2 Module responsibilities

| Module | Responsibility |
| --- | --- |
| auth | Registration, login, logout, session creation, validation, expiry, and revocation |
| users | Current user profile, admin user listing |
| products | Catalog queries (list, filter, search, detail), categories, admin product CRUD |
| inventory | Stock levels, reservations, release, admin stock adjustments |
| cart | Per-user cart contents and totals |
| orders | Checkout, order lifecycle, order history, admin order management |
| payments | Stripe PaymentIntent creation, webhook verification and handling |

### 4.3 API conventions

- REST, JSON, versioned under `/api/v1`.
- Zod schemas validate `body`, `params`, and `query` in middleware; controllers receive typed data.
- List endpoints are paginated and return `{ data, meta }`.
- Errors use one envelope, produced by a single error-handling middleware:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": [] } }
```

- Services throw typed application errors (not found, conflict, forbidden, validation). Unknown errors are logged and returned as a generic 500 with no internal detail.
- Environment variables are parsed with Zod at startup. The process refuses to start on invalid configuration.

### 4.4 Authentication and authorization

Authentication uses opaque, server-side sessions stored in PostgreSQL. There are no JWTs and no refresh tokens: the cookie carries a random identifier with no embedded claims, and the database row is the only source of truth for who is logged in.

**Passwords**

- Hashed with Argon2id, using parameters at or above current OWASP guidance. Parameters live in configuration so they can be raised later; a hash made with older parameters is rehashed on the next successful login.
- Login failures return one generic message regardless of whether the email exists. Login and registration are rate limited per IP and per email.

**Sessions**

- On successful login or registration the API generates a 256-bit token from a CSPRNG and sends it to the browser in the session cookie.
- Only the SHA-256 hash of the token is stored. A leaked database dump does not yield usable session tokens.
- A new session is always created at login. No session exists before authentication, so there is nothing for an attacker to fixate.
- The authentication middleware hashes the incoming token, loads the session and its user with one indexed query, and rejects the request if the session is missing or expired.

**Expiry**

- Idle timeout: a session expires after 7 days without use. Activity extends it (sliding expiry).
- Absolute timeout: a session expires 30 days after creation regardless of activity, forcing a fresh login.
- `lastUsedAt` is written at most once per hour per session, so authenticated reads do not each cause a database write.
- The cookie `Max-Age` matches the idle timeout and is refreshed when the session is extended. The server-side check is authoritative; the cookie lifetime is only a convenience.
- Expired rows are removed by a periodic sweep in the API process.
- Both timeouts are configuration values.

**Revocation**

- Logout deletes the session row and clears the cookie. The token is useless immediately.
- "Log out of all devices" deletes every session for the user.
- A password change deletes all of the user's other sessions.
- Because every request checks the database, revocation takes effect on the next request with no token-lifetime window.

**Cookie configuration**

| Attribute | Value | Reason |
| --- | --- | --- |
| Name | `__Host-cartforge_session` in production | The `__Host-` prefix makes the browser require `Secure`, `Path=/`, and no `Domain`, which prevents subdomains from overwriting the cookie |
| `HttpOnly` | set | JavaScript cannot read the token |
| `Secure` | set in production | Sent over HTTPS only |
| `SameSite` | `Lax` | Not sent on cross-site subrequests or cross-site form posts |
| `Path` | `/` | |
| `Domain` | not set | Host-only cookie |
| `Max-Age` | idle timeout | |

For local development over plain HTTP, `Secure` and the `__Host-` prefix are disabled through configuration. Production configuration validation rejects a non-secure cookie.

**CSRF protection**

Cookie-based sessions are sent automatically by the browser, so state-changing requests are protected in layers:

1. `SameSite=Lax` stops the cookie from being attached to cross-site `POST`, `PUT`, `PATCH`, and `DELETE` requests.
2. Safe methods (`GET`, `HEAD`, `OPTIONS`) never change state.
3. Middleware on every non-safe request verifies that the `Origin` header (falling back to `Referer`) matches the configured web origin, and rejects the request otherwise. This also covers login and registration, preventing login CSRF.
4. Mutating endpoints accept only `application/json`. A cross-site HTML form cannot send that content type without a CORS preflight, and CORS allows only the web origin.

The Stripe webhook is exempt from the origin check: it carries no session cookie and is authenticated by its signature instead.

**Authorization**

- Roles: `CUSTOMER` and `ADMIN`. Role checks happen in middleware; ownership checks (a user may only read their own orders) happen in services.
- The role is read from the user row loaded with the session, so a role change applies on the next request.

### 4.5 Redis usage

Redis is used only where it removes real load or enforces a limit:

- Rate limiting counters (auth endpoints first, then general API).
- Read-through cache for catalog list and detail responses, invalidated on product or stock writes.

Redis is not a source of truth. The API must behave correctly, only slower, when the cache is empty.

## 5. Data model

Proposed entities. Final field lists are settled in the milestone that introduces each table.

| Entity | Key fields | Notes |
| --- | --- | --- |
| User | email (unique), passwordHash, name, role | |
| Session | userId, tokenHash (unique), createdAt, lastUsedAt, expiresAt | Stores only the hash of the session token; deleted on logout or revocation |
| Category | name, slug (unique) | |
| Product | name, slug (unique), description, pricePaise, imageUrl, isActive, categoryId | Soft-deactivated, never hard-deleted once ordered |
| InventoryItem | productId (unique), quantityOnHand, quantityReserved | Available = onHand - reserved |
| CartItem | userId, productId, quantity | Unique on (userId, productId) |
| Order | userId, status, totalPaise, shipping address fields, reservationExpiresAt | |
| OrderItem | orderId, productId, productName, unitPricePaise, quantity | Snapshot of name and price at purchase |
| Payment | orderId (unique), stripePaymentIntentId (unique), status, amountPaise | |
| ProcessedStripeEvent | stripeEventId (unique), type, processedAt | Webhook idempotency |

Rules:

- The currency is INR. All money is stored and computed as integer paise (minor currency units, 100 paise = 1 rupee). Totals are computed on the server from database prices, never from client input.
- Amounts are converted to rupees only for display. Stripe receives the amount in paise with currency `inr`, which is the unit its API expects.
- Primary keys are opaque IDs generated by the database layer; public URLs use slugs for products.

## 6. Critical flows

### 6.1 Checkout and stock reservation

1. The client submits the cart for checkout with a shipping address.
2. In one transaction the orders service:
   - reloads cart items and current prices,
   - reserves stock with a conditional update per product (`quantityReserved` increases only where `quantityOnHand - quantityReserved >= requested`),
   - aborts with `INSUFFICIENT_STOCK` if any update affects zero rows,
   - creates the `Order` (`PENDING_PAYMENT`) and its `OrderItem` snapshots.
3. The payments service creates a Stripe PaymentIntent for the order total and returns its client secret.

The conditional update makes the database the arbiter of concurrent purchases, so two buyers cannot both reserve the last unit.

### 6.2 Payment confirmation

1. The browser confirms the payment with Stripe Elements.
2. Stripe sends `payment_intent.succeeded` (or `payment_intent.payment_failed`) to the webhook endpoint.
3. The API verifies the signature against the raw request body, then records the event ID in `ProcessedStripeEvent`. A duplicate ID is acknowledged and ignored.
4. On success, in one transaction: order becomes `PAID`, reserved stock is converted to a decrement of `quantityOnHand`, and the user's cart is cleared.
5. On failure or reservation expiry: order becomes `CANCELLED` and the reservation is released.

The success page shown to the user is informational. Only the webhook changes order state.

### 6.3 Order status

```
PENDING_PAYMENT --> PAID --> SHIPPED --> DELIVERED
       |              |
       v              v
   CANCELLED       REFUNDED
```

Transitions are enforced in the orders service. Invalid transitions are rejected.

## 7. Frontend

- Server Components by default; catalog and product pages fetch on the server. Client Components are used for interactive parts (cart controls, forms, Stripe Elements).
- Route groups separate the storefront, auth pages, account pages, and admin area, each with its own layout where needed.
- A single typed API client in `lib/` handles requests and the error envelope.
- Protected routes are checked on the server; the API remains the authority on authorization.
- No global state library is planned. Server state comes from the API; local state stays in components. This is revisited only if a concrete need appears.

## 8. Testing

| Level | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | Pure logic: totals, status transitions, schema validation |
| Integration | Vitest + Supertest | HTTP endpoints against a real PostgreSQL test database, including auth, authorization, and concurrency on stock |
| End-to-end | Playwright | Critical journeys: register, browse, add to cart, check out with a Stripe test card, see the order |

Integration tests do not mock Prisma. Stripe is exercised with test-mode keys or signed fixture webhooks.

## 9. Local development and CI

- `docker-compose.yml` runs PostgreSQL and Redis for local development. The apps run on the host with hot reload.
- Each app has a `.env.example`; real `.env` files are git-ignored.
- GitHub Actions runs on every push and pull request: install, lint, typecheck, unit and integration tests (with PostgreSQL and Redis service containers), and build. Playwright runs in CI once the end-to-end milestone lands.
- Production Dockerfiles for `web` and `api` are added in the final milestone.

## 10. Versions

Node.js uses the active LTS release, pinned through `engines` and `.nvmrc`. Framework and library versions are the current stable releases at the time each is installed, verified against official documentation for mutual compatibility and locked in `pnpm-lock.yaml`. This document deliberately lists no version numbers; `package.json` files are the source of truth.

## 11. Open decisions

| Decision | Current leaning | Decided in |
| --- | --- | --- |
| Product images | URL field pointing at seeded or external images; no upload pipeline | M2 |
| Reservation expiry mechanism | Expiry timestamp checked on access plus a periodic sweep in the API process | M6 |
| Stripe integration surface | PaymentIntents with Stripe Elements | M7 |
| `packages/shared` | Create only if Zod schemas are needed by both apps | When first needed |
