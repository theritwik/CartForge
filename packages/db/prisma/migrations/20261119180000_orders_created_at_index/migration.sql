-- Recent orders across all customers, and the date-bounded dashboard sales trend.
CREATE INDEX "orders_created_at_id_idx" ON "orders"("created_at", "id");
