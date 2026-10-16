# ACM – CLOUD STAGING DEPLOYMENT CHECKLIST
## Execution Guide for Phased Multi-Platform Staging Launch

**Document ID:** `ACM-DEPLOY-CHECKLIST-C1A`  
**Revision:** `1.0 (CONTROLLED DEPLOYMENT SPECIFICATION)`  
**Scope:** Step-by-Step Operator Guide for Future Authorized Deployment  
**Operational Status:** `DEPLOYMENT NOT EXECUTED – PLANNING & SPECIFICATION ONLY`  

---

## 1. Governance Principles & Safe Deployment Gates

Deployment must progress sequentially across **6 execution gates**. Automatic or unattended progression is prohibited:

```mermaid
flowchart LR
    Gate1["Gate 1: GitHub<br/>(Remote Sync)"] --> Gate2["Gate 2: Supabase<br/>(Schema Deploy)"]
    Gate2 --> Gate3["Gate 3: Render<br/>(API Service)"]
    Gate3 --> Gate4["Gate 4: Vercel<br/>(Web SPA)"]
    Gate4 --> Gate5["Gate 5: Smoke Test<br/>(Read-Only Audit)"]
    Gate5 --> Gate6["Gate 6: Handoff<br/>(Sign-Off)"]
```

---

## 2. Gate 1: GitHub Remote & Repository Synchronization

### Preconditions:
- Local git branch is `master`.
- Working tree contains no uncommitted business logic changes.
- `.gitignore` verified to exclude all `.env` files, build outputs, and credentials.

