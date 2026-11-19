# CartForge

A full-stack e-commerce application: Next.js storefront, Express API, PostgreSQL, and Redis, organised as a pnpm monorepo.

**Status:** Milestones 1 to 9 are complete: project foundation, database, product catalog, user accounts, persistent cart, checkout with order management, test-mode payments through Stripe Checkout, an admin dashboard for running the store, and Redis caching with database indexing for the catalog. The Stripe integration has been tested with mocked Stripe API calls and with the local development simulator. It has **not yet been verified against real Stripe Test Mode**; see [Verifying with Stripe Test Mode](#verifying-with-stripe-test-mode).

## What works today

- Storefront: homepage, product listing with search, category and price filters, sorting and pagination, category pages, and product detail pages with an image gallery and stock status.
- Accounts: registration, sign-in, sign-out, sign-out of all devices, password change, and an account page, using database-backed sessions in an HttpOnly cookie.
- Cart: add from product pages and listings, change quantities, remove items, and clear the cart. The cart is stored in PostgreSQL per account, so it follows the customer across devices.
- Orders: checkout with a shipping address, stock reserved for 30 minutes, order history, order detail with status, and cancellation. Reservations that run out are released automatically.
- Payments: Stripe Checkout in test mode, verified webhooks, reconciliation of amount and order, refunds for payments that arrive too late, and retry after a failed attempt.
- Administration: a dashboard of sales, orders, and stock; product, category, and inventory management; and order fulfilment limited to permitted status changes.
- Catalog API: product list, product detail, and categories, validated with Zod and limited to published products. Responses are cached in Redis with live prices and stock, and search uses trigram indexes. Measurements are in [docs/performance.md](docs/performance.md).
- Auth API: Argon2id password hashing, session expiry and revocation, role checks for customers and administrators, CSRF protection, and login rate limiting.
- PostgreSQL schema for users, sessions, catalog, carts, orders, and payments, with migrations, database-level constraints, and a development seed.
- API health endpoint that checks PostgreSQL and Redis, and a same-origin `/api/*` proxy from the web app.
- Docker Compose services, linting, formatting, type checking, database, API, and web tests, and a CI workflow.

Product images are labelled placeholder drawings, not product photography.

## Stack

| Area    | Technology                                                         |
| ------- | ------------------------------------------------------------------ |
| Web     | Next.js 16 (App Router), React 19, Tailwind CSS 4                  |
| API     | Node.js, Express 5, Zod 4, Pino                                    |
| Data    | PostgreSQL 17, Prisma 7, Redis 8                                   |
| Tooling | TypeScript 6, pnpm workspaces, ESLint, Prettier, Vitest, Supertest |

## Project structure

```
.
├── apps/
│   ├── api/                         Express API
│   │   ├── src/
│   │   │   ├── config/              environment validation
│   │   │   ├── lib/                 logger, Prisma client, Redis client, error class
│   │   │   ├── middleware/          authentication, CSRF origin check, not-found and error handlers
│   │   │   ├── modules/
│   │   │   │   ├── admin/           administrator routes and dashboard figures
│   │   │   │   ├── auth/            registration, login, logout, sessions, password hashing
│   │   │   │   ├── cart/            cart routes, controller, service, schemas, tests
│   │   │   │   ├── health/          health endpoint
│   │   │   │   ├── inventory/       stock reservation, release, and sale
│   │   │   │   ├── orders/          checkout, order history, cancellation, expiry
│   │   │   │   ├── payments/        Stripe Checkout, webhook, refunds, development simulator
│   │   │   │   ├── products/        catalog routes, controller, service, schemas, tests
│   │   │   │   └── users/           current user and administrator user list
│   │   │   ├── app.ts               Express app assembly
│   │   │   └── server.ts            process entry point
│   │   ├── benchmarks/              benchmark dataset, load test, and latency probe
│   │   ├── scripts/                 create-admin.ts
│   │   └── tests/                   test database setup and auth test helpers
│   └── web/                         Next.js application
│       ├── public/images/products/  placeholder product images
│       ├── src/app/                 root layout, not-found page, global styles
│       ├── src/app/(shop)/          homepage, products, product detail, categories
│       ├── src/app/(auth)/          sign-in and registration pages
│       ├── src/app/account/         account page
│       ├── src/app/admin/           admin dashboard, products, inventory, categories, orders
│       ├── src/app/cart/            cart page
│       ├── src/app/checkout/        checkout page
│       ├── src/app/orders/          order history, order detail, and payment return pages
│       ├── src/app/dev/             development payment simulator page
│       ├── src/components/          header, footer, search form, account navigation
│       ├── src/components/admin/    admin navigation, charts, forms, tables, status actions
│       ├── src/components/auth/     sign-in, registration, and password forms, sign-out button
│       ├── src/components/cart/     add-to-cart button, cart rows, clear-cart control, header cart link
│       ├── src/components/checkout/ checkout form
│       ├── src/components/orders/   status badge, progress tracker, cancel control
│       ├── src/components/payments/ pay button, payment confirmation polling, simulator controls
│       ├── src/components/catalog/  product card and grid, filters, sort, pagination, gallery
│       ├── src/lib/                 API clients, current user lookup, form schemas, URL filter parsing
│       └── next.config.ts           API proxy and environment validation
├── packages/
│   └── db/                          Prisma schema, migrations, seed, client factory
│       ├── prisma/                  schema.prisma, migrations/, seed.ts, seed-catalog.ts
│       ├── src/                     client factory and test-database helpers
│       └── tests/                   database integration tests
├── docs/                            architecture, database schema, roadmap
├── .github/workflows/ci.yml
├── docker-compose.yml
├── eslint.config.mjs
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

## Local setup

Prerequisites: Node.js 22.12 or later (24 recommended, see `.nvmrc`), pnpm 10, and Docker with Compose.

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm services:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- Products API: http://localhost:4000/api/v1/products
- API health: http://localhost:4000/health
- API health through the web proxy: http://localhost:3000/api/v1/health

`pnpm install` also generates the Prisma client and builds `packages/db`. `pnpm services:up` starts PostgreSQL, Redis for rate limits, and a separate Redis for the catalog cache, and waits until all three are healthy; `pnpm services:down` stops them. `pnpm db:migrate` applies the migrations to the development database, and `pnpm db:seed` loads 5 categories and 20 products; the seed can be run again at any time without creating duplicates.

## Configuration

| File                  | Read by                                    | Variables                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`                | Docker Compose, the API, Prisma CLI, tests | `POSTGRES_*`, `REDIS_PORT`, `CACHE_REDIS_PORT`, `NODE_ENV`, `API_PORT`, `LOG_LEVEL`, `WEB_ORIGIN`, `TRUST_PROXY_HOPS`, `DATABASE_URL`, `REDIS_URL`, `CACHE_REDIS_URL`, `TEST_DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `apps/web/.env.local` | The web app                                | `API_URL`                                                                                                                                                                                                                                |

The API and the web app validate their configuration at startup and refuse to start if it is invalid. The values in the example files are for local development only.

## Scripts

Run from the repository root.

| Command             | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`          | Start the API and web app with reload                                         |
| `pnpm build`        | Build all packages                                                            |
| `pnpm lint`         | Run ESLint                                                                    |
| `pnpm typecheck`    | Type-check all packages                                                       |
| `pnpm test`         | Run database, API, and web unit tests (requires PostgreSQL and Redis running) |
| `pnpm db:migrate`   | Create and apply migrations on the development database                       |
| `pnpm db:seed`      | Load the development catalog                                                  |
| `pnpm admin:create` | Create or promote an administrator (see below)                                |
| `pnpm format`       | Format with Prettier                                                          |
| `pnpm format:check` | Check formatting                                                              |

## Accounts and authentication

| Endpoint                            | Access        | Description                                              |
| ----------------------------------- | ------------- | -------------------------------------------------------- |
| `POST /api/v1/auth/register`        | Public        | Create a customer account and sign in                    |
| `POST /api/v1/auth/login`           | Public        | Sign in                                                  |
| `POST /api/v1/auth/logout`          | Public        | End the current session                                  |
| `POST /api/v1/auth/logout-all`      | Signed in     | End every session of the account                         |
| `POST /api/v1/auth/change-password` | Signed in     | Change the password and end the account's other sessions |
| `GET /api/v1/users/me`              | Signed in     | The signed-in user                                       |
| `GET /api/v1/users`                 | Administrator | Paginated list of users                                  |

Sessions are opaque random tokens kept in an HttpOnly cookie; only their SHA-256 hash is stored. State-changing requests must come from the web app's origin (`WEB_ORIGIN`), so when calling the API directly, send an `Origin` header:

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/login \
  -H "Origin: http://localhost:3000" -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your password"}'
```

Registration always creates a customer. To create an administrator, or promote an existing account, run:

```bash
pnpm admin:create
```

It asks for a name, an email, and a password. The password is typed at a hidden prompt and is not accepted as an argument or environment variable, so it is not saved in shell history. For scripted use, set `ADMIN_NAME` and `ADMIN_EMAIL` and pipe the password in on standard input.

## Cart

All cart endpoints require a signed-in user and act on that user's cart.

| Endpoint                            | Description                                             |
| ----------------------------------- | ------------------------------------------------------- |
| `GET /api/v1/cart`                  | The cart with current prices, availability, and totals  |
| `POST /api/v1/cart/items`           | Add a product, or raise its quantity if already present |
| `PATCH /api/v1/cart/items/:itemId`  | Set an item's quantity                                  |
| `DELETE /api/v1/cart/items/:itemId` | Remove an item                                          |
| `DELETE /api/v1/cart`               | Remove every item                                       |

Every endpoint returns the resulting cart. Amounts are integer paise, calculated from current database prices:

```json
{
  "data": {
    "items": [
      {
        "id": "01a1dc0e-…",
        "quantity": 2,
        "availability": "AVAILABLE",
        "lineTotalPaise": 239800,
        "product": {
          "id": "01a1d9d2-…",
          "name": "Yoga Mat, 6 mm",
          "slug": "yoga-mat-6mm",
          "pricePaise": 119900,
          "image": { "url": "/images/products/yoga-mat-6mm-1.svg", "altText": "…" },
          "availableQuantity": 110
        }
      }
    ],
    "itemCount": 2,
    "subtotalPaise": 239800,
    "hasItemsNeedingAttention": false,
    "maxQuantityPerItem": 10
  }
}
```

A cart holds at most 10 of one product. Adding to the cart does not reserve stock. An item whose product is withdrawn or runs short stays in the cart with an `availability` of `UNAVAILABLE`, `OUT_OF_STOCK`, or `INSUFFICIENT_STOCK` and is left out of the subtotal.

| Error code                | Status | Meaning                                         |
| ------------------------- | ------ | ----------------------------------------------- |
| `PRODUCT_NOT_FOUND`       | 404    | The product does not exist or is not published  |
| `CART_ITEM_NOT_FOUND`     | 404    | The item is not in the caller's cart            |
| `OUT_OF_STOCK`            | 409    | No units are available                          |
| `INSUFFICIENT_STOCK`      | 409    | Fewer units are available than requested        |
| `QUANTITY_LIMIT_EXCEEDED` | 409    | The cart would hold more than 10 of the product |

## Orders

All order endpoints require a signed-in user and only ever return that user's orders.

| Endpoint                              | Description                                                |
| ------------------------------------- | ---------------------------------------------------------- |
| `POST /api/v1/orders`                 | Create an order from the cart and reserve its stock        |
| `GET /api/v1/orders`                  | The customer's orders, newest first, paginated             |
| `GET /api/v1/orders/:orderId`         | One order with its items and shipping address              |
| `POST /api/v1/orders/:orderId/cancel` | Cancel an order that is awaiting payment and release stock |

Checkout needs an `Idempotency-Key` header (a UUID chosen by the client) and the total the customer was shown:

```bash
curl -X POST http://localhost:4000/api/v1/orders \
  -H "Origin: http://localhost:3000" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f" -b cookies.txt \
  -d '{
    "expectedTotalPaise": 239800,
    "shippingAddress": {
      "name": "Asha Rao", "phone": "9876543210", "addressLine1": "12 MG Road",
      "city": "Bengaluru", "state": "Karnataka", "postalCode": "560001"
    }
  }'
