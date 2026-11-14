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
│       │   │   ├── health/
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
│   │   │   ├── seed.ts
│   │   │   └── seed-catalog.ts
│   │   ├── src/
│   │   │   ├── index.ts          exports the Prisma client and generated types
│   │   │   └── testing.ts        test-database guards and helpers
│   │   └── tests/                database integration tests
│   └── shared/                   only if web and api need shared schemas or types
├── docs/
│   ├── architecture.md
│   ├── database.md
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

| Module    | Responsibility                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth      | Registration, login, logout, session creation, validation, expiry, and revocation                                                                 |
| users     | Current user profile, admin user listing                                                                                                          |
| products  | Catalog queries (list, filter, search, detail), categories, admin product CRUD                                                                    |
| inventory | Stock levels, reservations, release, admin stock adjustments                                                                                      |
| cart      | Per-user cart contents and totals                                                                                                                 |
| orders    | Checkout, order lifecycle, order history, admin order management                                                                                  |
| payments  | Stripe PaymentIntent creation, webhook verification and handling                                                                                  |
| health    | Liveness and dependency checks for PostgreSQL and Redis. Served at `/health` for infrastructure probes and `/api/v1/health` through the web proxy |

### 4.3 API conventions

- REST, JSON, versioned under `/api/v1`.
- Controllers validate `body`, `params`, and `query` by parsing them with the module's Zod schemas before calling a service. A failed parse throws, and the error handler turns it into a `400 VALIDATION_ERROR` response listing each invalid field. (Express 5 makes `req.query` read-only, so a middleware cannot replace it with parsed values.)
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

- Hashed with Argon2id using OWASP's recommended configuration (19 MiB memory, 2 iterations, 1 thread). The parameters are constants in the auth module; a hash made with older parameters is rehashed on the next successful login.
- Passwords are 10 to 128 characters. The upper bound keeps hashing cost predictable.
- Login failures return one generic message regardless of whether the email exists, and an unknown email is checked against a decoy hash so it takes as long to reject as a wrong password.
- Rate limits (fixed windows in Redis): login is limited to 5 attempts per email and 30 per IP address every 15 minutes, and a successful login clears the email counter; registration is limited to 10 per IP address per hour. If Redis is unreachable the limiter allows the request and logs the failure, so a Redis outage does not lock everyone out.
- Registration answers 409 for an email that is already registered. Without email verification there is no way to hide this from the person registering; the registration rate limit bounds its use for probing.

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
- A password change requires the current password, keeps the session that made the change, and deletes all of the user's other sessions. Attempts are limited to 5 per user every 15 minutes.
- Because every request checks the database, revocation takes effect on the next request with no token-lifetime window.

**Cookie configuration**

| Attribute  | Value                                    | Reason                                                                                                                                    |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Name       | `__Host-cartforge_session` in production | The `__Host-` prefix makes the browser require `Secure`, `Path=/`, and no `Domain`, which prevents subdomains from overwriting the cookie |
| `HttpOnly` | set                                      | JavaScript cannot read the token                                                                                                          |
| `Secure`   | set in production                        | Sent over HTTPS only                                                                                                                      |
| `SameSite` | `Lax`                                    | Not sent on cross-site subrequests or cross-site form posts                                                                               |
| `Path`     | `/`                                      |                                                                                                                                           |
| `Domain`   | not set                                  | Host-only cookie                                                                                                                          |
| `Max-Age`  | idle timeout                             |                                                                                                                                           |

`Secure` and the `__Host-` prefix are applied whenever `NODE_ENV` is `production` and only then, because plain HTTP in development cannot use them. There is no separate switch, so a production deployment cannot be configured with a non-secure cookie.

**CSRF protection**

Cookie-based sessions are sent automatically by the browser, so state-changing requests are protected in layers:

1. `SameSite=Lax` stops the cookie from being attached to cross-site `POST`, `PUT`, `PATCH`, and `DELETE` requests.
2. Safe methods (`GET`, `HEAD`, `OPTIONS`) never change state.
3. Middleware on every non-safe request under `/api` verifies that the `Origin` header (falling back to `Referer`) matches `WEB_ORIGIN`, and rejects the request with 403 otherwise, including when both headers are absent. This also covers login and registration, preventing login CSRF.
4. Mutating endpoints accept only `application/json`. A cross-site HTML form cannot send that content type without a CORS preflight, and CORS allows only the web origin.

