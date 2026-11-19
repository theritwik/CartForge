-- AlterEnum
ALTER TYPE "payment_status" ADD VALUE 'EXPIRED';
ALTER TYPE "payment_status" ADD VALUE 'REFUND_PENDING';

-- An order can now have several payment attempts.
-- DropIndex
DROP INDEX "payments_order_id_key";

-- AlterTable
-- The payments table is empty when this runs: nothing wrote to it before payments existed.
ALTER TABLE "payments"
  ADD COLUMN "checkout_expires_at" TIMESTAMPTZ(3) NOT NULL,
  ADD COLUMN "checkout_url" TEXT,
  ADD COLUMN "failure_reason" TEXT,
  ADD COLUMN "stripe_checkout_session_id" TEXT,
  ADD COLUMN "stripe_refund_id" TEXT,
  ALTER COLUMN "stripe_payment_intent_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "processed_stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key" ON "payments"("stripe_checkout_session_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- Written by hand: Prisma schema cannot express a partial index.
-- At most one payment attempt per order may be open at a time.
CREATE UNIQUE INDEX "payments_one_pending_per_order" ON "payments"("order_id") WHERE "status" = 'PENDING';
