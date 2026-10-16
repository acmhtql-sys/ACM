# ACM – CLOUD STAGING ENVIRONMENT VARIABLES MATRIX
## Canonical Specification for Vercel, Render, Supabase & Cloudinary

**Document ID:** `ACM-ENV-MATRIX-C1A`  
**Revision:** `1.0 (CONTROLLED CONFIGURATION)`  
**Scope:** Cloud Staging Deployment Across Four Platforms  
**Security Mandate:** ZERO SECRETS IN CODE OR VERSION CONTROL – NAMES & SPECIFICATIONS ONLY  

---

## 1. Overview & Security Rules

All cloud staging components run in separate execution boundaries and require distinct configuration profiles:
1. **Frontend (Vercel):** Client-side environment variables bundled at build time via Vite (`import.meta.env`).
   > [!CRITICAL]
   > **ZERO BACKEND SECRETS IN VERCEL:** Only variables prefixed with `VITE_` are exposed to the browser. Under no circumstances should `DATABASE_URL`, `JWT_SECRET`, or `CLOUDINARY_API_SECRET` be defined in Vercel.
2. **Backend (Render):** Server-side environment variables injected into the Node.js runtime process (`process.env`).
3. **Database (Supabase):** Cloud PostgreSQL project settings and connection strings.
4. **Media (Cloudinary):** Cloudinary API credentials confined strictly to the Render backend service.

---

## 2. Complete Environment Variables Matrix

| Platform | Variable Name | Required | Sensitivity | Default / Fallback | Type / Format Example | Description & Constraints |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **Vercel** | `VITE_API_BASE_URL` | **YES** | Low | `http://localhost:5000/api/v1` | `https://<service>.onrender.com/api/v1` | Base URL used by Axios API client to communicate with the Render backend. |
| **Vercel** | `VITE_APP_TITLE` | NO | None | `ACM – Components System` | `String` | Browser tab title and application branding. |
| **Vercel** | `VITE_ENABLE_LOCATION_WRITES` | **YES** | Low | `false` | `false` | **Feature Flag:** Controls UI write access to location management. MUST remain `false` for read-only Staging. |
| **Vercel** | `VITE_ENABLE_STOCK_TRANSACTION_WRITES` | **YES** | Low | `false` | `false` | **Feature Flag:** Controls UI write access to stock transactions. MUST remain `false` for read-only Staging. |
| **Vercel** | `VITE_ENABLE_STOCK_ADJUSTMENT` | **YES** | Low | `false` | `false` | **Feature Flag:** Independent gate for stock adjustment operations. MUST remain `false` for read-only Staging. |
| **Render** | `NODE_ENV` | **YES** | Low | `development` | `production` | Node.js execution environment. Controls error detail and logging. |
| **Render** | `PORT` | **YES** | None | `5000` | Auto-injected (`10000`) | Network port allocated dynamically by Render container environment. |
| **Render** | `API_PREFIX` | NO | None | `/api/v1` | `/api/v1` | Routing prefix prepended to all Express REST endpoints. |
| **Render** | `CORS_ORIGIN` | **YES** | Medium | `*` | `https://<project>.vercel.app` | Allowed CORS origin. MUST match exact Vercel frontend staging domain. |
| **Render** | `DATABASE_URL` | **YES** | **CRITICAL** | None (Fatal if missing) | `postgresql://postgres.[ref]:[pass]@<host>:5432/postgres?sslmode=require` | Primary database connection string (Supabase Session Pooler or Direct). |
| **Render** | `DIRECT_URL` | Optional | **CRITICAL** | None | `postgresql://postgres:[pass]@db.<ref>.supabase.co:5432/postgres?sslmode=require` | Direct session connection string for DDL migrations. |
| **Render** | `JWT_SECRET` | **YES** | **CRITICAL** | Insecure Dev Fallback | High-entropy string (min 64 chars) | Cryptographic secret used for signing and verifying JSON Web Tokens. |
| **Render** | `JWT_EXPIRES_IN` | NO | Medium | `1d` | `1d`, `7d`, `24h` | Lifespan of issued authentication tokens before expiration. |
| **Render** | `LOG_LEVEL` | NO | Low | `info` | `info`, `warn`, `error` | Winston/Morgan logger verbosity. |
| **Render** | `ACM_DEPLOYMENT_PROFILE` | **YES** | Low | `local_dev` | `cloud_staging` | **Security Profile:** Specifies deployment target. For Cloud Staging, MUST be `cloud_staging`. |
| **Render** | `STAGING_READ_ONLY` | **YES** | **HIGH** | Optional | `'true'` | **Fail-Closed Write Gate:** Mandatory when profile is `cloud_staging`. Activates global Express read-only protection. |
| **Render** | `ALLOW_STAGING_AUTH_LOGIN` | NO | Low | `'false'` | `'true'`, `'false'` | **Auth Exception:** Permits audited `POST /api/v1/auth/login` (zero writes). Set to `'false'` to disable all POSTs. |
| **Render** | `CLOUDINARY_CLOUD_NAME` | Future (C2) | Low | None | `String` | Cloudinary account identifier for image uploads. |

