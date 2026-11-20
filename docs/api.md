# CartForge API

The Express API under `/api/v1`. All amounts are integer paise (INR). Request bodies are JSON, at most 10 KB (32 KB for the admin API), and validated with Zod: an invalid request answers `400` with code `VALIDATION_ERROR` and the invalid fields, and an oversized one `413` with `PAYLOAD_TOO_LARGE`.

State-changing requests must carry the web app's `Origin` (`WEB_ORIGIN`). They are limited per client address (120 a minute by default) and, under `/api/v1/admin`, per administrator (60 a minute). Over a limit the API answers `429` with `TOO_MANY_REQUESTS` and a `Retry-After` header.

## Catalog

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

It returns `201` with the order, or `200` with the same order if the key was already used. The order starts as `PENDING_PAYMENT` and holds its stock for 30 minutes (extended while a payment page is open). It becomes `PAID` only through a verified payment webhook; an unpaid order expires, or the customer cancels it, and its stock is returned.

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

Without a Stripe key the API uses the labelled development simulator instead; see the README and [stripe-test-mode.md](stripe-test-mode.md).

## Administration

Every endpoint below requires an administrator session; customers get `403` and anonymous requests `401`.

| Endpoint                                            | Description                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/dashboard`                       | Revenue, pending payments, refunds, order and product counts, low stock, 14-day sales |
| `GET /api/v1/admin/products`                        | All products; filters `q`, `status`, `categoryId`, `lowStock`                         |
| `POST /api/v1/admin/products`                       | Create a product (price in paise)                                                     |
| `GET /api/v1/admin/products/:id`                    | One product with stock, reserved, and available units                                 |
| `PATCH /api/v1/admin/products/:id`                  | Edit catalog fields or status (archive, reactivate)                                   |
| `GET /api/v1/admin/products/:id/stock-adjustments`  | The 20 most recent stock adjustments, with administrator and reason                   |
| `POST /api/v1/admin/products/:id/stock-adjustments` | Add or remove stock: `{ "delta": 10, "reason": "Delivery" }` (reason optional)        |
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

## Health

`GET /health/live` returns `200` while the process is serving, without checking dependencies (liveness). `GET /health` (readiness) returns `200` when PostgreSQL and the rate-limit Redis are reachable and `503` otherwise. The catalog cache is reported too, but does not affect the status, because the catalog is served from PostgreSQL without it:

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up", "cache": "up" } }
```

The same handler is mounted at `/api/v1/health` so it can be reached through the web proxy.