### Execution Steps:
1. [ ] Log in to [GitHub](https://github.com) and create a new repository: `ACM_QLLK` (Private recommended).
2. [ ] Add remote origin to local working copy:
   ```bash
   git remote add origin https://github.com/<your-username>/ACM_QLLK.git
   ```
3. [ ] Verify remote configuration:
   ```bash
   git remote -v
   ```
   *Expected Output:* `origin` pointing to the GitHub repository URL.
4. [ ] Push `master` branch to GitHub:
   ```bash
   git push -u origin master
   ```

### Verification & Stop Condition:
- [ ] Inspect GitHub web interface to confirm repository root contains `package.json`, `vercel.json`, `packages/`, and `apps/`.
- [ ] Confirm no `.env` files are visible in the repository file tree.
- **GATE 1 STATUS:** `PENDING USER ACTION`

---

## 3. Gate 2: Supabase PostgreSQL Project & Schema Migration

### Preconditions:
- Supabase account active.
- Zero local PostgreSQL connections initiated during creation.

### Execution Steps:
1. [ ] Log in to [Supabase Dashboard](https://supabase.com/dashboard) and click **New Project**.
2. [ ] Enter Project Configuration:
   - **Name:** `acm-inventory-staging`
   - **Database Password:** Generate a secure 32-character random password.
   - **Region:** `Southeast Asia (Singapore)` (or geographically adjacent to Render).
   - **Pricing Plan:** Free or Pro.
3. [ ] Extract Connection Strings under **Project Settings $\rightarrow$ Database**:
   - **Session Pooler (Port 5432):** `postgresql://postgres.[ref]:[pass]@<host>:5432/postgres?sslmode=require`
   - **Direct Connection (Port 5432):** `postgresql://postgres:[pass]@db.<ref>.supabase.co:5432/postgres?sslmode=require`
4. [ ] Execute Database Migrations from local developer terminal targeting Supabase:
   ```bash
   # Execute migrations against Supabase Direct or Session Pooler connection
   cd D:\ACM_QLLK\apps\api
   $env:DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require"
   npx prisma migrate deploy
   ```
   *Expected Output:*
   ```text
   2 migrations found in prisma/migrations
   Applying migration `20261010143500_init_acm`
   Applying migration `20261011160000_add_idempotency_and_transfer_location`
   The following migrations have been successfully applied:
   - 20261010143500_init_acm
   - 20261011160000_add_idempotency_and_transfer_location
   All migrations have been successfully applied.
   ```
5. [ ] (Optional) Seed Minimal Staging Fixtures:
   ```bash
   npm run prisma:seed
   ```

### Verification & Stop Condition:
- [ ] Inspect Supabase **Table Editor**: Verify that exactly **17 application tables** and **1 `_prisma_migrations` table** exist (18 physical tables total).
- [ ] Verify that enum types (9 application enums) are created in schema `public`.
- **GATE 2 STATUS:** `DEPLOYMENT NOT EXECUTED`

---

## 4. Gate 3: Render Backend Web Service Deployment

### Preconditions:
- GitHub repository accessible from Render.
- Supabase database provisioned and migrations completed.

### Execution Steps:
1. [ ] Log in to [Render Dashboard](https://dashboard.render.com) and click **New + $\rightarrow$ Web Service**.
2. [ ] Connect the `ACM_QLLK` GitHub repository.
3. [ ] Configure Service Parameters:
   - **Name:** `acm-backend-staging`
   - **Region:** Same as Supabase (e.g. `Singapore`)
   - **Branch:** `master`
   - **Root Directory:** `.` *(Repository Root)*
   - **Runtime:** `Node`
   - **Build Command:**
     ```bash
     npm ci && npm run build:shared && npm run prisma:generate && npm run build:api
     ```
   - **Start Command:**
     ```bash
     npm run start --workspace=@acm/api
     ```
   - **Instance Type:** `Free` or `Starter`
4. [ ] Enter Environment Variables in Render Dashboard:
   - `NODE_ENV`: `production`
   - `API_PREFIX`: `/api/v1`
   - `DATABASE_URL`: *(Supabase Session Pooler or Direct URI from Gate 2)*
   - `JWT_SECRET`: *(Cryptographically secure 64-char string)*
   - `JWT_EXPIRES_IN`: `1d`
   - `LOG_LEVEL`: `info`
   - `CORS_ORIGIN`: *(Temporary placeholder or intended Vercel URL)*
5. [ ] Set **Health Check Path**: `/api/v1/health/liveness`
6. [ ] Click **Create Web Service** and await deployment logs.

### Verification & Stop Condition:
- [ ] Check deployment logs: verify `@acm/shared` builds first, `prisma generate` finishes, and TypeScript compiles.
- [ ] Probe the public health endpoint:
   ```bash
   curl -s https://acm-backend-staging-xxxx.onrender.com/api/v1/health/liveness
   ```
   *Expected Response:* HTTP 200 OK with `{"status":"ok", "service":"ACM API", ...}`.

- [ ] Probe the readiness endpoint:
   ```bash
   curl -s https://acm-backend-staging-xxxx.onrender.com/api/v1/health/readiness
   ```
   *Expected Response:* HTTP 200 OK with `status: "ready"`, `database: "connected"`.
- **GATE 3 STATUS:** `DEPLOYMENT NOT EXECUTED`

---

## 5. Gate 4: Vercel Frontend Static Deployment

### Preconditions:
- Render backend URL is active and verified healthy.
- `vercel.json` present at repository root.

### Execution Steps:
1. [ ] Log in to [Vercel Dashboard](https://vercel.com) and click **Add New... $\rightarrow$ Project**.
2. [ ] Import the `ACM_QLLK` GitHub repository.
3. [ ] Configure Build & Output Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `.` *(Repository Root)*
   - **Build Command:**
     ```bash
     npm run build:shared && npm run build:web
     ```
   - **Output Directory:** `apps/web/dist`
   - **Install Command:** `npm install`
4. [ ] Configure Environment Variables in Vercel:
   - `VITE_API_BASE_URL`: `https://acm-backend-staging-xxxx.onrender.com/api/v1`
   - `VITE_ENABLE_LOCATION_WRITES`: `false`
   - `VITE_ENABLE_STOCK_TRANSACTION_WRITES`: `false`
   - `VITE_ENABLE_STOCK_ADJUSTMENT`: `false`
5. [ ] Click **Deploy** and await build completion.
6. [ ] Note assigned frontend domain: `https://acm-web-xxxx.vercel.app`.
7. [ ] Return to Render Dashboard $\rightarrow$ Environment: update `CORS_ORIGIN` to match `https://acm-web-xxxx.vercel.app`.

### Verification & Stop Condition:
- [ ] Open frontend in browser: `https://acm-web-xxxx.vercel.app`.
- [ ] Refresh page on a deep URL (`https://acm-web-xxxx.vercel.app/dashboard`): verify no 404 error occurs (verifies `vercel.json` SPA rewrite).
- **GATE 4 STATUS:** `DEPLOYMENT NOT EXECUTED`

---

## 6. Gate 5: Read-Only Cloud Staging Verification & Smoke Test

### Preconditions:
- Frontend and backend deployed and wired.
- Write feature flags verified to be `false`.

### Verification Protocol:
1. [ ] **Authentication Smoke Test:** Log in with seeded staging credentials; verify token received and stored in `localStorage`.
2. [ ] **Catalog Read Test:** Navigate to `/items` and `/categories`; verify inventory items load from Supabase.
3. [ ] **Stock Balance Read Test:** Navigate to `/inventory`; verify stock balances display calculated available quantities.
4. [ ] **Transaction History Read Test:** Navigate to `/transactions`; verify past transactions list properly.
5. [ ] **Zero Write Capability Audit:**
   - Verify that UI buttons for "Nhập kho", "Xuất kho", "Điều chỉnh" are hidden or disabled due to feature flags.
   - Verify that no direct HTTP POST requests can be made by unauthenticated or non-admin users.
   - If attempting an unauthorized POST: verify backend returns 401 Unauthorized or 403 Forbidden.
- **GATE 5 STATUS:** `DEPLOYMENT NOT EXECUTED`

---

## 7. Gate 6: Operational Handoff & Governance Sign-Off

### Sign-off Checklist:
- [ ] Staging database verified 100% physically isolated from local Dev (5432), Gate B (5433), and S2C (5434).
- [ ] Zero stock POST operations executed against production or pre-live targets.
- [ ] Write feature flags remain locked to `false`.
- [ ] All staging secrets documented in secure vault.
- **GATE 6 STATUS:** `DEPLOYMENT NOT EXECUTED`
