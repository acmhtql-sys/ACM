-- ============================================================================
-- ACM CLOUD STAGING: SUPABASE POSTGREST DATA API RLS LOCKDOWN SCRIPT (FINAL)
-- Target: Supabase Cloud PostgreSQL (acm-qllk-staging / dqctxaoaxhtqtgmtsysk)
-- Scope: All 19 application tables + _prisma_migrations in schema public
-- Security Posture: Zero-Trust / Fail-Closed
-- Operational Invariant: Express / Prisma Client via 'postgres' retains 100% access.
--                      External anonymous requests via PostgREST are 100% denied.
-- ============================================================================

-- 1. SCHEMA USAGE PRIVILEGES
-- Revoke schema usage from Supabase anonymous and authenticated PostgREST roles.
-- Preserve full access for master database user 'postgres' and internal 'service_role'.
REVOKE USAGE, CREATE ON SCHEMA public FROM anon, authenticated;
GRANT USAGE, CREATE ON SCHEMA public TO postgres, service_role;

-- 2. ENABLE ROW LEVEL SECURITY & DEFINE STRICT POLICIES ACROSS ALL 19 TABLES + MIGRATIONS
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'roles',
        'users',
        'categories',
        'items',
        'locations',
        'assets',
        'stock_balances',
        'stock_movements',
        'stock_reservations',
        'stock_transactions',
        'stock_transaction_details',
        'borrow_requests',
        'borrow_details',
        'return_transactions',
        'return_details',
        'audit_logs',
        'idempotency_records',
        'kits',
        'kit_items',
        '_prisma_migrations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            -- Enable RLS on the table
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            
            -- Ensure any legacy policies are dropped before recreating
            EXECUTE format('DROP POLICY IF EXISTS "acm_app_full_access" ON public.%I;', tbl);
            
            -- Explicit permissive policy for application runtime roles (postgres, service_role)
            EXECUTE format('CREATE POLICY "acm_app_full_access" ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);', tbl);
        END IF;
    END LOOP;
END $$;

-- 3. REVOKE ALL PRIVILEGES FROM UNTRUSTED ROLES ON EXISTING OBJECTS
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- 4. ENSURE OPERATIONAL ROLES RETAIN FULL PRIVILEGES ON APPLICATION & EXTENSION OBJECTS
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;

-- 5. SECURE DEFAULT PRIVILEGES FOR FUTURE CREATED OBJECTS
-- Any table, sequence, or function created in the future will not grant access to anon/authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- Ensure future objects automatically grant full access to postgres and service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, service_role;

-- 6. SECURITY AUDIT VERIFICATION NOTICE
-- Express API connects via 'postgres' master user, which has explicit full policy and table owner rights.
-- Any request hitting Supabase PostgREST (https://dqctxaoaxhtqtgmtsysk.supabase.co/rest/v1/*) with anon_key
-- will receive HTTP 401 Unauthorized / HTTP 403 Forbidden / empty response set [].
-- Supabase system schemas (auth, storage, extensions, realtime, vault) remain completely unaffected.
