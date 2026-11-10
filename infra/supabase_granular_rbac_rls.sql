-- ============================================================================
-- ACM CLOUD PRODUCTION-READY: GRANULAR RBAC ROW LEVEL SECURITY (RLS) POLICIES
-- Target: Supabase Cloud PostgreSQL 17.11 (acm-qllk-staging / production)
-- Architecture: Multi-Layer Defense-in-Depth
--   Layer 1: Master service_role / postgres retains 100% full access for Express/Prisma.
--   Layer 2: Granular RBAC for Supabase Auth / PostgREST (Student, Technician, Lab Manager, Admin).
--   Layer 3: Zero-Trust for unauthenticated (anon) requests — strict fail-closed.
-- ============================================================================

-- 1. HELPER FUNCTION: Resolve current user's role from public.users table or JWT claim
CREATE OR REPLACE FUNCTION public.acm_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT r.name FROM public.users u JOIN public.roles r ON u."roleId" = r.id WHERE u.id = auth.uid()),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', ''),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role', ''),
    'ANONYMOUS'
  );
$$;

-- 2. ENABLE RLS ON ALL 19 CORE APPLICATION TABLES + _prisma_migrations
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'roles', 'users', 'categories', 'items', 'locations', 'assets',
        'stock_balances', 'stock_movements', 'stock_reservations',
        'stock_transactions', 'stock_transaction_details',
        'borrow_requests', 'borrow_details', 'return_transactions', 'return_details',
        'audit_logs', 'idempotency_records', 'kits', 'kit_items', '_prisma_migrations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        END IF;
    END LOOP;
END $$;

-- 3. LAYER 1: UNRESTRICTED ACCESS FOR BACKEND RUNTIME (postgres, service_role)
-- This ensures Express API with Prisma Client is 100% operational with zero regression.
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'roles', 'users', 'categories', 'items', 'locations', 'assets',
        'stock_balances', 'stock_movements', 'stock_reservations',
        'stock_transactions', 'stock_transaction_details',
        'borrow_requests', 'borrow_details', 'return_transactions', 'return_details',
        'audit_logs', 'idempotency_records', 'kits', 'kit_items', '_prisma_migrations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS "service_role_full_access" ON public.%I;', tbl);
            EXECUTE format('CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);', tbl);
        END IF;
    END LOOP;
END $$;

-- 4. LAYER 2: GRANULAR RBAC POLICIES FOR AUTHENTICATED USERS (Direct client / PostgREST)

-- 4.1 CATALOG DATA (categories, items, locations, kits, kit_items)
-- Authenticated users (including Students) can SELECT active catalog items.
-- Only Staff (ADMIN, LAB_MANAGER, TECHNICIAN) can INSERT, UPDATE, DELETE.

DROP POLICY IF EXISTS "catalog_read_authenticated" ON public.items;
CREATE POLICY "catalog_read_authenticated" ON public.items
FOR SELECT TO authenticated
USING ("isActive" = true OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "catalog_write_staff" ON public.items;
CREATE POLICY "catalog_write_staff" ON public.items
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "categories_read_authenticated" ON public.categories;
CREATE POLICY "categories_read_authenticated" ON public.categories
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "categories_write_staff" ON public.categories;
CREATE POLICY "categories_write_staff" ON public.categories
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

DROP POLICY IF EXISTS "locations_read_authenticated" ON public.locations;
CREATE POLICY "locations_read_authenticated" ON public.locations
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "kits_read_authenticated" ON public.kits;
CREATE POLICY "kits_read_authenticated" ON public.kits
FOR SELECT TO authenticated
USING (true);

-- 4.2 USER PROFILES
-- Users can read their own profile; ADMIN and LAB_MANAGER can read all.
DROP POLICY IF EXISTS "users_read_self_or_admin" ON public.users;
CREATE POLICY "users_read_self_or_admin" ON public.users
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

-- 4.3 BORROW REQUESTS & DETAILS
-- Student: View own requests only.
-- Staff: View all borrow requests.
DROP POLICY IF EXISTS "borrow_requests_select" ON public.borrow_requests;
CREATE POLICY "borrow_requests_select" ON public.borrow_requests
FOR SELECT TO authenticated
USING ("borrowerId" = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Student: Create own borrow request.
DROP POLICY IF EXISTS "borrow_requests_insert_student" ON public.borrow_requests;
CREATE POLICY "borrow_requests_insert_student" ON public.borrow_requests
FOR INSERT TO authenticated
WITH CHECK ("borrowerId" = auth.uid() AND public.acm_current_user_role() = 'STUDENT');

-- Staff: Approve, reject, update borrow requests.
DROP POLICY IF EXISTS "borrow_requests_update_staff" ON public.borrow_requests;
CREATE POLICY "borrow_requests_update_staff" ON public.borrow_requests
FOR UPDATE TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- Borrow Details follows borrow_requests
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

-- 4.4 RETURN TRANSACTIONS & DETAILS
-- Student can only read return transactions belonging to their own borrow requests.
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

-- Only Staff can execute returns
DROP POLICY IF EXISTS "return_transactions_write_staff" ON public.return_transactions;
CREATE POLICY "return_transactions_write_staff" ON public.return_transactions
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- 4.5 INVENTORY LEDGERS (stock_balances, stock_movements, stock_reservations, stock_transactions)
-- Strictly accessible ONLY by Staff (ADMIN, LAB_MANAGER, TECHNICIAN). Students have zero direct access.
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

-- 4.6 AUDIT LOGS & IDEMPOTENCY RECORDS
-- Audit logs: Read-only by ADMIN and LAB_MANAGER. Zero client INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "audit_logs_read_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_read_admin" ON public.audit_logs
FOR SELECT TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

-- Idempotency records: Managed strictly through backend transactions.
DROP POLICY IF EXISTS "idempotency_records_staff" ON public.idempotency_records;
CREATE POLICY "idempotency_records_staff" ON public.idempotency_records
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- 5. LAYER 3: ZERO-TRUST FOR ANONYMOUS ROLE (anon)
-- Explicitly revoke all privileges from anon role on all tables and sequences.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM anon;

