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

ALTER TABLE borrow_return_operations
ADD CONSTRAINT chk_physical_evidence_ref_format
CHECK (physical_evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_return_op_evidence_lower
ON borrow_return_operations (lower(physical_evidence_ref));

ALTER TABLE borrow_return_operations
ADD CONSTRAINT chk_verified_at_after_received_at
CHECK (verified_at IS NULL OR verified_at >= received_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_return_op_single_pending
ON borrow_return_operations (borrow_request_id)
WHERE state IN ('PREPARED', 'RECONCILIATION_REQUIRED');

-- Registry chứng từ và bằng chứng toàn hệ thống (P1.5)
-- Bảo đảm tính duy nhất không phân biệt hoa thường (lower) xuyên suốt Stage4C, RC5 và StockTransaction
CREATE TABLE IF NOT EXISTS system_evidence_registry (
  normalized_ref VARCHAR(128) PRIMARY KEY,
  original_ref VARCHAR(128) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_evidence_registry_source
ON system_evidence_registry (source_type, source_id);

-- Sổ phân bổ giải trừ kho nguồn có cấu trúc (P1.3 / Reviewer Hardening)
-- Loại bỏ hoàn toàn sự phụ thuộc vào text notes; ràng buộc theo từng cặp (borrow_detail_id, source_location_id)
CREATE TABLE IF NOT EXISTS borrow_return_source_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_request_id UUID NOT NULL REFERENCES borrow_requests(id),
  borrow_detail_id UUID NOT NULL REFERENCES borrow_details(id),
  return_transaction_id UUID NOT NULL REFERENCES return_transactions(id),
  item_id UUID NOT NULL REFERENCES items(id),
  source_location_id UUID NOT NULL REFERENCES locations(id),
  destination_location_id UUID NOT NULL REFERENCES locations(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  condition VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_br_source_alloc_lookup
ON borrow_return_source_allocations (borrow_request_id, borrow_detail_id, source_location_id);
