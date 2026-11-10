-- ============================================================================
-- ACM D8: STAGE4C FORWARD IDEMPOTENT DDL (MIGRATION CANDIDATE)
-- Target: PostgreSQL 17 / Supabase Cloud
-- Tables:
--   1. borrow_return_operations (Stateful Two-Phase Return Document & DB Snapshot)
--   2. system_evidence_registry (System-wide Case-Insensitive Unique Evidence Registry)
--   3. borrow_return_source_allocations (Structured Source Warehouse Relief Ledger)
-- Safety: 100% IDEMPOTENT — Safely re-runnable without throwing relation/constraint errors.
-- ============================================================================

-- 1. TABLE: borrow_return_operations
CREATE TABLE IF NOT EXISTS borrow_return_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_request_id UUID NOT NULL REFERENCES borrow_requests(id),
  return_transaction_id UUID,
  state VARCHAR(32) NOT NULL DEFAULT 'PREPARED',
  physical_evidence_ref VARCHAR(128) NOT NULL,
  received_by_id UUID NOT NULL REFERENCES users(id),
  verified_by_id UUID REFERENCES users(id),
  received_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMPTZ(3),
  payload_hash VARCHAR(64),
  payload_snapshot JSONB,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent check constraints for borrow_return_operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_physical_evidence_ref_format'
  ) THEN
    ALTER TABLE borrow_return_operations
    ADD CONSTRAINT chk_physical_evidence_ref_format
    CHECK (physical_evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_verified_at_after_received_at'
  ) THEN
    ALTER TABLE borrow_return_operations
    ADD CONSTRAINT chk_verified_at_after_received_at
    CHECK (verified_at IS NULL OR verified_at >= received_at);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_return_op_evidence_lower
ON borrow_return_operations (lower(physical_evidence_ref));

CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_return_op_single_pending
ON borrow_return_operations (borrow_request_id)
WHERE state IN ('PREPARED', 'RECONCILIATION_REQUIRED');

-- 2. TABLE: system_evidence_registry (P1.5)
-- Ensures universal cross-system reference uniqueness across Stage4C, RC5, and StockTransaction
CREATE TABLE IF NOT EXISTS system_evidence_registry (
  normalized_ref VARCHAR(128) PRIMARY KEY,
  original_ref VARCHAR(128) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_evidence_registry_source
ON system_evidence_registry (source_type, source_id);

-- 3. TABLE: borrow_return_source_allocations (P1.3 Structured Relief Ledger)
-- Displaces free-text notes; explicitly attributes inventory relief per (borrow_request_id, borrow_detail_id, source_location_id)
CREATE TABLE IF NOT EXISTS borrow_return_source_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_request_id UUID NOT NULL REFERENCES borrow_requests(id),
  borrow_detail_id UUID NOT NULL REFERENCES borrow_details(id),
  return_transaction_id UUID NOT NULL REFERENCES return_transactions(id),
  item_id UUID NOT NULL REFERENCES items(id),
  source_location_id UUID NOT NULL REFERENCES locations(id),
  destination_location_id UUID NOT NULL REFERENCES locations(id),
  quantity INT NOT NULL,
  condition VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_br_source_alloc_qty_positive'
  ) THEN
    ALTER TABLE borrow_return_source_allocations
    ADD CONSTRAINT chk_br_source_alloc_qty_positive
    CHECK (quantity > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_br_source_alloc_lookup
ON borrow_return_source_allocations (borrow_request_id, borrow_detail_id, source_location_id);
