-- ============================================================================
-- ACM CLOUD STAGING & PRODUCTION READINESS BUNDLE
-- Target: Supabase Cloud PostgreSQL 17.11 (acm-qllk-staging / dqctxaoaxhtqtgmtsysk)
-- Purpose: Complete single-run SQL bundle containing:
--   PHASE 1: Stage4C Two-Phase Return Document & Ledger Tables
--   PHASE 2: Performance Foreign Key Optimization Indexes
--   PHASE 3: Granular Zero-Trust RBAC Row Level Security (RLS) Policies (SEC-01 & SEC-02 Hardened)
-- Invariant: 100% IDEMPOTENT — Safely runnable and re-runnable without errors.
-- ============================================================================

-- ============================================================================
-- PART 1: STAGE4C RETURN WORKFLOW & LEDGER TABLES
-- ============================================================================

-- 1.1 TABLE: borrow_return_operations
CREATE TABLE IF NOT EXISTS public.borrow_return_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_request_id UUID NOT NULL REFERENCES public.borrow_requests(id),
  return_transaction_id UUID,
  state VARCHAR(32) NOT NULL DEFAULT 'PREPARED',
  physical_evidence_ref VARCHAR(128) NOT NULL,
  received_by_id UUID NOT NULL REFERENCES public.users(id),
  verified_by_id UUID REFERENCES public.users(id),
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
    ALTER TABLE public.borrow_return_operations
    ADD CONSTRAINT chk_physical_evidence_ref_format
    CHECK (physical_evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_verified_at_after_received_at'
  ) THEN
    ALTER TABLE public.borrow_return_operations
    ADD CONSTRAINT chk_verified_at_after_received_at
    CHECK (verified_at IS NULL OR verified_at >= received_at);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_return_op_evidence_lower
ON public.borrow_return_operations (lower(physical_evidence_ref));

CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_return_op_single_pending
ON public.borrow_return_operations (borrow_request_id)
WHERE state IN ('PREPARED', 'RECONCILIATION_REQUIRED');

-- 1.2 TABLE: system_evidence_registry
CREATE TABLE IF NOT EXISTS public.system_evidence_registry (
  normalized_ref VARCHAR(128) PRIMARY KEY,
  original_ref VARCHAR(128) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_id UUID NOT NULL,
  registered_by UUID NOT NULL REFERENCES public.users(id),
  registered_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidence_source_type_id
ON public.system_evidence_registry (source_type, source_id);

-- 1.3 TABLE: borrow_return_source_allocations (P1.3 Structured Relief Ledger)
CREATE TABLE IF NOT EXISTS public.borrow_return_source_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_request_id UUID NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
  borrow_detail_id UUID NOT NULL REFERENCES public.borrow_details(id) ON DELETE CASCADE,
  return_transaction_id UUID NOT NULL REFERENCES public.return_transactions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  source_location_id UUID NOT NULL REFERENCES public.locations(id),
  destination_location_id UUID NOT NULL REFERENCES public.locations(id),
  quantity INTEGER NOT NULL,
  condition VARCHAR(32) NOT NULL DEFAULT 'GOOD',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_br_source_alloc_qty_positive'
  ) THEN
    ALTER TABLE public.borrow_return_source_allocations
    ADD CONSTRAINT chk_br_source_alloc_qty_positive
    CHECK (quantity > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_br_source_alloc_lookup
ON public.borrow_return_source_allocations (borrow_request_id, borrow_detail_id, source_location_id);

-- 1.4 SEED ESSENTIAL SYSTEM ROLES (IF NOT EXISTS)
INSERT INTO public.roles ("id", "name", "description", "createdAt", "updatedAt")
VALUES 
  (gen_random_uuid(), 'ADMIN', 'Quản trị viên toàn hệ thống', NOW(), NOW()),
  (gen_random_uuid(), 'LAB_MANAGER', 'Quản lý phòng Lab / Thủ kho', NOW(), NOW()),
  (gen_random_uuid(), 'TECHNICIAN', 'Kỹ thuật viên / Trợ giảng hỗ trợ', NOW(), NOW()),
  (gen_random_uuid(), 'STUDENT', 'Sinh viên / Người mượn linh kiện', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- ============================================================================
-- PART 2: PERFORMANCE FOREIGN KEY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_stock_movements_location_id"
ON public."stock_movements"("locationId");

CREATE INDEX IF NOT EXISTS "idx_stock_reservations_location_id"
ON public."stock_reservations"("locationId");

-- ============================================================================
-- PART 3: GRANULAR RBAC ROW LEVEL SECURITY (RLS) POLICIES (SEC-01 & SEC-02)
-- ============================================================================

-- 3.0 ENSURE AUTH SCHEMA & POSTGREST ROLES COMPATIBILITY (Safe for local PostgreSQL and Supabase Cloud)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
END $$;

-- 3.1 SEC-01 FIX: HELPER FUNCTION TO RESOLVE ROLE SAFELY
CREATE OR REPLACE FUNCTION public.acm_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT r.name::text 
     FROM public.users u 
     JOIN public.roles r ON u."roleId" = r.id 
     WHERE u.id = auth.uid()),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', ''),
    'ANONYMOUS'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.acm_current_user_role() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.acm_current_user_role() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.acm_current_user_role() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.acm_current_user_role() TO service_role;
  END IF;
END $$;

-- 3.2 ENABLE RLS ON ALL PUBLIC TABLES
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'roles', 'users', 'categories', 'items', 'locations', 'assets',
        'stock_balances', 'stock_movements', 'stock_reservations',
        'stock_transactions', 'stock_transaction_details',
        'borrow_requests', 'borrow_details', 'return_transactions', 'return_details',
        'audit_logs', 'idempotency_records', 'kits', 'kit_items', '_prisma_migrations',
        'borrow_return_operations', 'system_evidence_registry', 'borrow_return_source_allocations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        END IF;
    END LOOP;
END $$;

-- 3.3 LAYER 1: UNRESTRICTED ACCESS FOR BACKEND RUNTIME (postgres, service_role)
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'roles', 'users', 'categories', 'items', 'locations', 'assets',
        'stock_balances', 'stock_movements', 'stock_reservations',
        'stock_transactions', 'stock_transaction_details',
        'borrow_requests', 'borrow_details', 'return_transactions', 'return_details',
        'audit_logs', 'idempotency_records', 'kits', 'kit_items', '_prisma_migrations',
        'borrow_return_operations', 'system_evidence_registry', 'borrow_return_source_allocations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS "service_role_full_access" ON public.%I;', tbl);
            EXECUTE format('CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);', tbl);
        END IF;
    END LOOP;
