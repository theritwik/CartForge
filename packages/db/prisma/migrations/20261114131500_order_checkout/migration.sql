-- AlterEnum
ALTER TYPE "order_status" ADD VALUE 'PROCESSING';
ALTER TYPE "order_status" ADD VALUE 'EXPIRED';

-- AlterTable
-- The orders table is empty when this runs: no order could be created before checkout existed.
ALTER TABLE "orders" ADD COLUMN "idempotency_key" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_idempotency_key_key" ON "orders"("user_id", "idempotency_key");
