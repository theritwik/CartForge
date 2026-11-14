# CartForge

Full-stack e-commerce application built as a pnpm monorepo. See `docs/architecture.md` for design decisions, `docs/database.md` for the schema, and `docs/roadmap.md` for milestone scope and status.

## Stack

- Web: Next.js (App Router), React, TypeScript, Tailwind CSS
- API: Node.js, Express, TypeScript, Zod
- Data: PostgreSQL via Prisma, Redis
- Payments: Stripe (test mode)
- Testing: Vitest, Supertest, Playwright
- Tooling: pnpm workspaces, Docker, GitHub Actions

## Layout

- `apps/web` - Next.js storefront and admin UI
- `apps/api` - Express REST API, organised by feature under `src/modules/`
- `packages/db` - Prisma schema, migrations, seed, and the exported client
- `packages/shared` - created only when web and api genuinely share code
- `docs/` - architecture, database schema, and roadmap

API modules: `auth`, `users`, `products`, `cart`, `inventory`, `orders`, `payments`. Each module contains only the files it needs (routes, controller, service, schemas, tests).

## Commands

Run from the repository root. Node.js 24 (`.nvmrc`), pnpm 10.

- `pnpm services:up` / `pnpm services:down` - start or stop PostgreSQL and Redis
- `pnpm dev` - run the API (port 4000) and web app (port 3000)
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm build`
- `pnpm db:migrate` - create and apply a migration from schema changes (development database)
- `pnpm db:seed` - load the development catalog; safe to run repeatedly
- `pnpm --filter @cartforge/db build` - regenerate and rebuild the Prisma client after schema changes

Tests need the Compose services running. They use `TEST_DATABASE_URL` only and must never connect to the development database; use the helpers in `@cartforge/db/testing`. Configuration lives in `.env` (Compose, API, Prisma CLI, tests) and `apps/web/.env.local`.

## Workflow

Work proceeds one milestone at a time, as defined in `docs/roadmap.md`.

Before writing code:

1. Inspect the existing files that the change touches.
2. Review `README.md`, this file, and the relevant docs.
3. Explain the planned changes.
4. Check that they fit the existing architecture.

After writing code:

1. Run the relevant checks (typecheck, lint, tests) and fix failures.
2. Report what was completed and what was not.
3. Explain how to verify the functionality.
4. Suggest a commit message.

Do not start a later milestone until it is explicitly requested.

Do not push, deploy, delete important files, or run destructive operations (including destructive database commands) without explicit approval.

## Engineering standards

1. Strict TypeScript. No `any` without a written reason.
2. Apply SOLID where it improves maintainability, not as a ritual.
3. Controllers handle HTTP only. Business logic lives in services.
4. Descriptive names for variables and functions.
5. No unnecessary abstractions or interfaces. Add a layer only when a second concrete use exists.
6. No generic boilerplate. Every file has a reason to exist.
7. No empty folders or placeholder files for future features.
8. No duplicated code and no speculative helper utilities.
9. Errors are typed, handled centrally, and never swallowed.
10. All external input (request bodies, params, queries, env vars, webhooks) is validated with Zod.
11. Follow security best practices: Argon2id password hashing, httpOnly session cookies, CSRF protection on state-changing requests, least-privilege authorization checks, verified webhook signatures, rate limiting.
12. Real database interactions. No fake or in-memory APIs standing in for the database.
13. Tests cover behaviour that matters: business rules, authorization, and failure paths.
14. Minimal dependencies. Justify each new one.
15. No hardcoded credentials or secrets. Configuration comes from environment variables; `.env` files are not committed.
16. Small, focused commits with clear messages.
17. Preserve existing working functionality.
18. No microservices without a demonstrated need.
19. No excessive comments, emojis, or marketing language in code or docs.
20. Never describe unimplemented functionality as complete.

## Domain rules

- The currency is INR. Money is stored and computed as integer paise (minor currency units). Never floats.
- Authentication uses opaque, database-backed sessions in an httpOnly cookie. No JWTs. Only a hash of the session token is stored.
- Stock changes and order creation run inside database transactions.
- An order is marked paid only by a verified Stripe webhook, never by a client request.
- Order items snapshot the product name and unit price at purchase time and are never updated.
- CHECK constraints and triggers are hand-written in migration SQL. Prisma does not manage them; change them only through a new migration.