END $$;

-- 3.4 LAYER 2: GRANULAR RBAC POLICIES FOR AUTHENTICATED USERS

-- Roles
DROP POLICY IF EXISTS "roles_read_authenticated" ON public.roles;
CREATE POLICY "roles_read_authenticated" ON public.roles
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles_write_admin_only" ON public.roles;
CREATE POLICY "roles_write_admin_only" ON public.roles
FOR ALL TO authenticated
USING (public.acm_current_user_role() = 'ADMIN')
WITH CHECK (public.acm_current_user_role() = 'ADMIN');

-- Users
DROP POLICY IF EXISTS "users_read_self_or_admin" ON public.users;
CREATE POLICY "users_read_self_or_admin" ON public.users
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
CREATE POLICY "users_update_self_or_admin" ON public.users
FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.acm_current_user_role() = 'ADMIN')
WITH CHECK (id = auth.uid() OR public.acm_current_user_role() = 'ADMIN');

-- Categories
DROP POLICY IF EXISTS "categories_read_authenticated" ON public.categories;
CREATE POLICY "categories_read_authenticated" ON public.categories
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "categories_write_staff" ON public.categories;
CREATE POLICY "categories_write_staff" ON public.categories
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

-- Items
DROP POLICY IF EXISTS "items_read_authenticated" ON public.items;
CREATE POLICY "items_read_authenticated" ON public.items
FOR SELECT TO authenticated
USING ("isActive" = true OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "items_write_staff" ON public.items;
CREATE POLICY "items_write_staff" ON public.items
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Locations
DROP POLICY IF EXISTS "locations_read_authenticated" ON public.locations;
CREATE POLICY "locations_read_authenticated" ON public.locations
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "locations_write_staff" ON public.locations;
CREATE POLICY "locations_write_staff" ON public.locations
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

-- Assets
DROP POLICY IF EXISTS "assets_read_authenticated" ON public.assets;
CREATE POLICY "assets_read_authenticated" ON public.assets
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "assets_write_staff" ON public.assets;
CREATE POLICY "assets_write_staff" ON public.assets
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Kits & Kit Items
DROP POLICY IF EXISTS "kits_read_authenticated" ON public.kits;
CREATE POLICY "kits_read_authenticated" ON public.kits
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kits_write_staff" ON public.kits;
CREATE POLICY "kits_write_staff" ON public.kits
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "kit_items_read_authenticated" ON public.kit_items;
CREATE POLICY "kit_items_read_authenticated" ON public.kit_items
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kit_items_write_staff" ON public.kit_items;
CREATE POLICY "kit_items_write_staff" ON public.kit_items
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Borrow Requests & Details
DROP POLICY IF EXISTS "borrow_requests_select" ON public.borrow_requests;
CREATE POLICY "borrow_requests_select" ON public.borrow_requests
FOR SELECT TO authenticated
USING ("borrowerId" = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "borrow_requests_insert_student" ON public.borrow_requests;
CREATE POLICY "borrow_requests_insert_student" ON public.borrow_requests
FOR INSERT TO authenticated
WITH CHECK ("borrowerId" = auth.uid() AND public.acm_current_user_role() = 'STUDENT');

DROP POLICY IF EXISTS "borrow_requests_update_staff" ON public.borrow_requests;
CREATE POLICY "borrow_requests_update_staff" ON public.borrow_requests
FOR UPDATE TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "borrow_details_select" ON public.borrow_details;
CREATE POLICY "borrow_details_select" ON public.borrow_details
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.borrow_requests br 
    WHERE br.id = "borrowRequestId" 
    AND (br."borrowerId" = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
  )
);

DROP POLICY IF EXISTS "borrow_details_write_staff" ON public.borrow_details;
CREATE POLICY "borrow_details_write_staff" ON public.borrow_details
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Return Transactions & Return Details
DROP POLICY IF EXISTS "return_transactions_select" ON public.return_transactions;
CREATE POLICY "return_transactions_select" ON public.return_transactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.borrow_requests br 
    WHERE br.id = "borrowRequestId" 
    AND (br."borrowerId" = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
  )
);

