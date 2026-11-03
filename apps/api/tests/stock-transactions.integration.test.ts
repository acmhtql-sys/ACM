import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { stockTransactionsService } from '../src/modules/stock-transactions/stock-transactions.service';
import { generateTransactionNumber } from '../src/modules/inventory/inventory.helpers';
import { StockTransactionType } from '@acm/shared';

const app = createApp();

describe('ACM Phase 2.2 Step 3B.2B Stock Transactions (IMPORT, EXPORT & Idempotency) Integration Test Suite', () => {
  let adminToken = '';
  let managerToken = '';
  let techToken = '';
  let studentToken = '';

  let adminUserId = '';
  let managerUserId = '';

  let activeItem1Id = '';
  let activeItem2Id = '';
  let activeLocation1Id = '';
  let activeLocation2Id = '';

  const suitePrefix = `TEST-STK-${Date.now()}`;
  const trackedLocationIds = new Set<string>();
  const trackedTransactionIds = new Set<string>();

  beforeAll(async () => {
    // 1. Verify isolated test database
    const dbStatus = await checkDatabaseConnection();
    expect(dbStatus.connected).toBe(true);

    const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    expect(currentDbResult[0]?.db).toBe('acm_inventory_test');

    // 2. Authenticate all roles
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acm.local', password: 'ACM@dev2026!' });
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.data.token;
    adminUserId = adminRes.body.data.user.id;

    const managerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@acm.local', password: 'ACM@dev2026!' });
    expect(managerRes.status).toBe(200);
    managerToken = managerRes.body.data.token;
    managerUserId = managerRes.body.data.user.id;

    const techRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'tech@acm.local', password: 'ACM@dev2026!' });
    expect(techRes.status).toBe(200);
    techToken = techRes.body.data.token;

    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@acm.local', password: 'ACM@dev2026!' });
    expect(studentRes.status).toBe(200);
    studentToken = studentRes.body.data.token;

    // 3. Retrieve sample items and locations (specifically permanent seed items)
    const items = await prisma.item.findMany({
      where: { code: { in: ['ARD-UNO-R3', 'ESP32-WROOM-32'] }, isActive: true },
      orderBy: { code: 'asc' },
    });
    expect(items.length).toBe(2);
    activeItem1Id = items[0].id;
    activeItem2Id = items[1].id;

    const locations = await prisma.location.findMany({
      where: { code: { in: ['WH-MAIN', 'RACK-A'] }, isActive: true },
      orderBy: { code: 'asc' },
    });
    expect(locations.length).toBe(2);
    activeLocation1Id = locations[0].id;
    activeLocation2Id = locations[1].id;
  });

  afterAll(async () => {
    // Cleanup any records created with suite prefix
    try {
      // 0. Safety assertion: NEVER teardown or mutate non-test database
      const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
      if (currentDbResult[0]?.db !== 'acm_inventory_test') {
        throw new Error(`CRITICAL SAFETY ABORT: Attempted teardown on non-test database: ${currentDbResult[0]?.db}`);
      }

      // 1. Discover all test locations created for this suite
      const suiteLocations = await prisma.location.findMany({
        where: {
          OR: [
            { code: { startsWith: suitePrefix } },
            trackedLocationIds.size > 0 ? { id: { in: Array.from(trackedLocationIds) } } : undefined,
          ].filter(Boolean) as any,
        },
        select: { id: true },
      });
      const allSuiteLocationIds = Array.from(new Set([
        ...Array.from(trackedLocationIds),
        ...suiteLocations.map((l) => l.id),
      ]));

      // 2. Discover all transactions matching notes or tracked or referencing suite locations
      const suiteTxs = await prisma.stockTransaction.findMany({
        where: {
          OR: [
            { notes: { contains: suitePrefix } },
            trackedTransactionIds.size > 0 ? { id: { in: Array.from(trackedTransactionIds) } } : undefined,
            allSuiteLocationIds.length > 0
              ? {
                  details: {
                    some: {
                      OR: [
                        { locationId: { in: allSuiteLocationIds } },
                        { toLocationId: { in: allSuiteLocationIds } },
                      ],
                    },
                  },
                }
              : undefined,
          ].filter(Boolean) as any,
        },
        select: { id: true },
      });
      const allTxIds = Array.from(new Set([
        ...Array.from(trackedTransactionIds),
        ...suiteTxs.map((t) => t.id),
      ]));

      // 3. Delete idempotency records (must precede transactions due to FK RESTRICT)
      await prisma.idempotencyRecord.deleteMany({
        where: {
          OR: [
            { key: { startsWith: suitePrefix } },
            allTxIds.length > 0 ? { transactionId: { in: allTxIds } } : undefined,
          ].filter(Boolean) as any,
        },
      });

      // 4. Delete details
      if (allTxIds.length > 0 || allSuiteLocationIds.length > 0) {
        await prisma.stockTransactionDetail.deleteMany({
          where: {
            OR: [
              allTxIds.length > 0 ? { stockTransactionId: { in: allTxIds } } : undefined,
              allSuiteLocationIds.length > 0 ? { locationId: { in: allSuiteLocationIds } } : undefined,
              allSuiteLocationIds.length > 0 ? { toLocationId: { in: allSuiteLocationIds } } : undefined,
            ].filter(Boolean) as any,
          },
        });
      }

      // 5. Delete movements
      if (allTxIds.length > 0 || allSuiteLocationIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: {
            OR: [
              allTxIds.length > 0 ? { referenceId: { in: allTxIds } } : undefined,
              allSuiteLocationIds.length > 0 ? { locationId: { in: allSuiteLocationIds } } : undefined,
              { reason: { contains: suitePrefix } },
            ].filter(Boolean) as any,
          },
        });
      }

      // 6. Delete audit logs
      if (allTxIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entityId: { in: allTxIds },
          },
        });
      }

      // 7. Delete transactions
      if (allTxIds.length > 0) {
        await prisma.stockTransaction.deleteMany({
          where: {
            id: { in: allTxIds },
          },
        });
      }

      // 8. Delete custom test balances on suite locations
      if (allSuiteLocationIds.length > 0) {
        await prisma.stockBalance.deleteMany({
          where: { locationId: { in: allSuiteLocationIds } },
        });

        // 9. Delete custom test locations (children first, then parents)
        await prisma.location.deleteMany({
          where: { id: { in: allSuiteLocationIds }, parentId: { not: null } },
        });
        await prisma.location.deleteMany({
          where: { id: { in: allSuiteLocationIds } },
        });
      }

      // 10. Delete custom test items created during suite
      await prisma.item.deleteMany({
        where: { code: { startsWith: suitePrefix } },
      });
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  });

  // =========================================================================
  // 1. RBAC & VALIDATION CHECKS
  // =========================================================================
  describe('RBAC & Validation for Import and Export', () => {
    it('blocks unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .send({ items: [] });
      expect(res.status).toBe(401);
    });

    it('blocks TECHNICIAN from import with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${techToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-tech`)
        .send({
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });
      expect(res.status).toBe(403);
    });

    it('blocks STUDENT from export with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-student`)
        .send({
          reason: 'Học tập nghiên cứu môn thực hành',
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 5, reason: 'Học tập' }],
        });
      expect(res.status).toBe(403);
    });

    it('rejects request missing Idempotency-Key header with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Idempotency-Key.*bắt buộc/);
    });

    it('rejects request with invalid Idempotency-Key format (< 8 chars) with 400', async () => {
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'short')
        .send({
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Định dạng 'Idempotency-Key' không hợp lệ/);
    });

    it('rejects export request missing reason with 422 Unprocessable Entity (even when notes is provided)', async () => {
      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-val-no-reason`)
        .send({
          notes: 'Chỉ có notes mà không có reason',
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 5 }],
        });
      expect(res.status).toBe(422);
    });

    it('rejects export request with whitespace-only or too short reason (< 3 chars) with 422', async () => {
      const res1 = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-val-ws-reason`)
        .send({
          reason: '   ',
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 5 }],
        });
      expect(res1.status).toBe(422);

      const res2 = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-val-short-reason`)
        .send({
          reason: 'AB',
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 5 }],
        });
      expect(res2.status).toBe(422);
    });
  });

  // =========================================================================
  // 2. IMPORT STOCK BUSINESS LOGIC
  // =========================================================================
  describe('POST /api/v1/stock-transactions/import', () => {
    it('TC-IMP-01: successfully imports a single item line, updates onHand and logs movements', async () => {
      const key = `${suitePrefix}-imp-01`;
      const qty = 15;

      // Check balance before
      const balanceBefore = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: activeLocation1Id } },
      });
      const initialOnHand = balanceBefore ? balanceBefore.onHand : 0;

      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} single import`,
          items: [
            {
              itemId: activeItem1Id,
              locationId: activeLocation1Id,
              quantity: qty,
              unitCost: 25000,
              notes: `${suitePrefix} line notes`,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.headers['x-cache-lookup']).toBe('MISS');
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('IMPORT');
      expect(res.body.data.itemCount).toBe(1);
      expect(res.body.data.totalQuantity).toBe(qty);

      // Verify DB balance incremented
      const balanceAfter = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: activeLocation1Id } },
      });
      expect(balanceAfter!.onHand).toBe(initialOnHand + qty);

      // Verify StockMovement created
      const movement = await prisma.stockMovement.findFirst({
        where: { referenceId: res.body.data.id },
      });
      expect(movement).toBeDefined();
      expect(movement!.type).toBe('IMPORT');
      expect(movement!.quantityDelta).toBe(qty);
      expect(movement!.onHandBefore).toBe(initialOnHand);
      expect(movement!.onHandAfter).toBe(initialOnHand + qty);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: res.body.data.id, action: 'IMPORT_STOCK' },
      });
      expect(audit).toBeDefined();
    });

    it('TC-IMP-02: successfully imports multi-line batch across different items', async () => {
      const key = `${suitePrefix}-imp-02`;

      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} multi-line import`,
          items: [
            { itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 },
            { itemId: activeItem2Id, locationId: activeLocation1Id, quantity: 20 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.itemCount).toBe(2);
      expect(res.body.data.totalQuantity).toBe(30);
    });

    it('TC-IMP-03: creates a new StockBalance when importing to a location that had no balance yet', async () => {
      // Create a dedicated new test location
      const newLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-NEW-BIN`,
          name: 'Khay Mới Tạo',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      const key = `${suitePrefix}-imp-03`;
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} new balance import`,
          items: [{ itemId: activeItem1Id, locationId: newLoc.id, quantity: 25 }],
        });

      expect(res.status).toBe(201);

      // Verify balance was created
      const balance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: newLoc.id } },
      });
      expect(balance).not.toBeNull();
      expect(balance!.onHand).toBe(25);
      expect(balance!.reserved).toBe(0);
    });

    it('TC-IMP-04: rolls back entire transaction if any line references non-existent item', async () => {
      const key = `${suitePrefix}-imp-04`;
      const fakeItemId = '00000000-0000-0000-0000-000000000001';

      const balanceBefore = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: activeLocation1Id } },
      });
      const initialOnHand = balanceBefore ? balanceBefore.onHand : 0;

      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} invalid line import`,
          items: [
            { itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 50 },
            { itemId: fakeItemId, locationId: activeLocation1Id, quantity: 10 },
          ],
        });

      expect(res.status).toBe(404);

      // Verify line 1 was NOT applied (atomic rollback)
      const balanceAfter = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: activeLocation1Id } },
      });
      expect(balanceAfter!.onHand).toBe(initialOnHand);
    });
  });

  // =========================================================================
  // 3. EXPORT STOCK BUSINESS LOGIC
  // =========================================================================
  describe('POST /api/v1/stock-transactions/export', () => {
    it('TC-EXP-01: successfully exports stock and decrements onHand', async () => {
      // First ensure available stock is at least 20
      await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-setup-exp01`)
        .send({
          notes: `${suitePrefix} setup`,
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 20 }],
        });

      const balanceBefore = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: activeLocation1Id } },
      });
      const onHandBefore = balanceBefore!.onHand;

      const key = `${suitePrefix}-exp-01`;
      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          reason: 'Xuất cấp cho phòng thực hành',
          notes: `${suitePrefix} valid export`,
          items: [
            {
              itemId: activeItem1Id,
              locationId: activeLocation1Id,
              quantity: 8,
              reason: 'Xuất cấp cho phòng thực hành',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('EXPORT');
      expect(res.body.data.totalQuantity).toBe(8);

      const balanceAfter = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: activeLocation1Id } },
      });
      expect(balanceAfter!.onHand).toBe(onHandBefore - 8);

      // Verify StockMovement has negative delta
      const movement = await prisma.stockMovement.findFirst({
        where: { referenceId: res.body.data.id },
      });
      expect(movement).toBeDefined();
      expect(movement!.type).toBe('EXPORT');
      expect(movement!.quantityDelta).toBe(-8);
    });

    it('TC-EXP-02: exports exact available stock down to 0', async () => {
      // Create isolated test location
      const isolatedLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-EXACT-BIN`,
          name: 'Khay Test Exact',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      // Import exactly 7
      await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-setup-exact`)
        .send({
          notes: `${suitePrefix} setup exact`,
          items: [{ itemId: activeItem1Id, locationId: isolatedLoc.id, quantity: 7 }],
        });

      // Export exactly 7
      const key = `${suitePrefix}-exp-exact`;
      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          reason: 'Xuất toàn bộ tồn kho',
          notes: `${suitePrefix} exact export`,
          items: [
            {
              itemId: activeItem1Id,
              locationId: isolatedLoc.id,
              quantity: 7,
              reason: 'Xuất toàn bộ tồn kho',
            },
          ],
        });

      expect(res.status).toBe(201);

      const balance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: isolatedLoc.id } },
      });
      expect(balance!.onHand).toBe(0);
    });

    it('TC-EXP-03: rejects export exceeding available stock with 400 Bad Request', async () => {
      const isolatedLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-OVERSOLD-BIN`,
          name: 'Khay Test Oversold',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      // Import 5
      await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-setup-oversold`)
        .send({
          notes: `${suitePrefix} setup oversold`,
          items: [{ itemId: activeItem1Id, locationId: isolatedLoc.id, quantity: 5 }],
        });

      // Attempt to export 6 (exceeds available 5)
      const key = `${suitePrefix}-exp-oversold`;
      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          reason: 'Cố ý xuất vượt tồn',
          notes: `${suitePrefix} oversold attempt`,
          items: [
            {
              itemId: activeItem1Id,
              locationId: isolatedLoc.id,
              quantity: 6,
              reason: 'Cố ý xuất vượt tồn',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/không đủ tồn kho khả dụng để xuất/);

      // Verify balance remains 5
      const balance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: isolatedLoc.id } },
      });
      expect(balance!.onHand).toBe(5);
    });

    it('TC-EXP-04: rejects export when item or location is inactive with 400', async () => {
      // Create deactivated location
      const inactiveLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-INACTIVE-BIN`,
          name: 'Khay Đã Đóng',
          type: 'BIN',
          parentId: activeLocation1Id,
          isActive: false,
        },
      });

      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-exp-inactive-loc`)
        .send({
          reason: 'Xuất kho vị trí inactive',
          items: [
            {
              itemId: activeItem1Id,
              locationId: inactiveLoc.id,
              quantity: 1,
              reason: 'Xuất kho vị trí inactive',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/đã bị vô hiệu hóa/);
    });

    it('TC-EXP-05: rolls back entire multi-line export voucher if one line lacks stock', async () => {
      const locA = await prisma.location.create({
        data: { code: `${suitePrefix}-RB-A`, name: 'Bin A', type: 'BIN', parentId: activeLocation1Id },
      });
      const locB = await prisma.location.create({
        data: { code: `${suitePrefix}-RB-B`, name: 'Bin B', type: 'BIN', parentId: activeLocation1Id },
      });
      trackedLocationIds.add(locA.id);
      trackedLocationIds.add(locB.id);

      // Import 10 to locA, but only 2 to locB
      const setupRes = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-setup-rb`)
        .send({
          notes: `${suitePrefix} setup rollback`,
          items: [
            { itemId: activeItem1Id, locationId: locA.id, quantity: 10 },
            { itemId: activeItem1Id, locationId: locB.id, quantity: 2 },
          ],
        });
      if (setupRes.body?.data?.id) {
        trackedTransactionIds.add(setupRes.body.data.id);
      }

      // Try export: 5 from locA (available=10, OK) and 5 from locB (available=2, FAIL)
      const res = await request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-exp-multi-fail`)
        .send({
          reason: 'Xuất nhiều dòng kiểm tra rollback',
          items: [
            { itemId: activeItem1Id, locationId: locA.id, quantity: 5, reason: 'Line A' },
            { itemId: activeItem1Id, locationId: locB.id, quantity: 5, reason: 'Line B' },
          ],
        });

      expect(res.status).toBe(400);

      // Verify locA was NOT deducted (atomic rollback of whole document)
      const balanceA = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: locA.id } },
      });
      expect(balanceA!.onHand).toBe(10);
    });
  });

  // =========================================================================
  // 4. IDEMPOTENCY INTEGRATION & LIFECYCLE
  // =========================================================================
  describe('Idempotency Key Verification & Lifecycle', () => {
    it('TC-IDEM-01: replaying same key and same payload returns cached response with X-Cache-Lookup: HIT without changing stock twice', async () => {
      const key = `${suitePrefix}-idem-replay`;
      const loc = await prisma.location.create({
        data: { code: `${suitePrefix}-IDEM-BIN`, name: 'Bin Idem', type: 'BIN', parentId: activeLocation1Id },
      });

      // Request 1: Fresh execution
      const res1 = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} replay test`,
          items: [{ itemId: activeItem1Id, locationId: loc.id, quantity: 10 }],
        });

      expect(res1.status).toBe(201);
      expect(res1.headers['x-cache-lookup']).toBe('MISS');
      const txNumber = res1.body.data.transactionNumber;

      // Request 2: Exact same key and payload
      const res2 = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} replay test`,
          items: [{ itemId: activeItem1Id, locationId: loc.id, quantity: 10 }],
        });

      expect(res2.status).toBe(201);
      expect(res2.headers['x-cache-lookup']).toBe('HIT');
      expect(res2.body.data.transactionNumber).toBe(txNumber);

      // CRITICAL ASSERTION: onHand must be 10, NOT 20!
      const balance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: loc.id } },
      });
      expect(balance!.onHand).toBe(10);
    });

    it('TC-IDEM-02: rejects same key with modified payload with 409 Conflict (Payload Mismatch)', async () => {
      const key = `${suitePrefix}-idem-mismatch`;

      // Request 1: quantity = 10
      const firstRes = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} idem mismatch 1`,
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });
      if (firstRes.body?.data?.id) {
        trackedTransactionIds.add(firstRes.body.data.id);
      }

      // Request 2: SAME key, but quantity changed to 20
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} idem mismatch 2`,
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 20 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/nội dung yêu cầu \(payload\) đã bị thay đổi/);
    });

    it('TC-IDEM-03: rejects same key from a different user with 409 Conflict (Tenant Mismatch)', async () => {
      const key = `${suitePrefix}-idem-tenant`;

      // Request 1 by ADMIN
      const firstRes = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} idem tenant 1`,
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });
      if (firstRes.body?.data?.id) {
        trackedTransactionIds.add(firstRes.body.data.id);
      }

      // Request 2 with SAME key by LAB_MANAGER
      const res = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} idem tenant 2`,
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/người dùng hoặc thao tác khác/);
    });

    it('TC-IDEM-04: allows retrying with same key after initial transaction failed and rolled back', async () => {
      const key = `${suitePrefix}-idem-retry-failed`;
      const fakeItemId = '00000000-0000-0000-0000-000000000002';

      // Attempt 1: Fails due to 404 fake item
      const res1 = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          items: [{ itemId: fakeItemId, locationId: activeLocation1Id, quantity: 10 }],
        });
      expect(res1.status).toBe(404);

      // Attempt 2: Fixed payload with valid active item using SAME key
      const res2 = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} retry success`,
          items: [{ itemId: activeItem1Id, locationId: activeLocation1Id, quantity: 10 }],
        });

      expect(res2.status).toBe(201);
      expect(res2.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 5. CONCURRENCY STRESS TEST (Available = 5, 10 concurrent exports of 5)
  // =========================================================================
  describe('Concurrency Stress Testing (Overselling Prevention)', () => {
    it('TC-CONC-01: Available = 5, 10 simultaneous export requests of 5 -> exactly 1 succeeds, total exported = 5, no negative balance', async () => {
      // 1. Setup isolated location with exactly onHand = 5
      const stressLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-STRESS-BIN`,
          name: 'Khay Stress Concurrency',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-stress-import`)
        .send({
          notes: `${suitePrefix} stress setup`,
          items: [{ itemId: activeItem1Id, locationId: stressLoc.id, quantity: 5 }],
        });

      const setupBalance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: stressLoc.id } },
      });
      expect(setupBalance!.onHand).toBe(5);

      // 2. Dispatch 10 concurrent requests to export 5 with distinct keys
      const promises = Array.from({ length: 10 }).map((_, i) =>
        request(app)
          .post('/api/v1/stock-transactions/export')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-stress-exp-${i}`)
          .send({
            reason: `Concurrent stress export attempt ${i}`,
            notes: `${suitePrefix} stress export attempt ${i}`,
            items: [
              {
                itemId: activeItem1Id,
                locationId: stressLoc.id,
                quantity: 5,
                reason: `Concurrent stress export attempt ${i}`,
              },
            ],
          })
      );

      const responses = await Promise.all(promises);

      const successCount = responses.filter((r) => r.status === 201).length;
      const failedCount = responses.filter((r) => r.status === 400).length;

      // Exactly 1 must succeed and 9 must fail with 400 Insufficient Stock
      expect(successCount).toBe(1);
      expect(failedCount).toBe(9);

      // Final balance must be EXACTLY 0, never negative!
      const finalBalance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: stressLoc.id } },
      });
      expect(finalBalance!.onHand).toBe(0);

      // Check number of successful export transactions for this location in DB
      const movements = await prisma.stockMovement.findMany({
        where: {
          locationId: stressLoc.id,
          type: 'EXPORT',
        },
      });
      expect(movements.length).toBe(1);
      expect(movements[0].quantityDelta).toBe(-5);
    });

    it('TC-CONC-IDEM-01: two simultaneous requests with same Idempotency-Key and payload create only 1 transaction and update balance once', async () => {
      const concIdemLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-CONC-IDEM-BIN`,
          name: 'Khay Test Idem Concurrency',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      const sameKey = `${suitePrefix}-same-key-conc`;
      const payload = {
        notes: `${suitePrefix} concurrent identical requests`,
        items: [{ itemId: activeItem1Id, locationId: concIdemLoc.id, quantity: 15 }],
      };

      // Dispatch 2 simultaneous requests with identical key and payload
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/v1/stock-transactions/import')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', sameKey)
          .send(payload),
        request(app)
          .post('/api/v1/stock-transactions/import')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', sameKey)
          .send(payload),
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(201);
      statuses.forEach((s) => expect([201, 409]).toContain(s));

      // Exactly 1 stock transaction created
      const txCount = await prisma.stockTransaction.count({
        where: { notes: `${suitePrefix} concurrent identical requests` },
      });
      expect(txCount).toBe(1);

      // Balance incremented exactly once (15, NOT 30!)
      const balance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: concIdemLoc.id } },
      });
      expect(balance!.onHand).toBe(15);
    });

    it('TC-CONC-NEW-BAL: two concurrent IMPORT requests for non-existent StockBalance do not duplicate and sum correctly', async () => {
      const newBalLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-NEW-BAL-BIN`,
          name: 'Khay Test New Balance Concurrency',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      // Verify balance truly does not exist yet
      const initialBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: newBalLoc.id } },
      });
      expect(initialBal).toBeNull();

      // Dispatch 2 concurrent imports with distinct keys for 10 and 15
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/stock-transactions/import')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-newbal-1`)
          .send({
            notes: `${suitePrefix} newbal import 1`,
            items: [{ itemId: activeItem1Id, locationId: newBalLoc.id, quantity: 10 }],
          }),
        request(app)
          .post('/api/v1/stock-transactions/import')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-newbal-2`)
          .send({
            notes: `${suitePrefix} newbal import 2`,
            items: [{ itemId: activeItem1Id, locationId: newBalLoc.id, quantity: 15 }],
          }),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Verify only ONE balance record exists for this item/location
      const balances = await prisma.stockBalance.findMany({
        where: { itemId: activeItem1Id, locationId: newBalLoc.id },
      });
      expect(balances.length).toBe(1);
      expect(balances[0].onHand).toBe(25); // 10 + 15
    });

    it('TC-CONC-MULTI-EXP: concurrent multi-line export with intersecting items prevents overselling and partial vouchers', async () => {
      const multiLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-MULTI-EXP-BIN`,
          name: 'Khay Test Multi-line Concurrency',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      // Import 10 of Item1 and 10 of Item2
      await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-setup-multi-1`)
        .send({
          notes: `${suitePrefix} multi setup`,
          items: [
            { itemId: activeItem1Id, locationId: multiLoc.id, quantity: 10 },
            { itemId: activeItem2Id, locationId: multiLoc.id, quantity: 10 },
          ],
        });

      // Dispatch 2 concurrent requests, each demanding 6 of Item1 and 6 of Item2 (sum needed = 12 each > 10 available)
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/v1/stock-transactions/export')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-multi-exp-A`)
          .send({
            reason: 'Xuất đa dòng đồng thời kịch bản A',
            notes: `${suitePrefix} multi exp A`,
            items: [
              { itemId: activeItem1Id, locationId: multiLoc.id, quantity: 6 },
              { itemId: activeItem2Id, locationId: multiLoc.id, quantity: 6 },
            ],
          }),
        request(app)
          .post('/api/v1/stock-transactions/export')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-multi-exp-B`)
          .send({
            reason: 'Xuất đa dòng đồng thời kịch bản B',
            notes: `${suitePrefix} multi exp B`,
            items: [
              { itemId: activeItem1Id, locationId: multiLoc.id, quantity: 6 },
              { itemId: activeItem2Id, locationId: multiLoc.id, quantity: 6 },
            ],
          }),
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      // Remaining stock must be exactly 4 of each (10 - 6 = 4), never negative or partial!
      const bal1 = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: multiLoc.id } },
      });
      const bal2 = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem2Id, locationId: multiLoc.id } },
      });
      expect(bal1!.onHand).toBe(4);
      expect(bal2!.onHand).toBe(4);
    });

    it('TC-TXNUM-01: generates unique transaction numbers conforming to business prefix IMP-/EXP- without collision', async () => {
      const count = 30;
      const promises = Array.from({ length: count }).map(() =>
        generateTransactionNumber(StockTransactionType.IMPORT)
      );
      const results = await Promise.all(promises);

      const uniqueSet = new Set(results);
      expect(uniqueSet.size).toBe(count);

      // Verify all adhere to IMP-YYYYMMDD-XXXX format
      for (const num of results) {
        expect(num).toMatch(/^IMP-\d{8}-[A-Z0-9]{4}$/);
      }
    });
  });

  // =========================================================================
  // 6. ATOMICITY VERIFICATION (SIMULATE AUDITLOG FAILURE)
  // =========================================================================
  describe('Atomicity & Rollback Verification', () => {
    it('TC-ATOM-01: completely rolls back Balance, Transaction, Detail, Movement and Idempotency when AuditLog fails in Service', async () => {
      const atomLoc = await prisma.location.create({
        data: {
          code: `${suitePrefix}-ATOM-BIN`,
          name: 'Khay Test Atomicity',
          type: 'BIN',
          parentId: activeLocation1Id,
        },
      });

      const invalidUserId = '00000000-0000-0000-0000-000000000000';
      const key = `${suitePrefix}-atom-fail`;

      // Call service directly with invalidUserId to trigger foreign key violation during AuditLog creation
      let caughtError: any = null;
      try {
        await stockTransactionsService.importStock(
          {
            notes: `${suitePrefix} atomicity rollback`,
            items: [{ itemId: activeItem1Id, locationId: atomLoc.id, quantity: 30 }],
          },
          invalidUserId, // Foreign key failure in auditLog.create
          key
        );
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();

      // 1. Balance must NOT exist
      const balance = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: atomLoc.id } },
      });
      expect(balance).toBeNull();

      // 2. Transaction must NOT exist
      const tx = await prisma.stockTransaction.findFirst({
        where: { notes: `${suitePrefix} atomicity rollback` },
      });
      expect(tx).toBeNull();

      // 3. Movement must NOT exist
      const movement = await prisma.stockMovement.findFirst({
        where: { locationId: atomLoc.id },
      });
      expect(movement).toBeNull();

      // 4. IdempotencyRecord must NOT exist with COMPLETED
      const record = await prisma.idempotencyRecord.findUnique({
        where: { key },
      });
      expect(record).toBeNull();
    });
  });
});
