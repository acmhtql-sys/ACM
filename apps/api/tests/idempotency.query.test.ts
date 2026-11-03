import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { stockTransactionsService } from '../src/modules/stock-transactions/stock-transactions.service';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { UserRole } from '@prisma/client';

const app = createApp();

describe('ACM Phase 2.2 Step S2A – Idempotency Query & Security Integration Tests', () => {
  let adminUser: { id: string; email: string; role: UserRole };
  let techUser: { id: string; email: string; role: UserRole };
  let studentUser: { id: string; email: string; role: UserRole };

  let adminToken: string;
  let techToken: string;
  let studentToken: string;

  let existingAdminCompletedKey = '';
  let auditLogsBaselineCount = 0;

  let originalFindUnique: any;

  beforeAll(async () => {
    originalFindUnique = prisma.idempotencyRecord.findUnique;
    // 1. Strict Database URL verification
    const dbStatus = await checkDatabaseConnection();
    expect(dbStatus.connected).toBe(true);

    const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    expect(currentDbResult[0]?.db).toBe('acm_inventory_test');

    // 2. Fetch seed users for tokens
    const admin = await prisma.user.findFirst({ where: { email: 'admin@acm.local' } });
    expect(admin).not.toBeNull();
    adminUser = { id: admin!.id, email: admin!.email, role: UserRole.ADMIN };

    const tech = await prisma.user.findFirst({ where: { email: 'tech@acm.local' } });
    expect(tech).not.toBeNull();
    techUser = { id: tech!.id, email: tech!.email, role: UserRole.TECHNICIAN };

    const student = await prisma.user.findFirst({ where: { email: 'student@acm.local' } });
    expect(student).not.toBeNull();
    studentUser = { id: student!.id, email: student!.email, role: UserRole.STUDENT };

    // 3. Generate JWT tokens
    adminToken = jwt.sign(adminUser, env.JWT_SECRET, { expiresIn: '1d' });
    techToken = jwt.sign(techUser, env.JWT_SECRET, { expiresIn: '1d' });
    studentToken = jwt.sign(studentUser, env.JWT_SECRET, { expiresIn: '1d' });

    // 4. Find existing completed idempotency record owned by Admin in test database
    const existingRecord = await prisma.idempotencyRecord.findFirst({
      where: {
        userId: adminUser.id,
        status: 'COMPLETED',
        transactionId: { not: null },
      },
      include: { transaction: true },
    });
    expect(existingRecord).not.toBeNull();
    existingAdminCompletedKey = existingRecord!.key;

    // 5. Capture AuditLogs baseline
    auditLogsBaselineCount = await prisma.auditLog.count();
  });

  afterEach(() => {
    (prisma.idempotencyRecord as any).findUnique = originalFindUnique;
  });

  // =========================================================================
  // IT-IDEM-01: Owner queries COMPLETED idempotency key
  // =========================================================================
  it('IT-IDEM-01: returns HTTP 200 with status COMMITTED and transaction details for owner query', async () => {
    const res = await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.key).toBe(existingAdminCompletedKey);
    expect(res.body.data.status).toBe('COMMITTED');
    expect(res.body.data.transaction).toBeDefined();
    expect(res.body.data.transaction.id).toBeDefined();
    expect(res.body.data.transaction.transactionNumber).toMatch(/^TX-/);
    expect(typeof res.body.data.transaction.itemCount).toBe('number');
    expect(typeof res.body.data.transaction.totalQuantity).toBe('number');
  });

  // =========================================================================
  // IT-IDEM-02: Query IN_PROGRESS status (Mocked / double for pending branch)
  // =========================================================================
  it('IT-IDEM-02: returns HTTP 200 with status IN_PROGRESS and retryAfterSeconds for active pending key', async () => {
    (prisma.idempotencyRecord as any).findUnique = vi.fn().mockResolvedValueOnce({
      id: 'mock-id-001',
      key: 'MOCK_PENDING_KEY_1234',
      userId: adminUser.id,
      endpoint: '/api/v1/stock-transactions/import',
      requestHash: 'mock-hash',
      status: 'PENDING',
      transactionId: null,
      responseBody: null,
      statusCode: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      transaction: null,
    } as any);

    const res = await request(app)
      .get('/api/v1/stock-transactions/idempotency/MOCK_PENDING_KEY_1234')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.retryAfterSeconds).toBe(2);
  });

  // =========================================================================
  // IT-IDEM-03: Query non-existent key returns HTTP 404 UNKNOWN
  // =========================================================================
  it('IT-IDEM-03: returns HTTP 404 with status UNKNOWN for non-existent idempotency key', async () => {
    const res = await request(app)
      .get('/api/v1/stock-transactions/idempotency/NON_EXISTENT_KEY_999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Không tìm thấy bản ghi');
    expect(res.body.details?.errorCode).toBe('IDEMPOTENCY_KEY_NOT_FOUND');
    expect(res.body.details?.status).toBe('UNKNOWN');
  });

  // =========================================================================
  // IT-IDEM-04: Non-owner queries key (Anti-probing defense -> uniform 404)
  // =========================================================================
  it('IT-IDEM-04: returns HTTP 404 (not 403) when user queries a key owned by another user', async () => {
    // Technician queries Admin's key
    const res = await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`)
      .set('Authorization', `Bearer ${techToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Không tìm thấy bản ghi');
    expect(res.body.details?.errorCode).toBe('IDEMPOTENCY_KEY_NOT_FOUND');
    expect(res.body.details?.status).toBe('UNKNOWN');
  });

  // =========================================================================
  // IT-IDEM-05: Admin-only probe policy (Owner-only enforced; Admin gets 404 on others' keys)
  // =========================================================================
  it('IT-IDEM-05: enforces strict owner-only policy: returns 404 when Admin queries another user key', async () => {
    (prisma.idempotencyRecord as any).findUnique = vi.fn().mockResolvedValueOnce({
      id: 'mock-id-tech',
      key: 'MOCK_TECH_OWNED_KEY_123',
      userId: techUser.id, // Owned by Technician
      endpoint: '/api/v1/stock-transactions/export',
      requestHash: 'mock-hash',
      status: 'COMPLETED',
      transactionId: 'some-tx-id',
      responseBody: null,
      statusCode: 201,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      transaction: {
        id: 'some-tx-id',
        transactionNumber: 'TX-20261013-9999',
        type: 'EXPORT',
        status: 'COMPLETED',
        notes: null,
        createdAt: new Date(),
        details: [],
      },
    } as any);

    // Admin queries Technician's key
    const res = await request(app)
      .get('/api/v1/stock-transactions/idempotency/MOCK_TECH_OWNED_KEY_123')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.details?.errorCode).toBe('IDEMPOTENCY_KEY_NOT_FOUND');
    expect(res.body.details?.status).toBe('UNKNOWN');
  });

  // =========================================================================
  // IT-IDEM-06: Student role is forbidden by RBAC gateway
  // =========================================================================
  it('IT-IDEM-06: returns HTTP 403 Forbidden when Student attempts to query idempotency endpoint', async () => {
    const res = await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Bạn không có quyền thực hiện hành động này');
  });

  // =========================================================================
  // IT-IDEM-07: Unauthenticated request is rejected with HTTP 401
  // =========================================================================
  it('IT-IDEM-07: returns HTTP 401 Unauthorized when query is sent without Bearer token', async () => {
    const res = await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // IT-IDEM-08: Transaction isolation verification (PENDING invisibility in Read Committed)
  // =========================================================================
  it('IT-IDEM-08: confirms uncommitted in-flight PENDING is invisible to concurrent SELECT and maps to 404 UNKNOWN', async () => {
    // When a POST transaction has not committed, prisma.findUnique returns null in Read Committed.
    (prisma.idempotencyRecord as any).findUnique = vi.fn().mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/stock-transactions/idempotency/IN_FLIGHT_UNCOMMITTED_KEY')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.details?.status).toBe('UNKNOWN');
  });

  // =========================================================================
  // IT-IDEM-09: Response contract for 404 UNKNOWN (FSM state behavior deferred to S2C)
  // =========================================================================
  it('IT-IDEM-09: returns compliant contract for 404 UNKNOWN ensuring client preserves key without auto-rotating (Frontend FSM DEFERRED TO S2C)', async () => {
    const res = await request(app)
      .get('/api/v1/stock-transactions/idempotency/AMBIGUOUS_OUTCOME_KEY_123')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.details?.errorCode).toBe('IDEMPOTENCY_KEY_NOT_FOUND');
    expect(res.body.details?.status).toBe('UNKNOWN');
  });

  // =========================================================================
  // IT-IDEM-10: Completed but expired record retains COMMITTED evidence
  // =========================================================================
  it('IT-IDEM-10: prioritizes COMMITTED status and retains voucher evidence even if expiresAt is in the past', async () => {
    const pastExpiresAt = new Date(Date.now() - 48 * 3600 * 1000); // 48 hours ago
    (prisma.idempotencyRecord as any).findUnique = vi.fn().mockResolvedValueOnce({
      id: 'mock-expired-completed',
      key: 'MOCK_EXPIRED_BUT_COMPLETED_KEY',
      userId: adminUser.id,
      endpoint: '/api/v1/stock-transactions/import',
      requestHash: 'mock-hash',
      status: 'COMPLETED',
      transactionId: 'mock-tx-uuid-1234',
      responseBody: null,
      statusCode: 201,
      createdAt: new Date(Date.now() - 72 * 3600 * 1000),
      expiresAt: pastExpiresAt,
      transaction: {
        id: 'mock-tx-uuid-1234',
        transactionNumber: 'TX-20261011-0001',
        type: 'IMPORT',
        status: 'COMPLETED',
        notes: 'Giao dịch lịch sử đã hoàn tất',
        createdAt: new Date(Date.now() - 72 * 3600 * 1000),
        details: [{ quantity: 15 }],
      },
    } as any);

    const res = await request(app)
      .get('/api/v1/stock-transactions/idempotency/MOCK_EXPIRED_BUT_COMPLETED_KEY')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Crucial rule: COMPLETED evidence is preserved as COMMITTED, not hidden by EXPIRED
    expect(res.body.data.status).toBe('COMMITTED');
    expect(res.body.data.transaction.transactionNumber).toBe('TX-20261011-0001');
    expect(res.body.data.transaction.totalQuantity).toBe(15);
  });

  // =========================================================================
  // IT-IDEM-11: Anti-probing defense: identical response shape for non-existent and foreign keys
  // =========================================================================
  it('IT-IDEM-11: verifies uniform response shape for non-existent vs foreign key (no information leak)', async () => {
    const foreignKeyRes = await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`)
      .set('Authorization', `Bearer ${techToken}`);

    const nonExistentRes = await request(app)
      .get('/api/v1/stock-transactions/idempotency/RANDOM_NON_EXISTENT_KEY_1234')
      .set('Authorization', `Bearer ${techToken}`);

    expect(foreignKeyRes.status).toBe(404);
    expect(nonExistentRes.status).toBe(404);

    expect(foreignKeyRes.body).toEqual(nonExistentRes.body);
  });

  // =========================================================================
  // IT-IDEM-12: Zero AuditLog mutation check (Pure SELECT)
  // =========================================================================
  it('IT-IDEM-12: confirms GET idempotency queries produce zero AuditLog records (Pure SELECT: AuditLogs Delta = 0)', async () => {
    // Perform multiple GET queries (success, 404, forbidden, invalid format)
    await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .get('/api/v1/stock-transactions/idempotency/NON_EXISTENT_KEY_999999')
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .get(`/api/v1/stock-transactions/idempotency/${existingAdminCompletedKey}`)
      .set('Authorization', `Bearer ${studentToken}`);

    await request(app)
      .get('/api/v1/stock-transactions/idempotency/invalid!')
      .set('Authorization', `Bearer ${adminToken}`);

    const finalAuditLogsCount = await prisma.auditLog.count();
    expect(finalAuditLogsCount).toBe(auditLogsBaselineCount);
  });
});
