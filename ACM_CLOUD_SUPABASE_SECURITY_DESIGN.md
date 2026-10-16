# ACM CLOUD SUPABASE SECURITY DESIGN
## Phase C1A.2R – Staging & Production Database Security Architecture

**Document Version:** 2.1.0 (Phase C1A.2R Targeted Security Closure)  
**Status:** DESIGN ONLY – ZERO EXECUTION / ZERO CONNECTION TO SUPABASE  
**Classification:** STRICT STATIC SECURITY SPECIFICATION  
**Scope:** Supabase PostgreSQL Database for ACM Monorepo (Staging & Production)  
**Author:** ACM Core Architecture & Security Engineering Team  

---

## 1. EXECUTIVE SUMMARY & SECURITY PRINCIPLES

This document establishes the authoritative database security architecture for the ACM (Hệ thống Quản lý Linh kiện & Thiết bị) platform on Supabase PostgreSQL. 

In accordance with strict security standards:
- **Defense in Depth:** The Cloud Staging environment enforces security at two independent layers:
  1. Application Layer: Express fail-closed middleware (`cloudStagingReadOnlyMiddleware`) blocking HTTP mutations (`POST`, `PUT`, `PATCH`, `DELETE`).
  2. Database Layer: Dedicated PostgreSQL role (`acm_staging_ro`) with revoked mutation privileges (`REVOKE INSERT, UPDATE, DELETE, TRUNCATE`).
- **Zero Real Connection Mandate:** This document is **100% design-only**. No real Supabase database is connected, migrated, or altered during Phase C1A.2R.
- **Fail-Closed Default:** Unauthenticated or unauthorized access, plaintext transport, or pooler misconfigurations fail closed immediately.
- **No Premature Assumptions:** No connection mode, pooling behavior, or backup capability is assumed operational until a Supabase project is officially provisioned and verified in authorized phases.
- **Privilege Reality Caveat:** A `REVOKE` statement on a role is not self-executing proof of zero writes; privilege inheritance, `PUBLIC` grants, and `SECURITY DEFINER` routines must be audited upon provisioning.

---

## 2. SCHEMA TRUTH & INVENTORY BASELINE

The database schema definition is strictly governed by the verified Prisma schema source path:
- **Primary Source Path:** `apps/api/prisma/schema.prisma`
- **Mirrored Repository Package:** `packages/database/prisma/schema.prisma` (verified synchronized with primary)

### 2.1 Migration History & Physical Table Counts
1. **Migration 1 (`20261010143500_init_acm`):**
   - Creates **16 application tables**: `users`, `categories`, `items`, `item_attributes`, `locations`, `inventory_items`, `stock_transactions`, `stock_transaction_details`, `stock_movements`, `stock_movement_items`, `borrow_requests`, `borrow_request_details`, `stock_alerts`, `stock_counts`, `stock_count_details`, `audit_logs`.
   - Creates **9 PostgreSQL enum types**: `UserRole`, `ItemStatus`, `LocationType`, `StockTransactionType`, `StockMovementType`, `MovementDirection`, `BorrowStatus`, `AlertSeverity`, `StockCountStatus`.
2. **Migration 2 (`20261011160000_add_idempotency_and_transfer_location`):**
   - Creates **1 application table**: `idempotency_records`.
   - Alters **1 existing table**: `stock_transaction_details` (adds column `to_location_id` with foreign key referencing `locations(id)`).
   - *Note on Historical Correction:* Migration 2 did NOT alter `stock_transactions` (no `sourceLocationId`/`targetLocationId` in `stock_transactions`).
3. **Prisma Internal Tracking:**
   - Creates **1 tracking table**: `_prisma_migrations`.

**Authoritative Physical Totals:**
- **Application Tables:** 17
- **Internal Migration Tracking Tables:** 1
- **Total Physical Tables in Database:** 18
- **PostgreSQL Enum Types:** 9

### 2.2 Key Table Specifications
- **`audit_logs` (15 columns):** Primary audit trail storing `id`, `user_id`, `action`, `entity_name`, `entity_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `status`, `error_message`, `created_at`, `duration_ms`, `module`, `risk_level`. Indexed on `(entity_name, entity_id)` and `created_at`.
- **`idempotency_records` (9 columns):** Mutation deduplication ledger storing `id`, `key`, `target_endpoint`, `request_hash`, `status`, `response_status`, `response_body`, `created_at`, `expires_at`.

---

## 3. CONNECTION TOPOLOGY & POOLING ARCHITECTURE

Supabase provides direct PostgreSQL connections and pooled connection endpoints via Supavisor / PgBouncer. ACM routes traffic according to workload characteristics:

```
[ CI/CD / Release Pipeline (Migration Only) ] ──── Port 5432 (Direct PG) ──── Direct Supabase PG (IPv6 / IPv4 Add-on)
                                                                                       │
[ Render Web Service (ACM API Runtime) ] ──────── Port 5432 (Session Pooler) ─────────┘
                                                  (aws-0-[region].pooler.supabase.com)
