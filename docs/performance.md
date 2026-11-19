# CartForge Performance

This page records how the catalog and the admin dashboard were measured, what changed in Milestone 9, and what the measurements showed. Every figure comes from a run described below. The results are from one machine and are useful for comparing configurations with each other, not as a prediction of production capacity.

## Summary

- **Indexes gave the largest gain.** Trigram indexes for search and a price index for sorting the whole catalog made the slowest endpoints 4 to 7 times faster, with or without Redis.
- **Cache hits are faster again, by a smaller factor.** A cached list page answers in 2.1 to 2.6 ms, against 5 to 14 ms from PostgreSQL. Throughput under load rose to 1,895 to 2,138 requests per second for every list scenario, from 281 to 813 with indexes only.
- **Product detail barely benefits from the cache.** It is a unique-index lookup that was already fast, and the cache still reads price and stock from PostgreSQL. Its median went from 2.1 ms to 1.7 ms.
- **A cache miss costs slightly more than having no cache.** It costs 0.6 to 1.3 ms more at the median than the same build with the cache unreachable.
- **With the cache stopped, the catalog keeps answering from PostgreSQL** with no errors, at the indexes-only throughput.
- **The cache runs on its own Redis instance**, so evicting cache entries under memory pressure can never remove rate-limit counters.
- **The dashboard sales trend** went from 131 ms to 7.5 ms on 200,000 orders, after adding an index and a date bound to the query.

## Environment

| Item       | Value                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Machine    | 4 vCPUs, 15 GB RAM, Linux container. The load generator, the API, PostgreSQL, and Redis all ran on it, so they competed for the same CPUs. |
| Runtime    | Node.js 24.22, one API process built with `pnpm build` and run with `NODE_ENV=development`, `LOG_LEVEL=silent`                             |
| PostgreSQL | 17.12 in Docker, default configuration                                                                                                     |
| Redis      | 8.10 in Docker: the cache instance (port 6380) with database index 1 for benchmarks, and the rate-limit instance (port 6379) with index 1  |
| Tool       | autocannon 8 for load, a sequential `fetch` probe for exact percentiles                                                                    |

### Dataset

`apps/api/benchmarks/dataset.sql` builds a deterministic catalog (`setseed(0.42)`) in a separate database whose name must end in `_bench`. The script refuses to run against any other database, and development and test data are never touched.

- 25 categories and 50,000 products: 90% `ACTIVE`, 5% `DRAFT`, 5% `ARCHIVED`.
- Names are drawn from word lists (for example "Brass Steel Kettle 1234"), and descriptions use the same vocabulary.
- Prices run from ₹99 to ₹9,998, stock from 0 to 199, and creation dates are spread over two years.
- Each product has one image row.

