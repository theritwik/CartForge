# CartForge

A full-stack e-commerce application: Next.js storefront, Express API, PostgreSQL, and Redis, organised as a pnpm monorepo.

**Status:** Milestone 1 (project foundation) is complete. No store features exist yet. See [docs/roadmap.md](docs/roadmap.md) for what is planned and [docs/architecture.md](docs/architecture.md) for the design.

## What works today

- Express API with validated environment configuration, structured logging, security headers, a central error handler, and a health endpoint that checks PostgreSQL and Redis.
- Next.js homepage, with `/api/*` proxied to the API so the browser uses a single origin.
- Prisma client package connected to PostgreSQL (no tables yet).
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
│   └── db/                      Prisma schema and client factory
├── docs/                        architecture and roadmap
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
pnpm dev
```

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- API health through the web proxy: http://localhost:3000/api/v1/health

`pnpm install` also generates the Prisma client and builds `packages/db`. `pnpm services:up` starts PostgreSQL and Redis and waits until both are healthy; `pnpm services:down` stops them.

## Configuration

| File                  | Read by                             | Variables                                                                                    |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `.env`                | Docker Compose, the API, Prisma CLI | `POSTGRES_*`, `REDIS_PORT`, `NODE_ENV`, `API_PORT`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL` |
| `apps/web/.env.local` | The web app                         | `API_URL`                                                                                    |

The API and the web app validate their configuration at startup and refuse to start if it is invalid. The values in the example files are for local development only.

## Scripts

Run from the repository root.

| Command             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | Start the API and web app with reload                 |
| `pnpm build`        | Build all packages                                    |
| `pnpm lint`         | Run ESLint                                            |
| `pnpm typecheck`    | Type-check all packages                               |
| `pnpm test`         | Run API tests (requires PostgreSQL and Redis running) |
| `pnpm format`       | Format with Prettier                                  |
| `pnpm format:check` | Check formatting                                      |

## Health endpoint

`GET /health` returns `200` when PostgreSQL and Redis are reachable and `503` otherwise:

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up" } }
```

The same handler is mounted at `/api/v1/health` so it can be reached through the web proxy.
