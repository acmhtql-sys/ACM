import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { stockTransactionsService } from '../src/modules/stock-transactions/stock-transactions.service';
import { StockTransactionType } from '@acm/shared';

const app = createApp();

describe('ACM Phase 2.2 Step 3B.2C Stock Transactions (TRANSFER, ADJUSTMENT, Idempotency & Concurrency) Integration Test Suite', () => {
  let adminToken = '';
  let managerToken = '';
  let techToken = '';
  let studentToken = '';

  let activeItem1Id = '';
  let activeItem2Id = '';
  let parentLocationId = '';

  const suitePrefix = `TEST-3B2C-${Date.now()}`;
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

    const managerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@acm.local', password: 'ACM@dev2026!' });
    expect(managerRes.status).toBe(200);
    managerToken = managerRes.body.data.token;

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

    const parentLoc = await prisma.location.findFirst({
      where: { code: 'WH-MAIN', isActive: true },
    });
    expect(parentLoc).not.toBeNull();
    parentLocationId = parentLoc!.id;
  });

  afterAll(async () => {
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
            OR: [
              { entityId: { in: allTxIds } },
              { newValue: { path: ['code'], string_contains: suitePrefix } },
            ],
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

  // Helper to create dedicated test locations
  async function createTestBin(suffix: string, isActive = true) {
    const loc = await prisma.location.create({
      data: {
        code: `${suitePrefix}-${suffix}`,
        name: `Bin Test ${suffix}`,
        type: 'BIN',
        parentId: parentLocationId,
        isActive,
      },
    });
    trackedLocationIds.add(loc.id);
    return loc;
  }

  // =========================================================================
  // PHẦN A & B: STOCK TRANSFER INTEGRATION TESTS
  // =========================================================================
  describe('Stock Transfer (POST /api/v1/stock-transactions/transfer)', () => {
    it('TC-XFER-01: executes transfer successfully, conserves total stock, creates paired movements and details', async () => {
      const srcLoc = await createTestBin('XFER-SRC-1');
      const dstLoc = await createTestBin('XFER-DST-1');

      // 1. Initial import of 50 units into srcLoc
      const importRes = await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-init-import`)
        .send({
          notes: `${suitePrefix} init import`,
          items: [{ itemId: activeItem1Id, locationId: srcLoc.id, quantity: 50 }],
        });
      expect(importRes.status).toBe(201);

      // 2. Transfer 20 units from srcLoc to dstLoc
      const transferRes = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-01`)
        .send({
          notes: `${suitePrefix} transfer 20 units`,
          reason: 'Điều chuyển sang kệ phụ',
          items: [
            {
              itemId: activeItem1Id,
              fromLocationId: srcLoc.id,
              toLocationId: dstLoc.id,
              quantity: 20,
              notes: 'Chuyển 20 LED',
            },
          ],
        });

      expect(transferRes.status).toBe(201);
      expect(transferRes.body.success).toBe(true);
      expect(transferRes.body.data.type).toBe('TRANSFER');
      expect(transferRes.body.data.itemCount).toBe(1);
      expect(transferRes.body.data.totalQuantity).toBe(20);

      const txId = transferRes.body.data.id;

      // 3. Verify stock balances (Conservation invariant: 30 + 20 = 50)
      const srcBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      const dstBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: dstLoc.id } },
      });

      expect(srcBal!.onHand).toBe(30);
      expect(dstBal!.onHand).toBe(20);
      expect(srcBal!.onHand + dstBal!.onHand).toBe(50);

      // 4. Verify StockTransactionDetail (toLocationId populated)
      const details = await prisma.stockTransactionDetail.findMany({
        where: { stockTransactionId: txId },
      });
      expect(details.length).toBe(1);
      expect(details[0].itemId).toBe(activeItem1Id);
      expect(details[0].locationId).toBe(srcLoc.id);
      expect(details[0].toLocationId).toBe(dstLoc.id);
      expect(details[0].quantity).toBe(20);

      // 5. Verify paired StockMovements
      const movements = await prisma.stockMovement.findMany({
        where: { referenceId: txId },
        orderBy: { quantityDelta: 'asc' },
      });
      expect(movements.length).toBe(2);

      // Source movement: negative delta
      expect(movements[0].locationId).toBe(srcLoc.id);
      expect(movements[0].quantityDelta).toBe(-20);
      expect(movements[0].onHandBefore).toBe(50);
      expect(movements[0].onHandAfter).toBe(30);
      expect(movements[0].type).toBe(StockTransactionType.TRANSFER);

      // Destination movement: positive delta
      expect(movements[1].locationId).toBe(dstLoc.id);
      expect(movements[1].quantityDelta).toBe(20);
      expect(movements[1].onHandBefore).toBe(0);
      expect(movements[1].onHandAfter).toBe(20);
      expect(movements[1].type).toBe(StockTransactionType.TRANSFER);

      // 6. Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: txId, action: 'STOCK_TRANSFER' },
      });
      expect(audit).toBeDefined();
    });

    it('TC-XFER-02: creates destination balance row safely if it did not exist prior to transfer', async () => {
      const srcLoc = await createTestBin('XFER-SRC-2');
      const dstLoc = await createTestBin('XFER-DST-2');

      // Setup initial stock at source
      await request(app)
        .post('/api/v1/stock-transactions/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-init-import-2`)
        .send({
          notes: `${suitePrefix} init import 2`,
          items: [{ itemId: activeItem2Id, locationId: srcLoc.id, quantity: 15 }],
        });

      // Verify destination balance row definitely does not exist
      const dstBalBefore = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem2Id, locationId: dstLoc.id } },
      });
      expect(dstBalBefore).toBeNull();

      // Transfer 5 units
      const res = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-02`)
        .send({
          notes: `${suitePrefix} transfer 5 to fresh dst`,
          reason: 'Cấp phát sang vị trí mới',
          fromLocationId: srcLoc.id,
          toLocationId: dstLoc.id,
          items: [{ itemId: activeItem2Id, quantity: 5 }],
        });

      expect(res.status).toBe(201);

      // Verify destination balance row now exists with correct values
      const dstBalAfter = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem2Id, locationId: dstLoc.id } },
      });
      expect(dstBalAfter).not.toBeNull();
      expect(dstBalAfter!.onHand).toBe(5);
      expect(dstBalAfter!.reserved).toBe(0);
      expect(dstBalAfter!.quarantined).toBe(0);
      expect(dstBalAfter!.kitAllocated).toBe(0);
      expect(dstBalAfter!.borrowed).toBe(0);
    });

    it('TC-XFER-03: rejects transfer when requested quantity exceeds available stock at source', async () => {
      const srcLoc = await createTestBin('XFER-SRC-3');
      const dstLoc = await createTestBin('XFER-DST-3');

      // Create source balance with onHand=10, reserved=7 -> available=3
      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: srcLoc.id,
          onHand: 10,
          reserved: 7,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      // Attempt to transfer 4 units (available is only 3)
      const res = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-03`)
        .send({
          notes: `${suitePrefix} over-transfer attempt`,
          reason: 'Điều chuyển vượt khả dụng',
          items: [
            {
              itemId: activeItem1Id,
              fromLocationId: srcLoc.id,
              toLocationId: dstLoc.id,
              quantity: 4,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/không đủ tồn kho khả dụng/i);

      // Verify source balance remains unchanged
      const srcBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      expect(srcBal!.onHand).toBe(10);
    });

    it('TC-XFER-04: rejects transfer when fromLocationId is identical to toLocationId', async () => {
      const loc = await createTestBin('XFER-SAME-LOC');

      const res = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-04`)
        .send({
          notes: `${suitePrefix} same location transfer`,
          reason: 'Chuyển cùng vị trí',
          fromLocationId: loc.id,
          toLocationId: loc.id,
          items: [{ itemId: activeItem1Id, quantity: 5 }],
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.message + JSON.stringify(res.body.details || '')).toMatch(/không được trùng nhau/i);
    });

    it('TC-XFER-05: rejects transfer when item or location is inactive', async () => {
      const srcLoc = await createTestBin('XFER-INACTIVE-SRC', false); // inactive
      const dstLoc = await createTestBin('XFER-ACTIVE-DST', true);

      const res = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-05`)
        .send({
          notes: `${suitePrefix} transfer inactive loc`,
          reason: 'Chuyển từ kho khóa',
          fromLocationId: srcLoc.id,
          toLocationId: dstLoc.id,
          items: [{ itemId: activeItem1Id, quantity: 2 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vô hiệu hóa/i);
    });

    it('TC-XFER-06: verifies ACM Available formula (Available = OnHand - Reserved - Quarantined - KitAllocated, Borrowed NOT deducted again)', async () => {
      const srcLoc = await createTestBin('XFER-SRC-AVAIL');
      const dstLoc = await createTestBin('XFER-DST-AVAIL');

      // Setup initial stock: OnHand = 20, Reserved = 3, Quarantined = 2, KitAllocated = 1, Borrowed = 5
      // Expected Available = 20 - 3 - 2 - 1 = 14 (if Borrowed were deducted, it would only be 9)
      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: srcLoc.id,
          onHand: 20,
          reserved: 3,
          quarantined: 2,
          kitAllocated: 1,
          borrowed: 5,
        },
      });

      // 1. Attempt transfer of 15 (exceeds Available = 14) -> must be rejected with 400
      const resReject = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-avail-15`)
        .send({
          notes: `${suitePrefix} attempt transfer 15 exceeding available`,
          reason: 'Kiểm tra từ chối khi vượt Available',
          fromLocationId: srcLoc.id,
          toLocationId: dstLoc.id,
          items: [{ itemId: activeItem1Id, quantity: 15 }],
        });

      expect(resReject.status).toBe(400);
      expect(resReject.body.message).toMatch(/không đủ tồn kho khả dụng để điều chuyển \(Khả dụng: 14, Yêu cầu chuyển: 15\)/i);

      // Verify source balance remains unchanged
      const srcBalPre = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      expect(srcBalPre!.onHand).toBe(20);
      expect(srcBalPre!.reserved).toBe(3);
      expect(srcBalPre!.quarantined).toBe(2);
      expect(srcBalPre!.kitAllocated).toBe(1);
      expect(srcBalPre!.borrowed).toBe(5);

      // 2. Attempt transfer of 12 (12 <= Available 14, but > 9 if Borrowed were double-subtracted) -> must succeed!
      const resSuccess = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-xfer-avail-12`)
        .send({
          notes: `${suitePrefix} transfer 12 units`,
          reason: 'Điều chuyển 12 đơn vị thành công theo Available 14',
          fromLocationId: srcLoc.id,
          toLocationId: dstLoc.id,
          items: [{ itemId: activeItem1Id, quantity: 12 }],
        });

      expect(resSuccess.status).toBe(201);
      expect(resSuccess.body.success).toBe(true);
      expect(resSuccess.body.data.totalQuantity).toBe(12);

      // 3. Verify source balance updated correctly and Borrowed is UNCHANGED
      const srcBalPost = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      expect(srcBalPost!.onHand).toBe(8); // 20 - 12 = 8
      expect(srcBalPost!.reserved).toBe(3);
      expect(srcBalPost!.quarantined).toBe(2);
      expect(srcBalPost!.kitAllocated).toBe(1);
      expect(srcBalPost!.borrowed).toBe(5); // Borrowed unchanged!

      // 4. Verify destination balance created/updated correctly
      const dstBalPost = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: dstLoc.id } },
      });
      expect(dstBalPost!.onHand).toBe(12);
      expect(dstBalPost!.borrowed).toBe(0);

      // 5. Verify Conservation of stock items: 8 + 12 = 20
      expect(srcBalPost!.onHand + dstBalPost!.onHand).toBe(20);
    });
  });

  // =========================================================================
  // PHẦN B: STOCK ADJUSTMENT INTEGRATION TESTS
  // =========================================================================
  describe('Stock Adjustment (POST /api/v1/stock-transactions/adjustment)', () => {
    it('TC-ADJ-01: executes multi-line adjustment with positive and negative delta, aligns balances, creates movements', async () => {
      const adjLoc = await createTestBin('ADJ-BIN-1');

      // Initialize balances: Item1 = 20, Item2 = 20
      await prisma.stockBalance.createMany({
        data: [
          {
            itemId: activeItem1Id,
            locationId: adjLoc.id,
            onHand: 20,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          },
          {
            itemId: activeItem2Id,
            locationId: adjLoc.id,
            onHand: 20,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          },
        ],
      });

      // Submit adjustment:
      // Item1: 20 -> 26 (delta: +6)
      // Item2: 20 -> 14 (delta: -6)
      const res = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-adj-01`)
        .send({
          notes: `${suitePrefix} adjustment audit 01`,
          reason: 'Kiểm kê kho định kỳ cuối tháng',
          locationId: adjLoc.id,
          items: [
            { itemId: activeItem1Id, actualOnHand: 26, reason: 'Tìm thấy thêm trong khay' },
            { itemId: activeItem2Id, actualOnHand: 14, reason: 'Hao hụt tự nhiên khi thực hành' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('ADJUSTMENT');
      expect(res.body.data.itemCount).toBe(2);
      expect(res.body.data.adjustedItemsCount).toBe(2);

      const txId = res.body.data.id;

      // Verify updated balances
      const bal1 = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: adjLoc.id } },
      });
      const bal2 = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem2Id, locationId: adjLoc.id } },
      });
      expect(bal1!.onHand).toBe(26);
      expect(bal2!.onHand).toBe(14);

      // Verify details
      const details = await prisma.stockTransactionDetail.findMany({
        where: { stockTransactionId: txId },
      });
      expect(details.length).toBe(2);
      const detail1 = details.find((d) => d.itemId === activeItem1Id)!;
      const detail2 = details.find((d) => d.itemId === activeItem2Id)!;
      expect(detail1.quantity).toBe(6);
      expect(detail2.quantity).toBe(6);

      // Verify movements
      const movements = await prisma.stockMovement.findMany({
        where: { referenceId: txId },
      });
      expect(movements.length).toBe(2);
      const mv1 = movements.find((m) => m.itemId === activeItem1Id)!;
      const mv2 = movements.find((m) => m.itemId === activeItem2Id)!;

      expect(mv1.quantityDelta).toBe(6);
      expect(mv1.onHandBefore).toBe(20);
      expect(mv1.onHandAfter).toBe(26);
      expect(mv1.type).toBe(StockTransactionType.ADJUSTMENT);

      expect(mv2.quantityDelta).toBe(-6);
      expect(mv2.onHandBefore).toBe(20);
      expect(mv2.onHandAfter).toBe(14);
      expect(mv2.type).toBe(StockTransactionType.ADJUSTMENT);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: txId, action: 'STOCK_ADJUSTMENT' },
      });
      expect(audit).toBeDefined();
    });

    it('TC-ADJ-02: rejects adjustment when all items have delta == 0 with 400 Bad Request', async () => {
      const adjLoc = await createTestBin('ADJ-BIN-2');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: adjLoc.id,
          onHand: 15,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      // Submit adjustment with identical actualOnHand (delta = 0)
      const res = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-adj-02`)
        .send({
          notes: `${suitePrefix} zero delta adjustment`,
          reason: 'Kiểm kê định kỳ phát hiện khớp hoàn toàn',
          locationId: adjLoc.id,
          items: [{ itemId: activeItem1Id, actualOnHand: 15 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/khớp với số dư trên hệ thống|không có chênh lệch/i);

      // Verify no transaction created
      const tx = await prisma.stockTransaction.findFirst({
        where: { notes: `${suitePrefix} zero delta adjustment` },
      });
      expect(tx).toBeNull();
    });

    it('TC-ADJ-03: in multi-line adjustment, items with delta == 0 do NOT produce StockMovement entries', async () => {
      const adjLoc = await createTestBin('ADJ-BIN-3');

      // Balances: Item1 = 10, Item2 = 10
      await prisma.stockBalance.createMany({
        data: [
          {
            itemId: activeItem1Id,
            locationId: adjLoc.id,
            onHand: 10,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          },
          {
            itemId: activeItem2Id,
            locationId: adjLoc.id,
            onHand: 10,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          },
        ],
      });

      // Submit adjustment:
      // Item1: 10 -> 15 (delta: +5)
      // Item2: 10 -> 10 (delta: 0)
      const res = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-adj-03`)
        .send({
          notes: `${suitePrefix} partial zero delta`,
          reason: 'Kiểm kê một phần có chênh lệch',
          locationId: adjLoc.id,
          items: [
            { itemId: activeItem1Id, actualOnHand: 15 },
            { itemId: activeItem2Id, actualOnHand: 10 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.itemCount).toBe(2);
      expect(res.body.data.adjustedItemsCount).toBe(1);

      const txId = res.body.data.id;

      // Detail records: exactly 2
      const details = await prisma.stockTransactionDetail.findMany({
        where: { stockTransactionId: txId },
      });
      expect(details.length).toBe(2);

      // StockMovement records: ONLY 1 (for Item1), Item2 has ZERO movements because delta == 0
      const movements = await prisma.stockMovement.findMany({
        where: { referenceId: txId },
      });
      expect(movements.length).toBe(1);
      expect(movements[0].itemId).toBe(activeItem1Id);
      expect(movements[0].quantityDelta).toBe(5);
    });

    it('TC-ADJ-04: rejects adjustment violating committed stock (actualOnHand < reserved + quarantined + kitAllocated)', async () => {
      const adjLoc = await createTestBin('ADJ-BIN-4');

      // Setup balance with committed stock: reserved=5, quarantined=3, kitAllocated=2 -> committed=10, onHand=20
      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: adjLoc.id,
          onHand: 20,
          reserved: 5,
          quarantined: 3,
          kitAllocated: 2,
          borrowed: 0,
        },
      });

      // Attempt to adjust actualOnHand down to 8 (which is less than committed stock of 10)
      const res = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-adj-04`)
        .send({
          notes: `${suitePrefix} adjust below committed`,
          reason: 'Kiểm kê phát hiện mất mát lớn',
          locationId: adjLoc.id,
          items: [{ itemId: activeItem1Id, actualOnHand: 8 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/nhỏ hơn số lượng đã cam kết/i);

      // Balance remains unchanged
      const bal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: adjLoc.id } },
      });
      expect(bal!.onHand).toBe(20);
    });

    it('TC-ADJ-05: rejects adjustment with duplicate item in the same location within one voucher', async () => {
      const adjLoc = await createTestBin('ADJ-BIN-5');

      const res = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-adj-05`)
        .send({
          notes: `${suitePrefix} duplicate item adjustment`,
          reason: 'Kiểm kê nhầm lặp mặt hàng',
          locationId: adjLoc.id,
          items: [
            { itemId: activeItem1Id, actualOnHand: 10 },
            { itemId: activeItem1Id, actualOnHand: 12 },
          ],
        });

      expect([400, 422]).toContain(res.status);
    });
  });

  // =========================================================================
  // PHẦN C: RBAC RESTRICTIONS FOR TRANSFER & ADJUSTMENT
  // =========================================================================
  describe('RBAC Verification for Transfer & Adjustment', () => {
    it('TC-RBAC-01: LAB_MANAGER has permission to transfer and adjust', async () => {
      const locA = await createTestBin('RBAC-A');
      const locB = await createTestBin('RBAC-B');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: locA.id,
          onHand: 30,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      // Transfer by LAB_MANAGER
      const xferRes = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-mgr-xfer`)
        .send({
          notes: `${suitePrefix} manager transfer`,
          reason: 'Quản lý kho điều phối linh kiện',
          items: [{ itemId: activeItem1Id, fromLocationId: locA.id, toLocationId: locB.id, quantity: 5 }],
        });
      expect(xferRes.status).toBe(201);

      // Adjustment by LAB_MANAGER
      const adjRes = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-mgr-adj`)
        .send({
          notes: `${suitePrefix} manager adjustment`,
          reason: 'Quản lý kho điều chỉnh cân đối',
          items: [{ itemId: activeItem1Id, locationId: locB.id, actualOnHand: 8 }],
        });
      expect(adjRes.status).toBe(201);
    });

    it('TC-RBAC-02: TECHNICIAN is forbidden (403) from transfer and adjustment', async () => {
      const loc = await createTestBin('RBAC-TECH');

      const xferRes = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${techToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-tech-xfer`)
        .send({
          notes: `${suitePrefix} tech transfer attempt`,
          reason: 'Kỹ thuật viên tự điều chuyển',
          items: [{ itemId: activeItem1Id, fromLocationId: loc.id, toLocationId: parentLocationId, quantity: 1 }],
        });
      expect(xferRes.status).toBe(403);

      const adjRes = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${techToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-tech-adj`)
        .send({
          notes: `${suitePrefix} tech adjustment attempt`,
          reason: 'Kỹ thuật viên tự điều chỉnh',
          items: [{ itemId: activeItem1Id, locationId: loc.id, actualOnHand: 5 }],
        });
      expect(adjRes.status).toBe(403);
    });

    it('TC-RBAC-03: STUDENT is forbidden (403) from transfer and adjustment', async () => {
      const loc = await createTestBin('RBAC-STUDENT');

      const xferRes = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-stu-xfer`)
        .send({
          notes: `${suitePrefix} student transfer attempt`,
          reason: 'Sinh viên tự điều chuyển',
          items: [{ itemId: activeItem1Id, fromLocationId: loc.id, toLocationId: parentLocationId, quantity: 1 }],
        });
      expect(xferRes.status).toBe(403);

      const adjRes = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', `${suitePrefix}-rbac-stu-adj`)
        .send({
          notes: `${suitePrefix} student adjustment attempt`,
          reason: 'Sinh viên tự điều chỉnh',
          items: [{ itemId: activeItem1Id, locationId: loc.id, actualOnHand: 5 }],
        });
      expect(adjRes.status).toBe(403);
    });

    it('TC-RBAC-04: Unauthenticated request returns 401 Unauthorized', async () => {
      const loc = await createTestBin('RBAC-UNAUTH');

      const xferRes = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Idempotency-Key', `${suitePrefix}-rbac-unauth-xfer`)
        .send({
          items: [{ itemId: activeItem1Id, fromLocationId: loc.id, toLocationId: parentLocationId, quantity: 1 }],
        });
      expect(xferRes.status).toBe(401);

      const adjRes = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Idempotency-Key', `${suitePrefix}-rbac-unauth-adj`)
        .send({
          items: [{ itemId: activeItem1Id, locationId: loc.id, actualOnHand: 5 }],
        });
      expect(adjRes.status).toBe(401);
    });
  });

  // =========================================================================
  // PHẦN D: IDEMPOTENCY INTEGRATION TESTS FOR TRANSFER & ADJUSTMENT
  // =========================================================================
  describe('Idempotency Integration (Transfer & Adjustment)', () => {
    it('TC-IDEM-01: replaying identical Transfer returns cached 200/201 (X-Cache-Lookup: HIT) without duplicate ledger entries', async () => {
      const locA = await createTestBin('IDEM-XFER-A');
      const locB = await createTestBin('IDEM-XFER-B');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: locA.id,
          onHand: 40,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      const key = `${suitePrefix}-idem-xfer-replay`;
      const payload = {
        notes: `${suitePrefix} replayable transfer`,
        reason: 'Điều chuyển kiểm thử replay',
        fromLocationId: locA.id,
        toLocationId: locB.id,
        items: [{ itemId: activeItem1Id, quantity: 15 }],
      };

      // 1. First execution -> MISS
      const res1 = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res1.status).toBe(201);
      expect(res1.headers['x-cache-lookup']).toBe('MISS');
      const txId = res1.body.data.id;

      // 2. Second execution -> HIT
      const res2 = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect([200, 201]).toContain(res2.status);
      expect(res2.headers['x-cache-lookup']).toBe('HIT');
      expect(res2.body.data.id).toBe(txId);

      // Verify balances only updated ONCE (40 - 15 = 25, locB = 15)
      const balA = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: locA.id } },
      });
      const balB = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: locB.id } },
      });
      expect(balA!.onHand).toBe(25);
      expect(balB!.onHand).toBe(15);

      // Verify only 2 movements created
      const movements = await prisma.stockMovement.findMany({
        where: { referenceId: txId },
      });
      expect(movements.length).toBe(2);
    });

    it('TC-IDEM-02: replaying Transfer with same key but altered payload returns 409 Conflict', async () => {
      const locA = await createTestBin('IDEM-CONFLICT-A');
      const locB = await createTestBin('IDEM-CONFLICT-B');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: locA.id,
          onHand: 40,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      const key = `${suitePrefix}-idem-xfer-conflict`;

      // 1. Initial request
      const res1 = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} original payload`,
          reason: 'Lô hàng ban đầu',
          fromLocationId: locA.id,
          toLocationId: locB.id,
          items: [{ itemId: activeItem1Id, quantity: 10 }],
        });
      expect(res1.status).toBe(201);

      // 2. Altered request (quantity changed from 10 to 20)
      const res2 = await request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} original payload`,
          reason: 'Lô hàng ban đầu',
          fromLocationId: locA.id,
          toLocationId: locB.id,
          items: [{ itemId: activeItem1Id, quantity: 20 }],
        });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/xung đột|thay đổi/i);
    });

    it('TC-IDEM-03: replaying Adjustment returns cached response (HIT) and protects ledger', async () => {
      const adjLoc = await createTestBin('IDEM-ADJ-BIN');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: adjLoc.id,
          onHand: 30,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      const key = `${suitePrefix}-idem-adj-replay`;
      const payload = {
        notes: `${suitePrefix} replay adjustment`,
        reason: 'Kiểm kê định kỳ replay test',
        locationId: adjLoc.id,
        items: [{ itemId: activeItem1Id, actualOnHand: 35 }],
      };

      const res1 = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res1.status).toBe(201);
      expect(res1.headers['x-cache-lookup']).toBe('MISS');

      const res2 = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect([200, 201]).toContain(res2.status);
      expect(res2.headers['x-cache-lookup']).toBe('HIT');

      const bal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: adjLoc.id } },
      });
      expect(bal!.onHand).toBe(35);
    });

    it('TC-IDEM-04: replaying Adjustment with altered payload returns 409 Conflict', async () => {
      const adjLoc = await createTestBin('IDEM-ADJ-CONFLICT');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: adjLoc.id,
          onHand: 30,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      const key = `${suitePrefix}-idem-adj-conflict`;

      const res1 = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} original adj`,
          reason: 'Kiểm kê gốc',
          locationId: adjLoc.id,
          items: [{ itemId: activeItem1Id, actualOnHand: 35 }],
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key)
        .send({
          notes: `${suitePrefix} original adj`,
          reason: 'Kiểm kê gốc',
          locationId: adjLoc.id,
          items: [{ itemId: activeItem1Id, actualOnHand: 40 }], // altered actualOnHand
        });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/xung đột|thay đổi/i);
    });
  });

  // =========================================================================
  // PHẦN E: CONCURRENCY, DEADLOCK & LEDGER INTEGRITY TESTS
  // =========================================================================
  describe('Concurrency & Deadlock Prevention', () => {
    it('TC-CONC-01: concurrent transfers sharing source location prevent overselling (15 available, 4 requests of 5 -> exactly 3 succeed)', async () => {
      const srcLoc = await createTestBin('CONC-SRC-1');
      const dstLoc = await createTestBin('CONC-DST-1');

      // Initialize source with 15 units
      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: srcLoc.id,
          onHand: 15,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      // Launch 4 concurrent transfers of 5 units each (total requested = 20 > 15)
      const promises = Array.from({ length: 4 }).map((_, i) =>
        request(app)
          .post('/api/v1/stock-transactions/transfer')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-conc-xfer-share-${i}`)
          .send({
            notes: `${suitePrefix} conc xfer ${i}`,
            reason: `Chuyển luồng đồng thời ${i}`,
            fromLocationId: srcLoc.id,
            toLocationId: dstLoc.id,
            items: [{ itemId: activeItem1Id, quantity: 5 }],
          })
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.status === 201);
      const failures = results.filter((r) => r.status === 400);

      expect(successes.length).toBe(3);
      expect(failures.length).toBe(1);

      // Verify exact final balances
      const srcBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      const dstBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: dstLoc.id } },
      });

      expect(srcBal!.onHand).toBe(0);
      expect(dstBal!.onHand).toBe(15);
      expect(srcBal!.onHand + dstBal!.onHand).toBe(15);
    });

    it('TC-CONC-02: crossing transfers (A -> B and B -> A) execute concurrently without deadlocks due to deterministic lock sorting', async () => {
      const locA = await createTestBin('CROSS-LOC-A');
      const locB = await createTestBin('CROSS-LOC-B');

      // Initialize both locations with 20 units
      await prisma.stockBalance.createMany({
        data: [
          {
            itemId: activeItem1Id,
            locationId: locA.id,
            onHand: 20,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          },
          {
            itemId: activeItem1Id,
            locationId: locB.id,
            onHand: 20,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          },
        ],
      });

      // Launch 5 transfers A -> B (2 units each) and 5 transfers B -> A (2 units each) simultaneously
      const promisesAtoB = Array.from({ length: 5 }).map((_, i) =>
        request(app)
          .post('/api/v1/stock-transactions/transfer')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-cross-ab-${i}`)
          .send({
            notes: `${suitePrefix} cross A->B ${i}`,
            reason: 'Chuyển chéo A sang B',
            fromLocationId: locA.id,
            toLocationId: locB.id,
            items: [{ itemId: activeItem1Id, quantity: 2 }],
          })
      );

      const promisesBtoA = Array.from({ length: 5 }).map((_, i) =>
        request(app)
          .post('/api/v1/stock-transactions/transfer')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', `${suitePrefix}-cross-ba-${i}`)
          .send({
            notes: `${suitePrefix} cross B->A ${i}`,
            reason: 'Chuyển chéo B sang A',
            fromLocationId: locB.id,
            toLocationId: locA.id,
            items: [{ itemId: activeItem1Id, quantity: 2 }],
          })
      );

      const allResults = await Promise.all([...promisesAtoB, ...promisesBtoA]);

      // All 10 requests must succeed with 201 (no deadlock timeouts, no 500 errors)
      const failed = allResults.filter((r) => r.status !== 201);
      expect(failed.length).toBe(0);

      // Verify balance conservation: 5 * 2 moved each way, net change = 0. Total = 40.
      const balA = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: locA.id } },
      });
      const balB = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: locB.id } },
      });

      expect(balA!.onHand).toBe(20);
      expect(balB!.onHand).toBe(20);
      expect(balA!.onHand + balB!.onHand).toBe(40);
    });

    it('TC-CONC-03: concurrent Transfer and Export sharing source location prevent negative stock', async () => {
      const srcLoc = await createTestBin('CONC-XFER-EXP');
      const dstLoc = await createTestBin('CONC-XFER-EXP-DST');

      // Initialize source with 12 units
      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: srcLoc.id,
          onHand: 12,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      // Concurrently launch:
      // 1 Transfer of 10 units to dstLoc
      // 1 Export of 10 units from srcLoc
      // Total requested = 20 > 12. Exactly 1 must succeed, 1 must fail with 400.
      const pTransfer = request(app)
        .post('/api/v1/stock-transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-conc-mix-xfer`)
        .send({
          notes: `${suitePrefix} concurrent transfer`,
          reason: 'Điều chuyển tranh chấp',
          fromLocationId: srcLoc.id,
          toLocationId: dstLoc.id,
          items: [{ itemId: activeItem1Id, quantity: 10 }],
        });

      const pExport = request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-conc-mix-exp`)
        .send({
          notes: `${suitePrefix} concurrent export`,
          reason: 'Xuất kho tranh chấp',
          items: [{ itemId: activeItem1Id, locationId: srcLoc.id, quantity: 10 }],
        });

      const [resXfer, resExp] = await Promise.all([pTransfer, pExport]);

      const statuses = [resXfer.status, resExp.status].sort();
      expect(statuses).toEqual([201, 400]);

      // Check remaining stock at source is >= 0 (strictly 2)
      const srcBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      expect(srcBal!.onHand).toBe(2);
    });

    it('TC-CONC-04: concurrent Adjustment and Export maintain ledger consistency without negative balance', async () => {
      const loc = await createTestBin('CONC-ADJ-EXP');

      // Initial balance = 10
      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: loc.id,
          onHand: 10,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      // Concurrently launch:
      // 1 Adjustment to actualOnHand = 16 (delta: +6)
      // 1 Export of 12 units
      const pAdj = request(app)
        .post('/api/v1/stock-transactions/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-conc-adj-exp-adj`)
        .send({
          notes: `${suitePrefix} concurrent adj`,
          reason: 'Kiểm kê tăng tồn',
          locationId: loc.id,
          items: [{ itemId: activeItem1Id, actualOnHand: 16 }],
        });

      const pExp = request(app)
        .post('/api/v1/stock-transactions/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `${suitePrefix}-conc-adj-exp-exp`)
        .send({
          notes: `${suitePrefix} concurrent exp`,
          reason: 'Xuất kho thực hành',
          items: [{ itemId: activeItem1Id, locationId: loc.id, quantity: 12 }],
        });

      const [resAdj, resExp] = await Promise.all([pAdj, pExp]);

      // Adjustment must succeed (201). Export succeeds if executed after adjustment (16 >= 12 -> 201),
      // or fails if executed before adjustment (10 < 12 -> 400).
      expect(resAdj.status).toBe(201);
      expect([201, 400]).toContain(resExp.status);

      const finalBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: loc.id } },
      });
      expect(finalBal!.onHand).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // PHẦN F: ATOMICITY & COMPLETE ROLLBACK VERIFICATION
  // =========================================================================
  describe('Atomicity & Rollback Verification', () => {
    it('TC-ATOM-01: completely rolls back Transfer when database error occurs during transaction', async () => {
      const srcLoc = await createTestBin('ATOM-XFER-SRC');
      const dstLoc = await createTestBin('ATOM-XFER-DST');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: srcLoc.id,
          onHand: 25,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      const invalidUserId = '00000000-0000-0000-0000-000000000000';
      const key = `${suitePrefix}-atom-xfer-fail`;

      let errorCaught: any = null;
      try {
        await stockTransactionsService.transferStock(
          {
            notes: `${suitePrefix} atomicity rollback transfer`,
            reason: 'Test rollback xfer',
            items: [
              {
                itemId: activeItem1Id,
                fromLocationId: srcLoc.id,
                toLocationId: dstLoc.id,
                quantity: 10,
              },
            ],
          },
          invalidUserId,
          key
        );
      } catch (err: any) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();

      // Verify source balance remains exactly 25
      const srcBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: srcLoc.id } },
      });
      expect(srcBal!.onHand).toBe(25);

      // Verify destination balance was NOT created
      const dstBal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: dstLoc.id } },
      });
      expect(dstBal).toBeNull();

      // Verify transaction was rolled back
      const tx = await prisma.stockTransaction.findFirst({
        where: { notes: `${suitePrefix} atomicity rollback transfer` },
      });
      expect(tx).toBeNull();

      // Verify no movements recorded
      const movements = await prisma.stockMovement.findMany({
        where: { locationId: srcLoc.id },
      });
      expect(movements.length).toBe(0);

      // Verify IdempotencyRecord was not marked COMPLETED
      const idemp = await prisma.idempotencyRecord.findUnique({
        where: { key },
      });
      expect(idemp).toBeNull();
    });

    it('TC-ATOM-02: completely rolls back Adjustment when database error occurs during transaction', async () => {
      const adjLoc = await createTestBin('ATOM-ADJ-BIN');

      await prisma.stockBalance.create({
        data: {
          itemId: activeItem1Id,
          locationId: adjLoc.id,
          onHand: 20,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0,
        },
      });

      const invalidUserId = '00000000-0000-0000-0000-000000000000';
      const key = `${suitePrefix}-atom-adj-fail`;

      let errorCaught: any = null;
      try {
        await stockTransactionsService.adjustStock(
          {
            notes: `${suitePrefix} atomicity rollback adj`,
            reason: 'Test rollback adj',
            locationId: adjLoc.id,
            items: [{ itemId: activeItem1Id, actualOnHand: 35 }],
          },
          invalidUserId,
          key
        );
      } catch (err: any) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();

      // Verify balance remains exactly 20
      const bal = await prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: activeItem1Id, locationId: adjLoc.id } },
      });
      expect(bal!.onHand).toBe(20);

      // Verify transaction was rolled back
      const tx = await prisma.stockTransaction.findFirst({
        where: { notes: `${suitePrefix} atomicity rollback adj` },
      });
      expect(tx).toBeNull();

      // Verify no movements recorded
      const movements = await prisma.stockMovement.findMany({
        where: { locationId: adjLoc.id },
      });
      expect(movements.length).toBe(0);

      // Verify IdempotencyRecord was not marked COMPLETED
      const idemp = await prisma.idempotencyRecord.findUnique({
        where: { key },
      });
      expect(idemp).toBeNull();
    });
  });
});