```

It returns `201` with the order, or `200` with the same order if the key was already used. The order starts as `PENDING_PAYMENT` and holds its stock for 30 minutes. Because online payment is not built yet, orders cannot be paid: they expire, or the customer cancels them, and the stock is returned.

| Error code              | Status | Meaning                                                                |
| ----------------------- | ------ | ---------------------------------------------------------------------- |
| `CART_EMPTY`            | 409    | There is nothing to order                                              |
| `ITEMS_UNAVAILABLE`     | 409    | An item is no longer sold or lacks stock; nothing was reserved         |
| `CART_CHANGED`          | 409    | The server's total differs from `expectedTotalPaise`; no order created |
| `ORDER_NOT_CANCELLABLE` | 409    | The order is no longer awaiting payment                                |
| `ORDER_NOT_FOUND`       | 404    | No such order belongs to the caller                                    |

Order statuses are `PENDING_PAYMENT`, `PAID`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `EXPIRED`, and `REFUNDED`. See [docs/architecture.md](docs/architecture.md) for the lifecycle and the concurrency design.

## Payments

Payments use Stripe Checkout in **test mode only**: the API refuses to start with a live key. The customer pays on Stripe's hosted page, so card details never reach CartForge, and an order becomes `PAID` only when a verified webhook confirms the payment.

| Endpoint                                | Access    | Description                                                 |
| --------------------------------------- | --------- | ----------------------------------------------------------- |
| `POST /api/v1/orders/:orderId/payments` | Signed in | Start or resume payment for an order; returns `checkoutUrl` |
| `POST /api/v1/payments/webhook`         | Stripe    | Signed webhook endpoint; no cookie or `Origin` required     |

Errors from starting a payment: `ORDER_NOT_FOUND` (404), `ORDER_NOT_PAYABLE` (409, the order is no longer awaiting payment), `PAYMENT_ATTEMPTS_EXHAUSTED` (409, three attempts used), and `PAYMENT_PROVIDER_UNAVAILABLE` (502, safe to retry).

| Variable                | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`     | Stripe test-mode secret key (`sk_test_...`). Leave empty to use the simulator. |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_...`). Required when a key is set.              |

### Verifying with Stripe Test Mode

This has not been done yet. To do it, without putting any key in chat, a commit, or the command line:

1. In the Stripe dashboard, switch to **Test mode** and copy the test secret key (`sk_test_...`) from Developers → API keys. Never use a live key; the API refuses to start with one.
2. Paste it into your local, git-ignored `.env` as `STRIPE_SECRET_KEY`.
3. Install the Stripe CLI, run `stripe login`, then start forwarding webhooks:

   ```bash
   stripe listen --forward-to localhost:4000/api/v1/payments/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
   ```

   It prints a signing secret (`whsec_...`). Put it in `.env` as `STRIPE_WEBHOOK_SECRET`.

4. Run `pnpm dev`. The API should not log that it is using the simulator.
5. Place an order and pay with test card `4242 4242 4242 4242`, any future expiry, and any CVC. The order should become Paid within a few seconds and `stripe listen` should show a `200` for `checkout.session.completed`.
6. Check the other paths: card `4000 0000 0000 0002` (declined, order stays payable), leaving the Stripe page with its back link (cancellation page with retry), and running `stripe trigger checkout.session.completed` (an event for no known payment, which is acknowledged and ignored).
7. Check a late payment: open the payment page, then in a database client set the order's `reservation_expires_at` to the past, reload the order page (it becomes Expired), and pay. The payment should be refunded, visible in the Stripe dashboard under Payments.
8. Afterwards, remove both values from `.env` and roll the test key in the dashboard if it was exposed anywhere.

### Without a Stripe account

Leave both variables empty. The API logs that it is using the development simulator, and "Place order and pay" opens a local page labelled "Development simulator · not Stripe". Its buttons send the store signed events shaped like Stripe's, which go through the same verification and handling as real webhooks. No money moves and no card details are collected. The simulator is never available in production or when a key is set.

See [docs/architecture.md](docs/architecture.md) for how payments, reservations, late payments, and refunds fit together.

## Administration

Sign in as an administrator (create one with `pnpm admin:create`) and open http://localhost:3000/admin. The header shows an **Admin** link to administrators only. Every endpoint below requires an administrator session; customers get `403` and anonymous requests `401`.

| Endpoint                                            | Description                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/dashboard`                       | Revenue, pending payments, refunds, order and product counts, low stock, 14-day sales |
| `GET /api/v1/admin/products`                        | All products; filters `q`, `status`, `categoryId`, `lowStock`                         |
| `POST /api/v1/admin/products`                       | Create a product (price in paise)                                                     |
| `GET /api/v1/admin/products/:id`                    | One product with stock, reserved, and available units                                 |
| `PATCH /api/v1/admin/products/:id`                  | Edit catalog fields or status (archive, reactivate)                                   |
| `POST /api/v1/admin/products/:id/stock-adjustments` | Add or remove stock: `{ "delta": 10 }` or `{ "delta": -3 }`                           |
| `GET /api/v1/admin/categories`                      | Categories with product counts                                                        |
| `POST /api/v1/admin/categories`                     | Create a category                                                                     |
| `PATCH /api/v1/admin/categories/:id`                | Rename a category or change its slug                                                  |
| `DELETE /api/v1/admin/categories/:id`               | Delete a category that has no products                                                |
| `GET /api/v1/admin/orders`                          | All orders; filters `status`, `reference` (`#ABCD1234`), `email`                      |
| `GET /api/v1/admin/orders/:id`                      | Items, shipping, customer, payments, and allowed next steps                           |
| `POST /api/v1/admin/orders/:id/transitions`         | Change status: `{ "from": "PAID", "to": "PROCESSING" }`                               |

