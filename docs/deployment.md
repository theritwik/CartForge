# CartForge Deployment

CartForge has not been deployed. This page describes what a deployment needs and what has been verified locally, and compares hosting options to choose from before anything is deployed.

## What has been verified

On 2026-11-20, on one machine, with Docker 29 and BuildKit:

- **Images:** `apps/api/Dockerfile` (targets `runtime` and `migrate`) and `apps/web/Dockerfile` build from the repository root.
- **Production mode:** with `NODE_ENV=production`, the API refuses to start without Stripe test-mode keys, and the web app is a production build served by `next start`.
- **Full stack:** `docker compose --profile full up` ran the migration job, then the API, then the web app, and all three reported healthy. The catalog was served through the web container's `/api` proxy to the API container, which publishes no host port.
- **Session cookie:** registering through the production containers set `__Host-cartforge_session` as `Secure`, `HttpOnly` and `SameSite=Lax`. The web app sent HSTS, a framing policy and `nosniff`.
- **Health checks:** `/health/live` and `/` answered the image healthchecks.

Not verified:

- A real hosting provider, TLS termination, or a managed database.
- Real Stripe test mode (see [stripe-test-mode.md](stripe-test-mode.md)). The container check used a placeholder key, so no payment was taken.

## Components

| Component                   | Runs as                                     | Public?                                                                                     |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Web app (Next.js)           | `apps/web/Dockerfile`, `next start` on 3000 | Yes, behind TLS. The only origin browsers use                                               |
| API (Express)               | `apps/api/Dockerfile` target `runtime`      | No. Reached by the web app's `/api` proxy and its server-side calls, and by Stripe webhooks |
| Migrations                  | `apps/api/Dockerfile` target `migrate`      | One-off job before each API rollout                                                         |
| PostgreSQL 17               | Managed service or container                | No                                                                                          |
| Redis for rate limits       | Managed service or container                | No                                                                                          |
| Redis for the catalog cache | Separate instance                           | No                                                                                          |

Stripe must reach `POST /api/v1/payments/webhook`. Expose it either through the web app's public origin, since the `/api` proxy forwards it unchanged, or on a separate public route to the API. The request is authenticated by its signature, not by network position.

### How the web app reaches the API

- **From the browser:** all requests go to the web origin (`https://shop.example.com/api/...`), and Next.js forwards them to `API_URL`. The API sees a same-origin request with the browser's `Origin` and cookie, so no CORS configuration is needed.
- **From server-rendered pages:** Next.js calls `API_URL` directly, forwarding only the session cookie.
- **Build time:** the `/api` rewrite is compiled into the web build, so `API_URL` must be passed when building the web image (`--build-arg API_URL=...`) as well as set when running it. A web image is therefore built for one API address.

## Environment variables

### API

| Variable                                                     | Production value                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                   | `production` (set in the image). Enables the `Secure` `__Host-` cookie and disables the simulator                                                                                                                                                                                                                                   |
| `API_PORT`                                                   | Port to listen on, default 4000                                                                                                                                                                                                                                                                                                     |
| `LOG_LEVEL`                                                  | `info`. Logs are JSON on stdout; cookies, `Authorization` and `Set-Cookie` are redacted                                                                                                                                                                                                                                             |
| `WEB_ORIGIN`                                                 | The public web origin, `https://...`. The API refuses other `http` origins in production. State-changing requests must carry this `Origin`                                                                                                                                                                                          |
| `TRUST_PROXY_HOPS`                                           | The number of proxies in front of the web app that add the client address to `X-Forwarded-For`, typically **1** (the load balancer). Next.js's proxy does not add one. 0 makes every request look like the web server, so per-address limits are shared by everyone. A value that is too high lets clients choose their own address |
| `DATABASE_URL`                                               | PostgreSQL connection string, with TLS if the provider requires it (for example `?sslmode=require`)                                                                                                                                                                                                                                 |
| `REDIS_URL`                                                  | The rate-limit Redis (`rediss://` for TLS)                                                                                                                                                                                                                                                                                          |
| `CACHE_REDIS_URL`                                            | A **different** Redis instance for the catalog cache. The API refuses the same URL as `REDIS_URL`                                                                                                                                                                                                                                   |
| `STRIPE_SECRET_KEY`                                          | Required in production. Only `sk_test_...` is accepted; live keys are refused                                                                                                                                                                                                                                                       |
| `STRIPE_WEBHOOK_SECRET`                                      | Required with a key: the signing secret of the webhook endpoint configured in the Stripe dashboard                                                                                                                                                                                                                                  |
| `API_WRITE_LIMIT_PER_MINUTE`                                 | Optional, default 120 state-changing requests per client address per minute                                                                                                                                                                                                                                                         |
| `SESSION_IDLE_TIMEOUT_DAYS`, `SESSION_ABSOLUTE_TIMEOUT_DAYS` | Optional, default 7 and 30                                                                                                                                                                                                                                                                                                          |

