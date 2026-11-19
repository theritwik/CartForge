-- Written by hand: Prisma does not manage extensions in this project.
-- pg_trgm is a trusted extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Price sorting across the whole catalog, read in index order instead of sorting every row.
-- CreateIndex
CREATE INDEX "products_status_price_paise_id_idx" ON "products"("status", "price_paise", "id");

-- Substring search (ILIKE '%term%') on names and descriptions. Terms shorter than three
-- characters cannot use a trigram index and still scan the table.
-- CreateIndex
CREATE INDEX "products_name_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_description_idx" ON "products" USING GIN ("description" gin_trgm_ops);