The Stripe webhook is exempt from the origin check: it carries no session cookie and is authenticated by its signature instead.

**Authorization**

- Roles: `CUSTOMER` and `ADMIN`. Role checks happen in middleware; ownership checks (a user may only read their own orders) happen in services.
- The role is read from the user row loaded with the session, so a role change applies on the next request.
- Registration never accepts a role. Administrators are created or promoted only by the `pnpm admin:create` script, which reads the name, email, and password from environment variables.
- Responses select an explicit list of public user fields; the password hash is never read into a response.

**Web app**

- Sign-in, registration, and sign-out are `fetch` calls from the browser to the same-origin `/api` proxy, so the API sets and clears the cookie directly. The token is never available to JavaScript and nothing is kept in `localStorage`.
- Server Components find the signed-in user by forwarding the session cookie to `GET /api/v1/users/me`. The web app does not validate sessions itself.
- The API trusts `X-Forwarded-For` from `TRUST_PROXY_HOPS` proxies (1 when the web app proxies to it) so rate limits see the real client address. With a non-zero value the API must be reachable only through that proxy; a client that could connect to it directly could forge the header.

### 4.5 Redis usage

Redis is used only where it removes real load or enforces a limit:

- Rate limiting counters (auth endpoints first, then general API).
- Read-through cache for catalog list and detail responses, invalidated on product or stock writes.

Redis is not a source of truth. The API must behave correctly, only slower, when the cache is empty.

## 5. Data model

The schema is implemented in `packages/db` and documented in full, with a relationship diagram, in [database.md](database.md).

| Entity       | Key fields                                                                                        | Notes                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| User         | email (unique), passwordHash, name, role                                                          |                                                                                     |
| Session      | userId, tokenHash (unique), createdAt, lastUsedAt, expiresAt                                      | Stores only the hash of the session token; deleted on logout or revocation          |
| Category     | name (unique), slug (unique)                                                                      |                                                                                     |
| Product      | categoryId, name, slug (unique), description, pricePaise, status, stockQuantity, reservedQuantity | Available = stockQuantity - reservedQuantity. Archived, never deleted, once ordered |
| ProductImage | productId, url, altText, position                                                                 | Position 0 is the primary image                                                     |
| Cart         | userId (unique)                                                                                   | One cart per user                                                                   |
| CartItem     | cartId, productId, quantity                                                                       | Unique on (cartId, productId)                                                       |
| Order        | userId, idempotencyKey, status, totalPaise, shipping address fields, reservationExpiresAt         |                                                                                     |
| OrderItem    | orderId, productId, productName, unitPricePaise, quantity                                         | Immutable snapshot of name and price at purchase                                    |
| Payment      | orderId (unique), stripePaymentIntentId (unique), status, amountPaise                             |                                                                                     |

A table recording processed Stripe event IDs, for webhook idempotency, is added in the payments milestone when it is first used.

Rules:

- The currency is INR. All money is stored and computed as integer paise (minor currency units, 100 paise = 1 rupee). Totals are computed on the server from database prices, never from client input.
- Amounts are converted to rupees only for display. Stripe receives the amount in paise with currency `inr`, which is the unit its API expects.
- Primary keys are UUID v7 values; public URLs use slugs for products.
- Rules the database can enforce are enforced there: uniqueness, foreign keys, CHECK constraints on amounts and quantities, and a trigger that makes order items immutable.

## 6. Critical flows

### 6.1 Checkout and stock reservation

The client sends a shipping address, the total it displayed (`expectedTotalPaise`), and an `Idempotency-Key` header. In one transaction the orders service:

1. Locks the customer's cart row. A customer's checkouts therefore run one at a time.
2. Looks for an order with the same idempotency key and, if one exists, returns it. A repeated or double-submitted request never creates a second order.
3. Reads the cart items and reserves stock for each with a conditional update: `reservedQuantity` increases only where the product is `ACTIVE` and `stockQuantity - reservedQuantity >= requested`. The same statement returns the product's current name and price.
4. If any update matches no row, the transaction rolls back, releasing everything reserved so far, and the API answers `ITEMS_UNAVAILABLE` with the items that need attention.
5. Compares the total at current prices with `expectedTotalPaise`. If they differ the transaction rolls back and the API answers `CART_CHANGED`, so a customer is never charged a total they did not see. The client's figure is used only for this comparison, never as the price.
6. Creates the `Order` (`PENDING_PAYMENT`, reservation expiring in 30 minutes) and its `OrderItem` snapshots, and empties the cart. The order now holds those items, so the same cart cannot reserve them twice.

