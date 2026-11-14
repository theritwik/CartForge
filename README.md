# CartForge

A full-stack e-commerce application: Next.js storefront, Express API, PostgreSQL, and Redis, organised as a pnpm monorepo.

**Status:** Milestones 1 (project foundation) and 2 (database foundation) are complete. No store features exist yet. See [docs/roadmap.md](docs/roadmap.md) for what is planned, [docs/architecture.md](docs/architecture.md) for the design, and [docs/database.md](docs/database.md) for the schema.

## What works today

- Express API with validated environment configuration, structured logging, security headers, a central error handler, and a health endpoint that checks PostgreSQL and Redis.
- Next.js homepage, with `/api/*` proxied to the API so the browser uses a single origin.
- PostgreSQL schema for users, sessions, catalog, carts, orders, and payments, with migrations, database-level constraints, and a development seed. No API endpoints use these tables yet.
- Docker Compose services for PostgreSQL and Redis.
- Linting, formatting, type checking, tests, and a CI workflow.

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
│   ├── api/                     Express API
│   │   └── src/
│   │       ├── config/          environment validation
│   │       ├── lib/             logger, Prisma client, Redis client, error class
│   │       ├── middleware/      not-found and error handlers
│   │       ├── modules/health/  health endpoint
│   │       ├── app.ts           Express app assembly
│   │       └── server.ts        process entry point
│   └── web/                     Next.js application
│       ├── src/app/             layout, homepage, global styles
│       ├── src/components/      header and footer
│       └── next.config.ts       API proxy and environment validation
├── packages/
│   └── db/                      Prisma schema, migrations, seed, client factory
│       ├── prisma/              schema.prisma, migrations/, seed.ts, seed-catalog.ts
│       ├── src/                 client factory and test-database helpers
│       └── tests/               database integration tests
├── docs/                        architecture, database schema, roadmap
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
- API health: http://localhost:4000/health
- API health through the web proxy: http://localhost:3000/api/v1/health

`pnpm install` also generates the Prisma client and builds `packages/db`. `pnpm services:up` starts PostgreSQL and Redis and waits until both are healthy; `pnpm services:down` stops them. `pnpm db:migrate` applies the migrations to the development database, and `pnpm db:seed` loads 5 categories and 20 products; the seed can be run again at any time without creating duplicates.

## Configuration

| File                  | Read by                                    | Variables                                                                                                         |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `.env`                | Docker Compose, the API, Prisma CLI, tests | `POSTGRES_*`, `REDIS_PORT`, `NODE_ENV`, `API_PORT`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`, `TEST_DATABASE_URL` |
| `apps/web/.env.local` | The web app                                | `API_URL`                                                                                                         |

The API and the web app validate their configuration at startup and refuse to start if it is invalid. The values in the example files are for local development only.

## Scripts

Run from the repository root.

| Command             | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `pnpm dev`          | Start the API and web app with reload                              |
| `pnpm build`        | Build all packages                                                 |
| `pnpm lint`         | Run ESLint                                                         |
| `pnpm typecheck`    | Type-check all packages                                            |
| `pnpm test`         | Run database and API tests (requires PostgreSQL and Redis running) |
| `pnpm db:migrate`   | Create and apply migrations on the development database            |
| `pnpm db:seed`      | Load the development catalog                                       |
| `pnpm format`       | Format with Prettier                                               |
| `pnpm format:check` | Check formatting                                                   |

## Tests and the test database

Tests run against a separate database named by `TEST_DATABASE_URL` (`cartforge_test` by default), which is created and migrated automatically on the first run. Tests refuse to start if that variable is missing, names a database that does not end in `_test`, or matches `DATABASE_URL`, so they cannot modify development data.

## Health endpoint

`GET /health` returns `200` when PostgreSQL and Redis are reachable and `503` otherwise:

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up" } }
```

The same handler is mounted at `/api/v1/health` so it can be reached through the web proxy.