Permitted order changes are awaiting payment → cancelled (stock released), and paid → processing → shipped → delivered. An administrator can never mark an order paid; only a verified payment does. Stock can never be reduced below the units reserved by unpaid orders.

| Error code               | Status | Meaning                                                 |
| ------------------------ | ------ | ------------------------------------------------------- |
| `ALREADY_EXISTS`         | 409    | The slug, or a category's name, is already in use       |
| `CATEGORY_HAS_PRODUCTS`  | 409    | Only empty categories can be deleted                    |
| `STOCK_BELOW_RESERVED`   | 409    | The change would leave fewer units than are reserved    |
| `STOCK_BELOW_ZERO`       | 409    | The change would remove more units than are in stock    |
| `TRANSITION_NOT_ALLOWED` | 409    | The status change is not in the policy                  |
| `ORDER_STATUS_CHANGED`   | 409    | The order changed since it was loaded; reload and retry |

## Tests and the test database

Tests run against a separate database named by `TEST_DATABASE_URL` (`cartforge_test` by default), which is created and migrated automatically on the first run. Tests refuse to start if that variable is missing, names a database that does not end in `_test`, or matches `DATABASE_URL`, so they cannot modify development data.

## Catalog API

All amounts are integer paise. Only published (`ACTIVE`) products are returned.