Every value is validated with Zod at startup. A missing or invalid value stops the process with a message naming the variable, so a bad deployment fails its health check instead of running half-configured.

### Web app

| Variable   | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `API_URL`  | The API's base URL on the private network, for example `http://api:4000`. Build argument and runtime variable |
| `PORT`     | Default 3000                                                                                                  |
| `NODE_ENV` | `production` (set in the image). Adds `Strict-Transport-Security`                                             |

## Health checks

| Path                   | Meaning                                                                                                                                                                             | Use for                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| API `GET /health/live` | The process is serving. Checks nothing else                                                                                                                                         | Liveness: restart if it fails                           |
| API `GET /health`      | `200` when PostgreSQL and the rate-limit Redis answer within 2 seconds, otherwise `503`. The cache is reported but does not affect the status, because the catalog works without it | Readiness: remove from the load balancer while it fails |
| Web `GET /`            | The home page renders                                                                                                                                                               | Liveness and readiness of the web app                   |

Both images define a Docker `HEALTHCHECK` on the first and last of these.

## Running several API instances

- **Sessions** are stored in PostgreSQL, so any instance can serve any request. No sticky sessions are needed.
- **Rate-limit counters and the catalog cache** are in Redis and shared by all instances. Cache invalidation increments a shared generation number, so it applies to every instance at once.
- **Background jobs:**
  - The jobs are order expiry, refund retries and the session sweep.
  - Each instance runs them, and the jobs are correct when several runs overlap: conditional updates, and Stripe idempotency keys for refunds.
  - The scheduler claims each run in Redis, so normally one instance does the work, and a run never overlaps its predecessor in the same process.

## Database migrations

Migrations are SQL files in `packages/db/prisma/migrations`, applied in order by `prisma migrate deploy`. CHECK constraints and triggers are written by hand in those files.

**Procedure for each release:**

1. Take, or confirm, a recent backup.
2. Run the migration job with the release's image: the `migrate` target, or `pnpm --filter @cartforge/db migrate:deploy` with `DATABASE_URL` set. It applies only migrations not yet recorded in `_prisma_migrations`, and does nothing if there are none.
3. Roll out the API, then the web app.
4. Check `/health` and the error logs.

**Rules:**

- Never run `prisma migrate dev`, `migrate reset` or `db push` against production. They can drop data.
- **Forward only.** A migration is never edited after it has been applied anywhere. Fix mistakes with a new migration.
- **Expand, then contract.** A migration must work with both the previous and the new API version, because instances of both run during a rollout. Add columns as nullable or with defaults; stop using a column in one release, and drop it in a later one.
- **Rollback:**
  - Revert the code by deploying the previous image. That is safe when the migration only expanded the schema.
  - Prisma does not generate down migrations. Undoing a schema change means writing a new forward migration.
  - Data lost to a destructive migration can only come back from a backup, which is why destructive changes come last and in their own release.

The CI workflow applies every migration to a fresh database and fails if `schema.prisma` has changes that no migration contains.

## Backup and recovery

**PostgreSQL** is the only store that must survive. It holds accounts, sessions, carts, orders, payments, stock, and the stock adjustment history.

- **Backups:**
  - With a managed service, enable automated daily backups with point-in-time recovery, and retain them for at least 7 days.
  - Self-hosted, run `pg_dump --format=custom` at least daily to storage outside the database host, plus WAL archiving if point-in-time recovery is needed.
- **Test restores:** restore into a separate database regularly and run `prisma migrate status` against it. A backup that has never been restored is not known to work.
- **After a restore:**
  - Orders and payments may be older than Stripe's records. Compare payments in Stripe's dashboard for the gap.
  - Unpaid orders expire and release their stock automatically.
  - Stripe retries webhooks it could not deliver (for up to three days in live mode), and recorded event ids make redelivery safe.

**Redis** holds nothing that must be recovered:

- The rate-limit instance holds counters with 1-minute to 1-hour windows. Losing them resets the limits early, which is acceptable.
  - Run it with the default `noeviction` policy and no eviction, so counters are never removed under memory pressure.
  - Give it enough memory: keys are bounded by client addresses and accounts active within an hour. If it runs out of memory, writes fail and the limiter allows requests and logs errors, so alert on those logs.
  - Persistence is optional.
- The cache instance is disposable. It runs with `--maxmemory 256mb --maxmemory-policy volatile-ttl` and no persistence (see `docker-compose.yml`). After a restart it starts empty and the catalog is served from PostgreSQL until it refills.

## Secure production settings