```

### 3.1 Connection Mode Strategy & Analysis

| Connection Architecture | Port | Protocol / Features | Operational Target | Recommendation & Status |
| :--- | :---: | :--- | :--- | :--- |
| **Direct Connection** | `5432` | Native PostgreSQL (`db.[ref].supabase.co`); supports DDL and advisory locks | Schema migrations (`prisma migrate deploy`) | **MANDATORY FOR MIGRATIONS:** Required to acquire `pg_advisory_lock` during schema migration deployment. *Note: If direct connection is blocked by IPv4 network restrictions on CI/CD runner, verified IPv4 pooler or proxy alternative must be used.* |
| **Session Pooler** | `5432` | Supavisor Session Mode; supports prepared statements, advisory locks, session variables | Render Web Service Backend Runtime | **RECOMMENDED FOR RENDER RUNTIME:** Persistent Express Node.js process benefits from full prepared statement compatibility without PgBouncer transaction limitations. |
| **Transaction Pooler** | `6543` | Supavisor / PgBouncer Transaction Mode; closes connection after transaction | High-concurrency or serverless endpoints | **RESTRICTED / CONDITIONAL:** Incompatible with `prisma migrate deploy` (drops advisory locks). Requires `?pgbouncer=true` and disables prepared statements in Prisma. |

> [!IMPORTANT]
> **Pre-Provisioning Verification Caveat:**
> No connection mode is assumed 100% operational until the target Supabase Project is provisioned and connectivity is experimentally verified in Phase C1B. All connection configurations in Phase C1A.2R remain in `[NOT VERIFIED – EXTERNAL PLATFORM]` status.

### 3.2 Connection String Specifications & Pooler Username Format

1. **Shared Pooler Username Format Requirement:**
   - On Supabase Supavisor shared poolers, connecting with a custom role typically requires the format:
     `[ROLE].[PROJECT_REF]` (e.g. `acm_staging_ro.[PROJECT_REF]`).
   - Do **NOT** assume a raw username (e.g. `acm_staging_ro`) works through shared poolers without the project reference suffix.
2. **Runtime Connection URL (Render Backend):**
   ```text
   postgresql://acm_staging_ro.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
   ```
3. **Migration Direct URL (CI/CD / Release Script):**
   ```text
   postgresql://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
   ```
4. **SSL Enforcement:** Any connection lacking `sslmode=require` must be rejected by firewall rules and PostgreSQL server configuration (`ssl = on`).

---

## 4. ROLE-BASED ACCESS CONTROL & PRIVILEGE ARCHITECTURE

To enforce least-privilege separation, dedicated database roles are architected:

```
                         [ postgres (Superuser / Project Admin) ]
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
        [ acm_migrator ]                                  [ acm_app ]
       (DDL + Migrations)                          (DML Read/Write for Prod)
                                                                 │
                                                                 ▼ (For Staging)
                                                         [ acm_staging_ro ]
                                                         (Strict SELECT only)
```

### 4.1 Role Matrix & Privilege Constraints

| Database Role | Intended Usage | DDL (CREATE/ALTER/DROP) | DML (INSERT/UPDATE/DELETE) | DQL (SELECT) | Privileges & Restrictions |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `postgres` | Supabase initial setup / maintenance | YES | YES | YES | Default master role; never used for runtime backend. |
| `acm_migrator` | CI/CD migration deployment | YES | YES (on `_prisma_migrations`) | YES | Zero access outside deployment pipeline; acquires advisory locks. |
| `acm_app` (Prod) | Production runtime API service | NO | YES (on all 17 tables) | YES | **FORBIDDEN ON CLOUD STAGING**. Restricted strictly to future Production. |
| `acm_staging_ro` (Staging) | Staging runtime API service | NO | **REVOKED (0 writes)** | YES (all 18 tables) | **MANDATORY ON STAGING**: Zero DDL, zero TRUNCATE, zero mutation privileges. |

### 4.2 Staging Database-Level Read-Only Specification (`acm_staging_ro`)

```sql
-- 1. Create dedicated Staging Read-Only application user (LOGIN only, no admin capabilities)
CREATE ROLE acm_staging_ro WITH LOGIN PASSWORD 'STAGING_RO_SECURE_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- 2. Revoke default public schema creation and mutation
REVOKE ALL ON SCHEMA public FROM acm_staging_ro;
GRANT USAGE ON SCHEMA public TO acm_staging_ro;

-- 3. Grant SELECT only on all 17 application tables + _prisma_migrations (18 physical tables)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO acm_staging_ro;

-- 4. Set default privileges for any future tables to SELECT only
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO acm_staging_ro;

