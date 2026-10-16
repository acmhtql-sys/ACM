-- AlterTable
ALTER TABLE "stock_transaction_details" ADD COLUMN "to_location_id" UUID;

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transaction_id" UUID,
    "response_body" JSONB,
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_transaction_id_key" ON "idempotency_records"("transaction_id");

-- CreateIndex
CREATE INDEX "idempotency_records_user_id_endpoint_idx" ON "idempotency_records"("user_id", "endpoint");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- AddForeignKey
ALTER TABLE "stock_transaction_details" ADD CONSTRAINT "stock_transaction_details_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "stock_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "check_idempotency_status" CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED'));

-- AddCheckConstraint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "check_idempotency_expires_at" CHECK ("expires_at" > "created_at");