For the dashboard, 200,000 orders were inserted inside a transaction that was rolled back after `EXPLAIN ANALYZE`, so the benchmark catalog stayed unchanged. The script is described in [Admin dashboard](#admin-dashboard).

### Scenarios

Defined in `apps/api/benchmarks/scenarios.mjs`:

| Scenario             | Request                                               |
| -------------------- | ----------------------------------------------------- |
| default page         | `/api/v1/products`                                    |
| category, price sort | `/api/v1/products?category=category-7&sort=price_asc` |
| deep page            | `/api/v1/products?page=300`                           |
| price sort, all      | `/api/v1/products?sort=price_desc`                    |
| search, two terms    | `/api/v1/products?q=steel%20kettle`                   |
| search, price filter | `/api/v1/products?q=brass&maxPricePaise=500000`       |
| product detail       | `/api/v1/products/product-12345`                      |
| categories           | `/api/v1/categories`                                  |

### Method

- **Load test** (`run-catalog-benchmark.mjs`): for each scenario, check that the URL answers 200, warm up for 3 seconds, then measure for 10 seconds with 10 concurrent connections. It records requests per second, latency percentiles, errors and timeouts, and non-2xx responses. autocannon reports p97.5 rather than p95.
- **Sequential probe** (`latency-probe.mjs`): 200 requests one after another per scenario, giving exact p50, p95, and p99 without queueing. With `--miss` the probe increments the cache generation in Redis before every request, outside the timed section, so every request is a cache miss.
- Every configuration ran against the same database, the same build process, and the same parameters. Error and non-2xx counts were zero in every run reported here.

### Configurations

Five configurations were measured. They differ only in the code, the indexes, and the state of the cache:

| Label        | What it measures                                     | Code             | M9 indexes | Catalog cache                               |
| ------------ | ---------------------------------------------------- | ---------------- | ---------- | ------------------------------------------- |
| Baseline     | The catalog before Milestone 9                       | `main` before M9 | no         | none                                        |
| Indexes only | The effect of the new indexes alone                  | `main` before M9 | yes        | none                                        |
| Cache hit    | Requests answered from a warm cache                  | M9               | yes        | warm                                        |
| Cache miss   | The cost of a miss: query, then store the entry      | M9               | yes        | every request misses (`--miss`)             |
| Cache down   | Fallback to PostgreSQL when the cache is unreachable | M9               | yes        | cache instance stopped; rate-limit Redis up |

- **Baseline:** the new indexes were dropped from the benchmark database. They were recreated afterwards with the migration's own SQL, and the schema was checked for drift.
- **Cache columns:** the hit, miss, and down figures below come from the shipped configuration, with the cache on its own Redis instance (`CACHE_REDIS_URL=redis://localhost:6380/1`). An earlier run with the cache on a database index of the shared instance gave results within run-to-run variation of these. In that run, stopping the only Redis instance also produced zero errors.

## Results

### Load test: requests per second (10 connections)

| Scenario             | Baseline | Indexes only | Cache hit | Cache down |
| -------------------- | -------: | -----------: | --------: | ---------: |
| default page         |      376 |          532 |     1,962 |        559 |
| category, price sort |      599 |          801 |     1,977 |        813 |
| deep page            |      423 |          434 |     1,979 |        421 |
| price sort, all      |      148 |          560 |     2,138 |        567 |
| search, two terms    |       38 |          282 |     1,895 |        281 |
| search, price filter |       76 |          408 |     1,986 |        388 |
| product detail       |    1,647 |        1,820 |     2,551 |      1,698 |
| categories           |      875 |          834 |     5,714 |        862 |

A miss-only load test is not included: under load, the first request for each key fills the cache, so every later request is a hit. Miss cost is measured with the sequential probe below.

### Load test: latency p50 / p97.5 / p99 in ms (10 connections)

| Scenario             | Baseline        | Indexes only | Cache hit  | Cache down   |
| -------------------- | --------------- | ------------ | ---------- | ------------ |
| default page         | 23 / 53 / 62    | 18 / 32 / 36 | 4 / 9 / 12 | 17 / 28 / 32 |
| category, price sort | 16 / 27 / 31    | 11 / 20 / 23 | 4 / 9 / 10 | 11 / 18 / 21 |
| deep page            | 22 / 38 / 42    | 22 / 38 / 42 | 4 / 8 / 10 | 23 / 37 / 41 |
| price sort, all      | 65 / 117 / 127  | 17 / 31 / 35 | 4 / 7 / 9  | 17 / 29 / 34 |
| search, two terms    | 283 / 363 / 400 | 34 / 58 / 66 | 5 / 8 / 10 | 35 / 57 / 63 |
| search, price filter | 136 / 207 / 223 | 23 / 39 / 44 | 4 / 8 / 10 | 25 / 42 / 47 |
| product detail       | 5 / 10 / 12     | 5 / 10 / 11  | 3 / 6 / 8  | 5 / 10 / 11  |
| categories           | 10 / 21 / 25    | 11 / 23 / 26 | 1 / 2 / 5  | 11 / 22 / 24 |

### Sequential probe: p50 / p95 / p99 in ms (one request at a time)

| Scenario             | Baseline                 | Indexes only          | Cache hit          | Cache miss            | Cache down            |
| -------------------- | ------------------------ | --------------------- | ------------------ | --------------------- | --------------------- |
| default page         | 7.02 / 8.99 / 11.74      | 7.31 / 10.33 / 12.81  | 2.63 / 3.32 / 4.40 | 8.74 / 10.94 / 16.12  | 7.54 / 9.32 / 11.12   |
| category, price sort | 6.20 / 7.62 / 8.31       | 5.25 / 6.32 / 8.32    | 2.61 / 3.01 / 4.16 | 6.05 / 7.26 / 7.60    | 5.17 / 6.00 / 7.69    |
| deep page            | 9.18 / 12.75 / 17.36     | 9.20 / 12.42 / 13.49  | 2.55 / 3.03 / 3.41 | 11.16 / 14.82 / 21.01 | 9.88 / 13.09 / 13.45  |
| price sort, all      | 26.55 / 39.67 / 45.58    | 6.73 / 8.62 / 12.17   | 2.08 / 2.68 / 4.43 | 7.96 / 10.34 / 13.21  | 7.29 / 9.29 / 11.33   |
| search, two terms    | 104.71 / 127.23 / 157.01 | 13.97 / 20.19 / 21.45 | 2.17 / 2.76 / 3.58 | 15.24 / 20.84 / 22.51 | 14.18 / 19.74 / 20.60 |
| search, price filter | 54.16 / 78.01 / 81.94    | 9.77 / 13.07 / 13.46  | 2.06 / 2.78 / 3.82 | 11.43 / 15.14 / 18.66 | 10.40 / 14.06 / 15.04 |
| product detail       | 2.42 / 3.19 / 4.55       | 2.08 / 2.70 / 3.95    | 1.70 / 2.26 / 2.45 | 2.89 / 3.63 / 4.60    | 2.33 / 2.77 / 3.09    |
| categories           | 5.09 / 7.18 / 9.07       | 4.92 / 6.43 / 7.18    | 0.61 / 0.98 / 1.22 | 5.88 / 8.05 / 9.27    | 4.89 / 5.61 / 6.91    |

Compared with cache down, a cache miss adds 0.6 to 1.3 ms at the median: one generation read, one entry read, and one write.

### Hit and miss rates

The rates were measured over a 5-second load run of all eight scenarios, starting from an empty cache. Cache-instance counters were reset first, then read from `INFO stats`.

- 340,068 keyspace hits and 8 misses.
- Each request reads the generation key, which always hits, and then its entry. That gives 170,038 requests and 8 entry misses, one per distinct key, so the entry hit rate was 99.995%.

This is a best case: eight URLs repeated thousands of times. Real traffic spreads over many search terms, filters, and pages. Its hit rate depends on how many distinct queries arrive within each two-minute list TTL, and was not measured.

### Database time

Statement durations from the PostgreSQL log during the baseline, and plans from `EXPLAIN ANALYZE` on the benchmark database:

| Query                                     | Before M9                             | After M9                                                                                    |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Search count, two terms                   | Sequential scan, 82 to 101 ms         | Trigram bitmap scan, 3.7 ms                                                                 |
| Search page, two terms (newest first)     | 7.6 ms                                | 11 ms (bitmap plan); the request as a whole is faster because the count no longer dominates |
| Search "brass" with price filter, count   | Sequential scan                       | 5.3 ms                                                                                      |
| Price sort across the catalog, first page | Sequential scan and top-N sort, 12 ms | Index-only scan, 0.07 ms                                                                    |
| Default page (newest first)               | 0.13 ms, `(status, created_at)` index | unchanged                                                                                   |
| Count of active products                  | Index-only scan, 5.5 ms               | unchanged                                                                                   |
| Category listing, price sort              | 2.2 ms                                | unchanged                                                                                   |
| Page 300 (offset 3,588)                   | 3.6 to 5.7 ms                         | unchanged                                                                                   |
| Categories with product counts            | 3.8 ms                                | unchanged in PostgreSQL; served from cache                                                  |

Category and image data for a page are fetched with one batched `IN` query each (0.02 ms and 0.19 ms), not one query per product, so there was no N+1 pattern to fix.

## Caching design

### What is cached

The cache holds what is expensive to compute and changes only when an administrator edits the catalog:

- **Product list**: the ids of the matching products in page order, the total count, and each product's name, slug, category, and primary image. TTL 120 seconds.
- **Product detail**: id, name, slug, description, category, and images. A slug that has no published product is cached as "not found", so repeated requests for a missing product do not reach the product query. TTL 300 seconds.
- **Categories**: the full response, including product counts. TTL 300 seconds.

It never holds `pricePaise`, `status`, `stockQuantity`, `reservedQuantity`, `availableQuantity`, or `inStock`. On a cache hit the service reads those columns for the page's products in one primary-key query and merges them in. A product that is no longer `ACTIVE` is dropped from the page, and the detail page answers 404. So the storefront can never show a stale price, a stale stock level, or a withdrawn product, whatever the cache holds.

Cached entries are validated with Zod when read. An entry that is not valid JSON or does not match the expected shape is discarded and reloaded from PostgreSQL. Unknown fields are stripped, so a price written into an entry by mistake would be ignored.

Private data is never cached. Cart, account, order, and admin responses do not use the cache. Catalog keys are built only from the validated query parameters, and the response is the same whether or not the visitor is signed in. Checkout prices and validates every line inside its own transaction and never reads the cache.

### Keys

```
cartforge:<NODE_ENV>:catalog:v1:g<generation>:<kind>:<digest>
```

- `<NODE_ENV>` separates development and test data that share a Redis server. Benchmarks use a separate database index.
- `v1` changes if the shape of cached entries changes, so a new release never reads an older format.
- `<generation>` is the value of `cartforge:<NODE_ENV>:catalog:generation`.
- `<kind>` is `products`, `product`, or `categories`.
- `<digest>` is the first 32 hex characters of a SHA-256 over the normalised parameters, so key length is bounded however long the search text is.

The list parameters are normalised after Zod validation, which has already applied defaults and trimmed the search text. Search text is lowercased, and only the first five terms are kept, separated by single spaces. Those are exactly the terms the query uses, so `?q=Steel  KETTLE` and `?q=steel kettle` share an entry while every filter, sort, page, and page size gets its own.

### Invalidation

Every catalog write increments the generation: creating or editing a product (including price, status, category, name, and description changes, archiving, and reactivation), and creating, renaming, or deleting a category. Keys include the generation, so one `INCR` makes every older entry unreachable on every API instance at once. The old entries are never read again and expire by TTL. No `SCAN` or `FLUSHDB` is needed, and there is no per-product key bookkeeping.

A single product edit therefore discards the whole catalog cache, which is coarser than strictly necessary. Catalog edits are rare compared with reads, and finer-grained invalidation would need a reverse index from each product to every list and search page that contains it. The cost of the coarse approach is one round of misses after each edit.

Stock adjustments, checkout reservations, payments, cancellations, and expiry do not touch the cache, because stock is always read live.

### Consistency model

| Field                                       | Freshness                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Price, status, stock, availability          | Always current: read from PostgreSQL on every request                                                                                       |
| Names, descriptions, images, categories     | Current after a write through the admin API; at most one TTL old otherwise                                                                  |
| Which products match a query, order, totals | Same as above. An archived product is removed live even if the entry is stale; a newly published product appears once the entry is replaced |

Changes made outside the admin API, such as `pnpm db:seed` or manual SQL, do not increment the generation. They appear on the storefront within the TTL: at most 2 minutes for lists and 5 minutes for detail and categories. Price and stock changes appear at once.

A read that runs while a write happens can load data from before the write and store it under the old generation. The write has already incremented the generation, so that entry is never read.

### When Redis fails

- **Cache unreachable.** The cache client is created with its offline queue disabled, so commands fail immediately instead of waiting. The catalog checks that the client is ready and otherwise reads straight from PostgreSQL. Any Redis error on read or write is caught, and the request is answered from the database. Cache failures are logged at most once every 30 seconds per operation, with only the error message, so an outage cannot flood the logs.
- **Measured.** With the cache container stopped, every scenario answered 200 with zero errors, at the indexes-only throughput (cache down column above). `/health` stays `200 ok` and reports `"cache": "down"`, because the API still works without the cache. After the cache restarted, the client reconnected on its own and the next request repopulated the cache.
- **Invalidation fails.** The admin write has already committed, so it succeeds and the failure is logged as an error. Prices, stock, and withdrawn products are still correct because they are read live. Names, descriptions, and list membership may stay stale until the entries expire.
- **Cache restart.** The cache instance is not persisted, so it restarts empty. The generation goes back to 0, but no older entries survive to be read under it.
- **Rate limiter.** It uses the other instance (`REDIS_URL`) and is unaffected by the cache. If that instance is down, the limiter allows requests and logs the failure, as before, and `/health` reports `503 degraded`.

### Bounded memory and rate-limit isolation

The cache lives on its own Redis instance (`CACHE_REDIS_URL`), and rate-limit counters stay on `REDIS_URL`:

- **The cache instance** (`redis-cache` in Compose) runs with `--maxmemory 256mb --maxmemory-policy volatile-ttl` and no persistence. Every entry has a TTL, so the number of keys is bounded by the request rate within the TTL. Distinct search queries can still create many keys, and when memory is full Redis evicts keys with a TTL, soonest-expiring first. The generation counter has no TTL and is never evicted.
- **The rate-limit instance** (`redis`) keeps the default `noeviction` policy and no memory limit, so a counter is never removed before its window ends.

Why a separate instance:

- Memory limits and eviction apply to a whole Redis instance, not to a database index. With one instance, filling the cache, for example with many distinct searches, could evict login and registration counters and reset them early.
- Setting `noeviction` on a shared instance instead would make the rate limiter's writes fail when memory is full. The limiter fails open, so that is no better.

Enforcement:

- The API refuses to start if `CACHE_REDIS_URL` equals `REDIS_URL`.
- A test checks that catalog keys are written only to the cache instance and rate-limit keys only to the other.
- CI runs both on database indexes of one Redis service. That is enough to test the separation, but it does not have the eviction setting.

With entries of a few kilobytes, the memory limit was not approached in any benchmark run.

### Known limitations

- **Cache stampede.** Concurrent misses for the same key each run the database query; there is no lock or request coalescing. After an invalidation, this means a burst of duplicate queries for the most popular pages. Locking or coalescing would add complexity for a load that the indexed queries handle.
- **A hit still needs PostgreSQL.** The live price and stock query (one primary-key lookup for up to 48 ids) keeps prices exact but means the cache reduces database work rather than removing it. This is why product detail gains little.
- **Misses are slightly slower than no cache.** Two Redis reads and a write per miss cost 0.6 to 1.3 ms at the median, compared with the same build with the cache unreachable.
- **A stalled cache connection is not timed out.** The client fails fast when disconnected, but a Redis server that accepts connections and stops answering would delay catalog requests. The rate-limit client has the same exposure. Neither has a command timeout.

## Indexes

Added in migration `20261119170000_catalog_search_indexes`:

| Index                                            | Purpose                                                      | Size on 50,000 products |
| ------------------------------------------------ | ------------------------------------------------------------ | ----------------------: |
| `products_name_idx` (GIN, `gin_trgm_ops`)        | `ILIKE '%term%'` on product names                            |                  3.4 MB |
| `products_description_idx` (GIN, `gin_trgm_ops`) | `ILIKE '%term%'` on descriptions                             |                  7.2 MB |
| `products_status_price_paise_id_idx`             | Price sorting across the catalog, read forwards or backwards |                  2.0 MB |

The products table itself is 12 MB. The trigram indexes need the `pg_trgm` extension. It is a trusted extension, so the database owner can create it without superuser rights, and the migration creates it.

To make every sort match an index, the descending price sort now uses `id DESC` as its tiebreaker (it was `id ASC`). Pages still do not overlap; only the order of products with the same price changed.

Added in migration `20261119180000_orders_created_at_index`: `orders_created_at_id_idx` on `(created_at, id)`, described in the next section.

Considered and not done:

- **Search terms shorter than three characters** cannot use a trigram index. A search for "ma" is still a sequential scan (80 ms on 50,000 products). Repeated searches for it are served from the cache; a full-text or prefix index would be needed to fix it properly.
- **Deep pages** use `OFFSET`, so page 300 reads and discards 3,588 rows (about 5 ms here). Keyset pagination would avoid that but would change the API and the page links. It is not needed at this catalog size.
- **Counting active products** uses an index-only scan in 5.5 ms on 45,000 rows. That count is cached with each page.

## Admin dashboard

The dashboard runs seven queries in parallel. The benchmark catalog has no orders, so 200,000 orders spread over two years were inserted inside a transaction, measured with `EXPLAIN ANALYZE`, and rolled back.

| Query                                   | Before                                                       | After                              |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| 14-day sales trend                      | Full scan of orders, sort spilled to disk (6.5 MB), 131.6 ms | Bitmap scan of 3,676 rows, 7.5 ms  |
| 5 most recent orders                    | Full scan and top-N sort, 25.0 ms                            | Backward index-only scan, 0.035 ms |
| Orders and revenue by status (all time) | Full scan, 22.8 ms                                           | unchanged                          |
| Low-stock products                      | Scan of active products, 7 to 12 ms on 50,000 products       | unchanged                          |

The trend query joined orders to the 14 days on a computed local date, which no index can serve. It now also requires `created_at` to be on or after midnight, India time, on the first day of the window. That is the same window expressed as a plain range, so the new index applies. A comparison query in the same transaction confirmed that the old and new versions return identical rows.

Totals by status cover all orders ever placed, so they read every order by design. At 22.8 ms on 200,000 orders they were left as they are. Keeping running totals would add write-path complexity for a page only administrators open.

## Reproducing

All commands run from the repository root, with the Compose services running.

1. Create the benchmark database and load the catalog. The prepare script refuses a database whose name does not end in `_bench`:

   ```bash
   BENCH_DATABASE_URL=postgresql://cartforge:<password>@localhost:5432/cartforge_bench pnpm --filter @cartforge/api bench:prepare
   ```

2. Build the API, then start it on a separate port against that database. Use database index 1 on both Redis instances, so benchmark keys stay apart from development data:

   ```bash
   pnpm --filter @cartforge/api build
   ```

   ```bash
   cd apps/api && DATABASE_URL=postgresql://cartforge:<password>@localhost:5432/cartforge_bench REDIS_URL=redis://localhost:6379/1 CACHE_REDIS_URL=redis://localhost:6380/1 API_PORT=4100 LOG_LEVEL=silent NODE_ENV=development node --env-file=../../.env dist/server.js
   ```

3. Run the load test and the probes in another terminal:

   ```bash
   pnpm --filter @cartforge/api bench:run --base http://localhost:4100 --label cached --out cached.json
   ```

   ```bash
   node apps/api/benchmarks/latency-probe.mjs --base http://localhost:4100 --samples 200
   ```

   ```bash
   node apps/api/benchmarks/latency-probe.mjs --base http://localhost:4100 --samples 200 --miss
   ```

   The probe's `--miss` mode increments the generation on `redis://localhost:6380/1` (change it with `--redis`).

4. For the cache-down run, stop the cache with `docker stop cartforge-redis-cache-1`, repeat step 3, then run `pnpm services:up`.

5. For the baseline, drop the three product indexes from the benchmark database (`DROP INDEX products_name_idx, products_description_idx, products_status_price_paise_id_idx;`) and run step 3 against a build of the previous `main`. Recreate the indexes and repeat for the indexes-only run. Recreate the indexes with the SQL in `packages/db/prisma/migrations/20261119170000_catalog_search_indexes/migration.sql`.

Results vary with the machine and with whatever else is running, so compare configurations within one session rather than with the numbers above.

### Cleaning up

The benchmark data is kept apart from development data and can be removed at any time. Stop the benchmark API first.

```bash
docker exec cartforge-postgres-1 psql -U cartforge -d postgres -c 'DROP DATABASE cartforge_bench'
```

```bash
docker exec cartforge-redis-cache-1 redis-cli -n 1 FLUSHDB
```

```bash
docker exec cartforge-redis-1 redis-cli -n 1 FLUSHDB
```

Only database index 1 is flushed on each instance, never the development data in index 0. Restarting the cache instance also empties it, because it is not persisted. Nothing from a benchmark run is written to the repository unless you pass `--out` with a path inside it.
