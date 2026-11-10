-- ============================================================================
-- ACM CLOUD PRODUCTION-READY: GRANULAR RBAC ROW LEVEL SECURITY (RLS) POLICIES (HARDENED)
-- Target: Supabase Cloud PostgreSQL 17.11 (acm-qllk-staging / production)
-- Fixes:
--   - SEC-01: Eliminate privilege escalation via user_metadata. Role resolved strictly
--             from public.users table or server-controlled app_metadata.
--             Secured with SECURITY DEFINER and search_path = public, pg_temp.
--   - SEC-02: Complete policy coverage across all 20 public tables (zero omitted).
-- Security Posture: Multi-Layer Defense-in-Depth
--   Layer 1: Master service_role / postgres retains 100% full access for Express/Prisma.
--   Layer 2: Granular RBAC for Supabase Auth / PostgREST (Student, Technician, Lab Manager, Admin).
--   Layer 3: Zero-Trust for unauthenticated (anon) requests — strict fail-closed.
-- ============================================================================

-- 1. SEC-01 FIX: HELPER FUNCTION TO RESOLVE ROLE SAFELY
-- Server-controlled ONLY: reads from public.users (DB) or app_metadata (Admin-only JWT claim).
-- user_metadata is EXCLUDED to prevent self-assigned privilege escalation.
CREATE OR REPLACE FUNCTION public.acm_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT r.name 
     FROM public.users u 
     JOIN public.roles r ON u."roleId" = r.id 
     WHERE u.id = auth.uid()),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', ''),
    'ANONYMOUS'
  );
$$;

-- Revoke execute from public/anon; allow only authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.acm_current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acm_current_user_role() TO authenticated, service_role;

-- 2. ENABLE RLS ON ALL 20 TABLES (SCHEMA PUBLIC)
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

-- 4.1 ROLES
DROP POLICY IF EXISTS "roles_read_authenticated" ON public.roles;
CREATE POLICY "roles_read_authenticated" ON public.roles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "roles_write_admin_only" ON public.roles;
CREATE POLICY "roles_write_admin_only" ON public.roles
FOR ALL TO authenticated
USING (public.acm_current_user_role() = 'ADMIN')
WITH CHECK (public.acm_current_user_role() = 'ADMIN');

-- 4.2 USER PROFILES
DROP POLICY IF EXISTS "users_read_self_or_admin" ON public.users;
CREATE POLICY "users_read_self_or_admin" ON public.users
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
CREATE POLICY "users_update_self_or_admin" ON public.users
FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.acm_current_user_role() = 'ADMIN')
WITH CHECK (id = auth.uid() OR public.acm_current_user_role() = 'ADMIN');

-- 4.3 CATALOG & INVENTORY ITEMS (categories, items, locations, assets, kits, kit_items)
DROP POLICY IF EXISTS "categories_read_authenticated" ON public.categories;
CREATE POLICY "categories_read_authenticated" ON public.categories
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "categories_write_staff" ON public.categories;
CREATE POLICY "categories_write_staff" ON public.categories
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

DROP POLICY IF EXISTS "items_read_authenticated" ON public.items;
CREATE POLICY "items_read_authenticated" ON public.items
FOR SELECT TO authenticated
USING ("isActive" = true OR public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "items_write_staff" ON public.items;
CREATE POLICY "items_write_staff" ON public.items
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "locations_read_authenticated" ON public.locations;
CREATE POLICY "locations_read_authenticated" ON public.locations
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "locations_write_staff" ON public.locations;
CREATE POLICY "locations_write_staff" ON public.locations
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

-- SEC-02 fix: Assets policy defined explicitly
DROP POLICY IF EXISTS "assets_read_authenticated" ON public.assets;
CREATE POLICY "assets_read_authenticated" ON public.assets
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "assets_write_staff" ON public.assets;
CREATE POLICY "assets_write_staff" ON public.assets
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS "kits_read_authenticated" ON public.kits;
CREATE POLICY "kits_read_authenticated" ON public.kits
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kits_write_staff" ON public.kits;
CREATE POLICY "kits_write_staff" ON public.kits
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- SEC-02 fix: Kit Items policy defined explicitly
DROP POLICY IF EXISTS "kit_items_read_authenticated" ON public.kit_items;
CREATE POLICY "kit_items_read_authenticated" ON public.kit_items
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kit_items_write_staff" ON public.kit_items;
CREATE POLICY "kit_items_write_staff" ON public.kit_items
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- 4.4 BORROW REQUESTS & DETAILS
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

-- 4.5 RETURN TRANSACTIONS & RETURN DETAILS (SEC-02 fix: return_details defined)
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

-- 4.6 INVENTORY LEDGERS & STOCK BALANCES (Staff-only access, Students zero direct access)
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

-- Allow Students to view reservations for their own borrow requests (read-only)
DROP POLICY IF EXISTS "stock_reservations_student_view_own" ON public.stock_reservations;
CREATE POLICY "stock_reservations_student_view_own" ON public.stock_reservations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.borrow_requests br 
    WHERE br.id = "borrowRequestId" AND br."borrowerId" = auth.uid()
  )
);

-- 4.7 AUDIT LOGS & IDEMPOTENCY RECORDS
DROP POLICY IF EXISTS "audit_logs_read_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_read_admin" ON public.audit_logs
FOR SELECT TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER'));

DROP POLICY IF EXISTS "idempotency_records_staff" ON public.idempotency_records;
CREATE POLICY "idempotency_records_staff" ON public.idempotency_records
FOR ALL TO authenticated
USING (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'))
WITH CHECK (public.acm_current_user_role() IN ('ADMIN', 'LAB_MANAGER', 'TECHNICIAN'));

-- 5. LAYER 3: ZERO-TRUST FOR ANONYMOUS ROLE (anon)
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM anon;
