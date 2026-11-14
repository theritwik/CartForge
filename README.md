# CartForge

A full-stack e-commerce application: Next.js storefront, Express API, PostgreSQL, and Redis, organised as a pnpm monorepo.

**Status:** Milestones 1 to 4 are complete: project foundation, database, a browsable product catalog, and user accounts. Cart, checkout, payments, and the admin area are not built yet. See [docs/roadmap.md](docs/roadmap.md) for what is planned, [docs/architecture.md](docs/architecture.md) for the design, and [docs/database.md](docs/database.md) for the schema.

## What works today

- Storefront: homepage, product listing with search, category and price filters, sorting and pagination, category pages, and product detail pages with an image gallery and stock status.
- Accounts: registration, sign-in, sign-out, sign-out of all devices, and an account page, using database-backed sessions in an HttpOnly cookie.
- Catalog API: product list, product detail, and categories, validated with Zod and limited to published products.
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
│   │   │   │   ├── auth/            registration, login, logout, sessions, password hashing
│   │   │   │   ├── health/          health endpoint
│   │   │   │   ├── products/        catalog routes, controller, service, schemas, tests
│   │   │   │   └── users/           current user and administrator user list
│   │   │   ├── app.ts               Express app assembly
│   │   │   └── server.ts            process entry point
│   │   ├── scripts/                 create-admin.ts
│   │   └── tests/                   test database setup and auth test helpers
│   └── web/                         Next.js application
│       ├── public/images/products/  placeholder product images
│       ├── src/app/                 root layout, not-found page, global styles
│       ├── src/app/(shop)/          homepage, products, product detail, categories
│       ├── src/app/(auth)/          sign-in and registration pages
│       ├── src/app/account/         account page
│       ├── src/components/          header, footer, search form, account navigation
│       ├── src/components/auth/     sign-in and registration forms, sign-out button
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

`pnpm install` also generates the Prisma client and builds `packages/db`. `pnpm services:up` starts PostgreSQL and Redis and waits until both are healthy; `pnpm services:down` stops them. `pnpm db:migrate` applies the migrations to the development database, and `pnpm db:seed` loads 5 categories and 20 products; the seed can be run again at any time without creating duplicates.

## Configuration

| File                  | Read by                                    | Variables                                                                                                                                           |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`                | Docker Compose, the API, Prisma CLI, tests | `POSTGRES_*`, `REDIS_PORT`, `NODE_ENV`, `API_PORT`, `LOG_LEVEL`, `WEB_ORIGIN`, `TRUST_PROXY_HOPS`, `DATABASE_URL`, `REDIS_URL`, `TEST_DATABASE_URL` |
| `apps/web/.env.local` | The web app                                | `API_URL`                                                                                                                                           |

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

| Endpoint                       | Access        | Description                           |
| ------------------------------ | ------------- | ------------------------------------- |
| `POST /api/v1/auth/register`   | Public        | Create a customer account and sign in |
| `POST /api/v1/auth/login`      | Public        | Sign in                               |
| `POST /api/v1/auth/logout`     | Public        | End the current session               |
| `POST /api/v1/auth/logout-all` | Signed in     | End every session of the account      |
| `GET /api/v1/users/me`         | Signed in     | The signed-in user                    |
| `GET /api/v1/users`            | Administrator | Paginated list of users               |

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

## Health endpoint

`GET /health` returns `200` when PostgreSQL and Redis are reachable and `503` otherwise:

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up" } }
```

The same handler is mounted at `/api/v1/health` so it can be reached through the web proxy.