| Endpoint                     | Description                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `GET /api/v1/products`       | Paginated product list with search, filters, and sorting       |
| `GET /api/v1/products/:slug` | One product with description and all images                    |
| `GET /api/v1/categories`     | Categories that have published products, with a count for each |

Query parameters for the product list:

| Parameter       | Meaning                                                   | Default  |
| --------------- | --------------------------------------------------------- | -------- |
| `q`             | Search terms; each must appear in the name or description |          |
| `category`      | Category slug                                             |          |
| `minPricePaise` | Minimum price, inclusive                                  |          |
| `maxPricePaise` | Maximum price, inclusive                                  |          |
| `sort`          | `newest`, `price_asc`, or `price_desc`                    | `newest` |
| `page`          | Page number, starting at 1                                | `1`      |
| `pageSize`      | Items per page, 1 to 48                                   | `12`     |

```bash
curl "http://localhost:4000/api/v1/products?category=electronics&maxPricePaise=600000&sort=price_asc"
```

Invalid parameters return `400` with code `VALIDATION_ERROR` and the list of invalid fields. An unknown or unpublished product returns `404` with code `PRODUCT_NOT_FOUND`.

### Caching

The three catalog endpoints are cached in Redis for 2 minutes (lists) or 5 minutes (detail and categories). Prices, publication status, and stock are read from PostgreSQL on every request, so they are never stale. Edits made through the admin API appear immediately. Changes made directly in the database, including `pnpm db:seed`, can take up to 5 minutes to change names, descriptions, or list membership. The cache runs on its own Redis instance (`CACHE_REDIS_URL`), so it can evict entries under memory pressure without touching rate-limit counters. If it is unavailable, the catalog is served from PostgreSQL. Design and measurements are in [docs/performance.md](docs/performance.md).

## Health endpoint

`GET /health` returns `200` when PostgreSQL and the rate-limit Redis are reachable and `503` otherwise. The catalog cache is reported too, but does not affect the status, because the catalog is served from PostgreSQL without it:

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up", "cache": "up" } }
```

The same handler is mounted at `/api/v1/health` so it can be reached through the web proxy.