DROP POLICY IF EXISTS "return_transactions_write_staff" ON public.return_transactions;
CREATE POLICY "return_transactions_write_staff" ON public.return_transactions
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "return_details_select" ON public.return_details;
CREATE POLICY "return_details_select" ON public.return_details
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_transactions rt
    JOIN public.borrow_requests br ON rt."borrowRequestId" = br.id
    WHERE rt.id = "returnTransactionId"
    AND (br."borrowerId" = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
  )
);

DROP POLICY IF EXISTS "return_details_write_staff" ON public.return_details;
CREATE POLICY "return_details_write_staff" ON public.return_details
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Stage4C Operations & Ledgers (Staff only)
DO $$
DECLARE
    tbl text;
    s4c_tables text[] := ARRAY[
        'borrow_return_operations', 'system_evidence_registry', 'borrow_return_source_allocations'
    ];
BEGIN
    FOREACH tbl IN ARRAY s4c_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS "stage4c_staff_only" ON public.%I;', tbl);
            EXECUTE format('CREATE POLICY "stage4c_staff_only" ON public.%I FOR ALL TO authenticated USING (public.acm_current_user_role() IN (''ADMIN'', ''LAB_MANAGER'', ''TECHNICIAN'')) WITH CHECK (public.acm_current_user_role() IN (''ADMIN'', ''LAB_MANAGER'', ''TECHNICIAN''));', tbl);
        END IF;
    END LOOP;
END $$;

-- Inventory Ledgers & Balances (Staff only)
DO $$
DECLARE
    tbl text;
    inv_tables text[] := ARRAY[
        'stock_balances', 'stock_movements', 'stock_reservations',
        'stock_transactions', 'stock_transaction_details'
    ];
BEGIN
    FOREACH tbl IN ARRAY inv_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS "inventory_staff_only" ON public.%I;', tbl);
            EXECUTE format('CREATE POLICY "inventory_staff_only" ON public.%I FOR ALL TO authenticated USING (public.acm_current_user_role() IN (''ADMIN'', ''LAB_MANAGER'', ''TECHNICIAN'')) WITH CHECK (public.acm_current_user_role() IN (''ADMIN'', ''LAB_MANAGER'', ''TECHNICIAN''));', tbl);
        END IF;
    END LOOP;
END $$;

-- Audit Logs, Idempotency Records & Prisma Migrations Lock
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    DROP POLICY IF EXISTS "audit_logs_read_admin" ON public.audit_logs;
    CREATE POLICY "audit_logs_read_admin" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.acm_current_user_role() = 'ADMIN');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'idempotency_records') THEN
    DROP POLICY IF EXISTS "idempotency_staff_only" ON public.idempotency_records;
    CREATE POLICY "idempotency_staff_only" ON public.idempotency_records
    FOR ALL TO authenticated
    USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
    WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') THEN
    DROP POLICY IF EXISTS "prisma_migrations_deny_all" ON public._prisma_migrations;
    CREATE POLICY "prisma_migrations_deny_all" ON public._prisma_migrations
    FOR ALL TO authenticated USING (false);
  END IF;
END $$;

-- 3.5 LAYER 3: ZERO-TRUST FOR UNAUTHENTICATED (ANON) USERS
-- PostgREST anon role cannot perform any operation directly.
-- (Strictly Fail-Closed Posture)