| **Render** | `CLOUDINARY_API_KEY` | Future (C2) | Medium | None | `Numeric string` | Public identifier for Cloudinary API requests. |
| **Render** | `CLOUDINARY_API_SECRET` | Future (C2) | **HIGH** | None | Secret string | Private secret for signing backend-mediated media uploads. |
| **Supabase** | `POSTGRES_PASSWORD` | **YES** | **CRITICAL** | None | High-entropy 32-char string | Master password for default `postgres` database user. |

---

## 3. Database Connection URI Topology for Supabase

To preserve the frozen Prisma baseline without forcing changes to `schema.prisma`, connections are decoupled by operational role:

```mermaid
flowchart TD
    subgraph StagingRuntime["Render Web Service (Continuous Runtime)"]
        ExpressApp["Express API Process"]
        PrismaRuntime["Prisma Client Instance"]
        ExpressApp --> PrismaRuntime
    end

    subgraph StagingMigration["Independent CLI Migration (Deployment Only)"]
        PrismaCLI["Prisma CLI (npx prisma migrate deploy)"]
    end

    subgraph SupabaseCloud["Supabase PostgreSQL Cloud Project"]
        SessionPooler["Session Pooler (Port 5432)<br/>(Full Prepared Statements & Advisory Locks)"]
        TxPooler["Transaction Pooler (Port 6543)<br/>(PgBouncer/Supavisor Transaction Mode)"]
        DirectPG["Direct PostgreSQL Engine (Port 5432)<br/>(db.<ref>.supabase.co)"]
        PostgresDB[("Database: postgres<br/>Schema: public")]
    end

    PrismaRuntime -->|DATABASE_URL<br/>Session Pooler| SessionPooler
    SessionPooler --> PostgresDB

    PrismaCLI -->|DATABASE_URL<br/>Direct Connection| DirectPG
    DirectPG --> PostgresDB
```

### Connection Mode Selection Guidelines:
1. **Render Web Service Runtime (`DATABASE_URL`):**
   - **Recommended:** **Supabase Session Pooler (Port 5432)** or **Direct Connection**.
   - *Rationale:* Render operates a persistent single-process Node.js container with a bounded Prisma connection pool (default 5–10 connections). This will not overwhelm a standard Supabase instance.
   - *Avoid:* Using Transaction Pooler (Port 6543) as the default unless `?pgbouncer=true` is appended, because transaction mode breaks prepared statements and advisory locks.
2. **Prisma Migration CLI (`DATABASE_URL` during `npx prisma migrate deploy`):**
   - **Mandatory:** **Direct Connection (Port 5432)** or **Session Pooler (Port 5432)**.
   - *Rationale:* `prisma migrate deploy` requires PostgreSQL advisory locks (`pg_advisory_lock`) to coordinate schema migration safety across distributed instances. Transaction Poolers on Port 6543 drop advisory locks, resulting in migration failure.
   - *Advantage:* By supplying the migration URL directly via the environment at migration execution time (`DATABASE_URL="..." npx prisma migrate deploy`), the frozen `schema.prisma` file remains 100% untouched.

---

## 4. Protected Local Environments (DO NOT CONFIGURE)

The following local database connection strings MUST NEVER be entered into any cloud configuration:

| Environment | Host / Port | Database Name | Container Name | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Dev Environment** | `localhost:5432` | `acm_inventory` | Local Postgres / Host | **FROZEN / UNTOUCHED** |
| **Gate B Baseline** | `localhost:5433` | `acm_inventory_sandbox_s2b` | `acm-postgres-sandbox-s2b` | **FROZEN / PROTECTED** |
| **S2C Local Sandbox**| `localhost:5434` | `acm_inventory_sandbox_s2c` | `acm-postgres-sandbox-s2c` | **UNPROVISIONED** |

---

## 5. Secret Generation & Hygiene Protocol

1. **`JWT_SECRET` Generation:**
   Run the following command locally to generate a cryptographically secure 64-character hex string:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **`POSTGRES_PASSWORD` Generation:**
   Generate via a password manager: 32 alphanumeric characters, avoiding special characters that require URL-encoding (`%`, `#`, `@`, `:`, `/`).
3. **Storage Rule:** Store staging secrets in an encrypted password manager. Never commit `.env` files to Git.