| Setting                                                                                               | Where                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| HTTPS everywhere; HSTS sent by the web app                                                            | Load balancer or platform; `apps/web/src/lib/security-headers.ts`                                    |
| `__Host-` session cookie, `Secure`, `HttpOnly`, `SameSite=Lax`, opaque token stored as a SHA-256 hash | API, automatic in production                                                                         |
| Origin check on every state-changing API request                                                      | `WEB_ORIGIN`                                                                                         |
| Correct client addresses for rate limits                                                              | `TRUST_PROXY_HOPS`, and no direct public route to the web app or API that bypasses the load balancer |
| API, databases and Redis on a private network                                                         | Platform networking                                                                                  |
| Secrets in the platform's secret store, not in images or the repository                               | `.dockerignore` excludes `.env*` from the build context                                              |
| Test-mode Stripe keys only                                                                            | Enforced at startup                                                                                  |
| Containers run as the unprivileged `node` user                                                        | Dockerfiles                                                                                          |

## Hosting options

Nothing has been deployed; choose before any external deployment. All three options run the same two images.

| Option                                                        | What it takes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Trade-offs                                                                                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. One virtual machine with Docker Compose** (any cloud VM) | Install Docker, copy the repository and a production `.env`, and run `docker compose --profile full up -d`. Put a reverse proxy with automatic TLS (for example Caddy) in front of port 8080 and set `WEB_ORIGIN` to the public HTTPS origin. Set `TRUST_PROXY_HOPS=1`: the reverse proxy adds the client address, and Next.js passes it on. Point Stripe's webhook at `https://<domain>/api/v1/payments/webhook`. Schedule `pg_dump` backups off the machine                                                                            | Cheapest and closest to what was verified locally. You run the OS, patches, TLS renewal and backups. A single machine is a single point of failure                             |
| **2. A container platform** with managed PostgreSQL and Redis | Two services from the two Dockerfiles (pass `API_URL` as a build argument for the web service), with the API on the platform's private network only. A migration job or release command using the `migrate` target. One managed PostgreSQL database and two Redis instances, the cache one configured with a memory limit and `volatile-ttl`. Expose the webhook through the web service or a public route to the API. Find out how many proxies add `X-Forwarded-For` before the web service, and set `TRUST_PROXY_HOPS` to that number | Managed TLS, backups, restarts and scaling. Costs more. Two Redis instances is a real cost on some platforms. Behaviour of the platform's proxies must be checked, not assumed |
| **3. Managed Kubernetes**                                     | Deployments for the web app and API with liveness `/health/live` and readiness `/health` probes. A Job for migrations before each rollout. Ingress with TLS for the web app only. Managed PostgreSQL and Redis. Secrets as Kubernetes Secrets                                                                                                                                                                                                                                                                                            | The most control over scaling and rollouts, and the most to operate. More than this application needs                                                                          |

Before choosing, decide:

- the domain;
- the budget;
- who handles backups and updates;
- whether a Stripe test-mode webhook endpoint will be created in the dashboard for the deployed URL.

## Continuous integration and delivery

**What CI does today (`.github/workflows/ci.yml`):**

- On every pull request and push to `main`: install; format, lint and type checks; validate the Prisma schema; apply all migrations to a fresh database and check for drift; seed; unit and integration tests; production build.
- Then, in a second job, the Playwright suite against production builds.

Not implemented: building and pushing images to a registry, and deploying. A delivery pipeline would add:

1. On a push to `main`, after CI passes, build both images tagged with the commit SHA and push them to a registry.
2. Run the migration job with the new `migrate` image.
3. Roll out the API, then the web app, waiting for readiness.
4. Smoke-check `/health` and the home page, and roll back to the previous tags if they fail.

## Deployment checklist

- [ ] Hosting option chosen; domain and TLS in place.
- [ ] PostgreSQL provisioned with automated backups; one restore tested.
- [ ] Two Redis instances provisioned: rate limits with `noeviction`; cache with a memory limit and `volatile-ttl`.
- [ ] API, databases and Redis reachable only on the private network.
- [ ] Secrets stored in the platform: `DATABASE_URL`, `REDIS_URL`, `CACHE_REDIS_URL`, `STRIPE_SECRET_KEY` (test mode), `STRIPE_WEBHOOK_SECRET`.
- [ ] `WEB_ORIGIN` set to the public HTTPS origin; `API_URL` set for the web build and runtime.
- [ ] `TRUST_PROXY_HOPS` set to the number of proxies that add `X-Forwarded-For`, and checked: the API's request logs show real client addresses.
- [ ] Stripe test-mode webhook endpoint created for `/api/v1/payments/webhook` with the four `checkout.session.*` events; its signing secret stored.
- [ ] Migration job run; `prisma migrate status` reports no pending migrations.
- [ ] Liveness and readiness checks configured.
- [ ] An administrator created with `pnpm admin:create` against the production database. It prompts for the password.
- [ ] The [Stripe test-mode checklist](stripe-test-mode.md) run against the deployment.
- [ ] Log retention and an alert on 5xx responses and "Rate limiter unavailable" errors.