-- 5. Explicitly revoke destructive capabilities and mutation privileges
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM acm_staging_ro;
```

### 4.3 Privilege Inheritance & PUBLIC Grant Audit Caveats
> [!CRITICAL]
> **Privilege Assurance Rules:**
> Simply running `REVOKE` on `acm_staging_ro` is **NOT sufficient** to guarantee zero database writes if privileges are inherited through default PostgreSQL settings. Upon live provisioning in Phase C1B, the following 8 vectors must be explicitly verified:
> 1. **PUBLIC Schema Grants:** PostgreSQL historically grants `CREATE` and `USAGE` on schema `public` to role `PUBLIC`. Verify `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`.
> 2. **Role Memberships:** Verify `acm_staging_ro` is NOT a member of `postgres`, `anon`, `authenticated`, or `service_role`.
> 3. **Schema Ownership:** Ensure `public` schema is owned by `postgres`, never by `acm_staging_ro`.
> 4. **Table Ownership:** Ensure all tables are owned by the migration role, never by `acm_staging_ro` (table owners inherently have full DDL/DML rights).
> 5. **Function EXECUTE Privileges:** PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default. Any custom function performing write operations could be invoked unless revoked.
> 6. **SECURITY DEFINER Functions:** Audit that no function executes with definer privileges to mutate tables on behalf of `acm_staging_ro`.
> 7. **Future Default Privileges:** Ensure `ALTER DEFAULT PRIVILEGES ... REVOKE INSERT, UPDATE, DELETE` is applied for tables created by the migration role.
> 8. **Live Verification Mandate:** Do NOT claim ZERO database writes until an authorized live privilege verification script (`has_table_privilege()`) is executed.  
> **Status:** `[NOT VERIFIED – DESIGN ONLY]`

---

## 5. SUPABASE DATA API (POSTGREST) & ROW LEVEL SECURITY (RLS)

### 5.1 Supabase Data API Evaluation
- **ACM Monorepo Architecture:**
  ```
  [ Client Browser (Vite/React SPA) ] ─── HTTPS ───> [ Express API (Render) ] ─── TLS/Pooler ───> [ PostgreSQL (Supabase) ]
  ```
- **Does ACM use the Supabase Data API (PostgREST)?** **NO**. 
  All client requests terminate at the Render Express API.
- **Data API Posture & Recommendation:**
  > [!IMPORTANT]
  > **DO NOT ASSUME DATA API IS AUTOMATICALLY DISABLED:**
  > Supabase enables the PostgREST Data API by default on all new projects. Because ACM does not consume PostgREST:
  > - **RECOMMENDATION:** Explicitly **DISABLE** the Supabase Data API in Project Settings (or unexpose the `public` schema).
  > - If the Data API remains enabled, an explicit privilege review and Row Level Security (RLS) on all 17 tables is mandatory to prevent unauthorized data access via Supabase anon keys.
  > - **Actual Setting Status:** `[NOT VERIFIED – EXTERNAL PLATFORM]` (pending project creation).

---

## 6. BACKUP, RESTORE & POINT-IN-TIME RECOVERY (PITR)

### 6.1 Plan-Dependent Backup Capabilities
- **Supabase Free Plan:** 
  - Does **NOT** include automated point-in-time recovery (PITR).
  - Does **NOT** include scheduled automated daily backup downloads.
  - Disaster recovery on Free tier relies on manual logical dumps via `pg_dump`.
- **Supabase Pro Plan:** 
  - Includes daily automated backup snapshots retained for 7 days.
  - **Point-In-Time Recovery (PITR) is an OPTIONAL PAID ADD-ON**: PITR is **not** automatically included in standard Pro; it must be explicitly purchased and enabled.
- **Operational Protocol:**
  - For Staging, a verified `pg_dump` logical backup must be captured prior to any migration execution.
  - Backup scripts must safely manage credentials via `.pgpass` or environment variables without logging passwords.
  - **Restore Capability Status:** `[NOT VERIFIED – EXTERNAL PLATFORM]` (cannot be tested without live infrastructure).

---

## 7. DOCUMENTATION RECONCILIATION & GOVERNANCE

1. **Frontend Framework:** Vite / React Single Page Application (`apps/web`), NOT Next.js.
2. **Authoritative Prisma Schema Path:** `apps/api/prisma/schema.prisma` (mirrored in `packages/database/prisma/schema.prisma`).
3. **Table & Enum Counts:** Exactly **17 application tables**, **9 PostgreSQL enum types**, **1 Prisma tracking table** (`_prisma_migrations`), totaling **18 physical tables**.
4. **Zero Execution Guarantee:** No SQL statements, migrations, or database commands are executed during this phase.

---

## 8. CONCLUSION & SIGN-OFF

This Phase C1A.2R revision resolves all independent audit findings:
- Specifies exact shared pooler role syntax (`acm_staging_ro.[PROJECT_REF]`).
- Explicitly documents the 8 privilege inheritance caveats (PUBLIC grants, role memberships, function execute, table ownership).
- Highlights that the Supabase Data API is enabled by default and formally recommends disabling it.
- Distinguishes Supabase Pro daily backup retention from the optional paid PITR add-on.
- All live database operations remain strictly `[NOT VERIFIED – DESIGN ONLY]`.
