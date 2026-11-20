-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_adjustments_product_id_created_at_idx" ON "stock_adjustments"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_adjustments_admin_id_idx" ON "stock_adjustments"("admin_id");

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Written by hand: Prisma does not manage CHECK constraints or triggers.

ALTER TABLE "stock_adjustments"
  ADD CONSTRAINT "stock_adjustments_delta_check" CHECK ("delta" <> 0),
  ADD CONSTRAINT "stock_adjustments_stock_after_check" CHECK ("stock_after" >= 0),
  ADD CONSTRAINT "stock_adjustments_reason_length_check"
    CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 200);

-- An audit record is never changed after it is written.
CREATE FUNCTION "prevent_stock_adjustment_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_adjustments rows are immutable'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_adjustments_immutable"
  BEFORE UPDATE ON "stock_adjustments"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_stock_adjustment_update"();