**Concurrency**

- The conditional update is a single atomic check-and-change. Of two transactions competing for the last unit, the second waits on the row lock, re-evaluates the condition after the first commits, and matches nothing. Available stock cannot go negative, and a CHECK constraint (`0 <= reserved <= stock`) backs this up.
- Product rows are always updated in product-id order, in reservation, release, and sale alike. Transactions that touch the same products take their locks in the same sequence, so they cannot deadlock.
- Lock order across tables is fixed: checkout takes cart, then products; cancellation, expiry, and payment confirmation take the order, then products. No path takes them in the opposite order.

**Reservation expiry**

- An unpaid order holds its stock for 30 minutes.
- Expiry is a conditional status change (`PENDING_PAYMENT` and overdue, to `EXPIRED`) followed by the stock release, in one transaction. Whichever caller changes the status releases the stock; every other caller changes nothing. Stock is released exactly once however many sweeps or requests race.
- A sweep in the API process runs every minute. Each order is expired in its own transaction, so a failure leaves that order for the next run and does not block the others. If the process stops, nothing is lost: overdue orders are found by status and timestamp on the next run.
- An overdue order is also expired the moment its owner views it, so a customer never sees a stale "awaiting payment".

**Cancellation.** A customer can cancel their own order while it is `PENDING_PAYMENT`. It uses the same conditional status change, then releases the stock.

### 6.2 Payment confirmation

`confirmOrderPayment` in the orders service marks a `PENDING_PAYMENT` order `PAID` and converts its reservation into a sale by decreasing both `reservedQuantity` and `stockQuantity`, in one transaction. It returns false and changes nothing for an order in any other state, so a repeated notification is harmless. No HTTP route calls it. The payments milestone will call it from the Stripe webhook:

1. The browser confirms the payment with Stripe Elements.
2. Stripe sends `payment_intent.succeeded` (or `payment_intent.payment_failed`) to the webhook endpoint.
3. The API verifies the signature against the raw request body, then records the event ID in a processed-events table. A duplicate ID is acknowledged and ignored.
4. On success the webhook calls `confirmOrderPayment`.

The success page shown to the user is informational. Only the webhook changes order state. What to do when a payment succeeds for an order that has already expired (refund, or re-reserve if stock allows) is decided in the payments milestone.

### 6.3 Order status

```
PENDING_PAYMENT --> PAID --> PROCESSING --> SHIPPED --> DELIVERED
   |        |         |           |
   v        v         v           v
CANCELLED EXPIRED  REFUNDED    REFUNDED
```

| Status            | Meaning                                                  | Set by                  |
| ----------------- | -------------------------------------------------------- | ----------------------- |
| `PENDING_PAYMENT` | Order placed, stock reserved, awaiting payment           | Checkout                |
| `PAID`            | Payment confirmed; reserved stock has become a sale      | Payment webhook (M7)    |
| `PROCESSING`      | Being prepared for dispatch                              | Administrator (M8)      |
| `SHIPPED`         | Handed to the carrier                                    | Administrator (M8)      |
| `DELIVERED`       | Received by the customer                                 | Administrator (M8)      |
| `CANCELLED`       | Cancelled by the customer before payment; stock released | Customer                |
| `EXPIRED`         | Not paid within the reservation window; stock released   | Expiry sweep or on view |
| `REFUNDED`        | Payment returned                                         | Payments (M7)           |

Every transition implemented so far is a conditional update on the current status, so an order cannot make the same transition twice.

### 6.4 Catalog queries

- Public catalog endpoints only ever return `ACTIVE` products; drafts and archived products respond as not found.
- The list endpoint runs one transaction with two statements: the page of products (with category and primary image selected in the same query plan, so there is no query per product) and the total count.
- Available stock is `stockQuantity - reservedQuantity`, computed in the service and returned as `availableQuantity` and `inStock`.
- Search requires every term to appear in the product name or description, case-insensitively. `LIKE` wildcards in the input are escaped. This is a sequential scan, which is fine for a small catalog; a trigram index is the planned upgrade in the hardening milestone.
- Page size is capped at 48 and sorting uses the id as a tiebreaker so pages do not overlap.
- Numeric query parameters must be plain decimal digits, search text may not contain control characters, and a malformed product slug is answered with 404 without querying the database.
- The categories endpoint lists only categories that have at least one published product.

