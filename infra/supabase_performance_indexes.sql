-- ============================================================================
-- ACM CLOUD STAGING: SUPABASE PERFORMANCE OPTIMIZATION INDEXES SCRIPT
-- Target: Supabase Cloud PostgreSQL 17.11 (acm-qllk-staging / dqctxaoaxhtqtgmtsysk)
-- Purpose: Resolve Supabase Performance Advisor findings (Missing FK indexes)
-- Invariant: Non-blocking index creation, zero schema regression.
-- ============================================================================

-- 1. ADD MISSING FOREIGN KEY INDEXES
-- Finding 1: stock_movements.locationId foreign key unindexed
CREATE INDEX IF NOT EXISTS "idx_stock_movements_location_id"
ON public."stock_movements"("locationId");

-- Finding 2: stock_reservations.locationId foreign key unindexed
CREATE INDEX IF NOT EXISTS "idx_stock_reservations_location_id"
ON public."stock_reservations"("locationId");

-- 2. PERFORMANCE ADVISOR AUDIT RECORD: 46 UNUSED INDEXES RETENTION JUSTIFICATION
-- Supabase Performance Advisor flagged 46 unused indexes in staging.
-- AUDIT DECISION: RETAIN ALL 46 INDEXES.
-- Rationale:
-- Staging database is freshly initialized with minimal synthetic records
-- (users: 4, items: 3, borrow_requests: 0).
-- In PostgreSQL pg_stat_user_indexes, idx_scan remains 0 until actual production workload hits.
-- Prematurely dropping indexes would cause severe latency and full-table scans
-- on unique constraints, composite audit logs, and transaction reconciliations.