### 6.5 Cart

- A cart belongs to a signed-in user. Routes take no user or cart identifier; the user always comes from the session, and item lookups are scoped to that user's cart, so another customer's item id is simply not found.
- Adding to the cart never reserves stock. Price, status, and stock are read fresh every time the cart is returned, and are checked again at checkout.
- Totals use the current database price. The client sends only a product id and a quantity; any other field is discarded by validation.
- Each item reports an availability: `AVAILABLE`, `INSUFFICIENT_STOCK`, `OUT_OF_STOCK`, or `UNAVAILABLE`. Items that cannot be bought as they stand are kept, flagged, and excluded from the subtotal. They are never removed automatically.
- A customer may always lower a quantity or remove an item. Raising a quantity requires a published product with enough stock, up to 10 per product.

**Concurrency.** Every write (add, update, remove, clear) runs in a transaction that first takes a row lock on the user's cart (`SELECT ... FOR UPDATE`). Writes to one cart therefore run one after another, each seeing the result of the previous one, while different customers' carts never block each other.

- Two simultaneous adds of the same product both apply: the second waits, reads the quantity left by the first, and adds to it. The unique constraint on (cart, product) means there is only ever one row.
- Two simultaneous quantity updates are both accepted and the one that commits second determines the stored value. Each sets an absolute quantity, so the result is always one of the two requested values.
- The quantity limit and stock check are evaluated under the lock, so parallel requests cannot push an item past either.
- The cart row itself is created with `INSERT ... ON CONFLICT DO NOTHING` before the lock is taken, which is safe when a customer's first two requests arrive together.
- Reads take no lock.

## 7. Frontend

- Server Components by default; catalog and product pages fetch on the server. Client Components are used for interactive parts (cart controls, forms, Stripe Elements).
- Route groups separate the storefront, auth pages, account pages, and admin area, each with its own layout where needed.
- `lib/catalog-api.ts` is the catalog API client. Server Components call the API directly at `API_URL`, server to server, and validate each response with Zod. Requests made from the browser use the same-origin `/api` proxy.
- Cart state lives only on the server. Cart buttons call the API and then refresh the server-rendered page and header count; nothing about the cart is kept in `localStorage` or a client store.
- Listing state (search, price range, sort, page) lives in the URL. Pages parse it leniently, so a malformed query string falls back to defaults instead of an error page.
- Protected routes are checked on the server; the API remains the authority on authorization.
- No global state library is planned. Server state comes from the API; local state stays in components. This is revisited only if a concrete need appears.

## 8. Testing

| Level       | Tool               | Scope                                                                                                           |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest             | Pure logic: totals, status transitions, schema validation                                                       |
| Integration | Vitest + Supertest | HTTP endpoints against a real PostgreSQL test database, including auth, authorization, and concurrency on stock |
| End-to-end  | Playwright         | Critical journeys: register, browse, add to cart, check out with a Stripe test card, see the order              |

Integration tests do not mock Prisma. They run against a separate test database and cannot connect to the development database; see [database.md](database.md). Stripe is exercised with test-mode keys or signed fixture webhooks.

## 9. Local development and CI

- `docker-compose.yml` runs PostgreSQL and Redis for local development. The apps run on the host with hot reload.
- Configuration lives in two git-ignored files, each with a committed example: the root `.env` (read by Docker Compose, the API, and the Prisma CLI, which must agree on the database credentials) and `apps/web/.env.local` (the web app's `API_URL`).
- GitHub Actions runs on every push and pull request: install, lint, typecheck, unit and integration tests (with PostgreSQL and Redis service containers), and build. Playwright runs in CI once the end-to-end milestone lands.
- Production Dockerfiles for `web` and `api` are added in the final milestone.

## 10. Versions

Node.js uses an LTS release: `.nvmrc` pins the version used for development and CI, and `engines` sets the minimum supported version. Framework and library versions are the current stable releases at the time each is installed, verified against official documentation for mutual compatibility and locked in `pnpm-lock.yaml`. This document deliberately lists no version numbers; `package.json` files are the source of truth.

## 11. Open decisions

| Decision                   | Current leaning                                    | Decided in        |
| -------------------------- | -------------------------------------------------- | ----------------- |
| Stripe integration surface | PaymentIntents with Stripe Elements                | M7                |
| `packages/shared`          | Create only if Zod schemas are needed by both apps | When first needed |
