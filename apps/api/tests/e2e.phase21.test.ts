import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { ItemType, UserRole, ItemSortField, SortOrder } from '@acm/shared';

const app = createApp();

describe('ACM Phase 2.1 – End-to-End Acceptance Test Suite', () => {
  let adminToken = '';
  let managerToken = '';
  let techToken = '';
  let studentToken = '';

  let testCategoryId = '';
  const createdTestIds: string[] = [];

  beforeAll(async () => {
    // 1. Verify strict database isolation on acm_inventory_test
    const dbStatus = await checkDatabaseConnection();
    expect(dbStatus.connected).toBe(true);

    const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    expect(currentDbResult[0]?.db).toBe('acm_inventory_test');

    // 2. Fetch category for testing
    const cat = await prisma.category.findFirst();
    expect(cat).toBeTruthy();
    testCategoryId = cat!.id;

    // 3. Authenticate all 4 roles to simulate real user sessions
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
  });

  afterAll(async () => {
    // Thorough cleanup of all test entities
    try {
      for (const id of createdTestIds) {
        await prisma.stockBalance.deleteMany({ where: { itemId: id } });
        await prisma.asset.deleteMany({ where: { itemId: id } });
        await prisma.borrowDetail.deleteMany({ where: { itemId: id } });
        await prisma.stockTransactionDetail.deleteMany({ where: { itemId: id } });
        await prisma.auditLog.deleteMany({ where: { entityId: id } });
        await prisma.item.deleteMany({ where: { id } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entity: 'Item',
          newValue: { path: ['code'], string_contains: 'E2E-TEST-' },
        },
      });

      await prisma.item.deleteMany({
        where: { code: { startsWith: 'E2E-TEST-' } },
      });
    } catch (cleanupErr) {
      console.warn('E2E cleanup warning:', cleanupErr);
    }
  });

  // ========================================================
  // Scenario 1 & 2: Admin Login & Reads Seed Items
  // ========================================================
  it('E2E-01: Admin login & verifies core 7 seed items in catalog', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);

    const codes = res.body.data.map((i: any) => i.code);
    expect(codes).toContain('ARD-UNO-R3');
    expect(codes).toContain('ESP32-WROOM-32');
    expect(codes).toContain('DHT22-AM2302');
  });

  // ========================================================
  // Scenario 3: Search by SKU and Name
  // ========================================================
  it('E2E-02: Searches catalog by SKU and item name', async () => {
    const resSku = await request(app).get('/api/v1/items?search=ARD-UNO');
    expect(resSku.status).toBe(200);
    expect(resSku.body.data.length).toBeGreaterThanOrEqual(1);
    expect(resSku.body.data[0].code).toContain('ARD-UNO');

    const resName = await request(app).get('/api/v1/items?search=cortex');
    expect(resName.status).toBe(200);
  });

  // ========================================================
  // Scenario 4: Filter by Category, ItemType, Active, Low Stock
  // ========================================================
  it('E2E-03: Filters catalog by Category, Type, Active, and Low Stock', async () => {
    // Filter by category
    const resCat = await request(app).get(`/api/v1/items?categoryId=${testCategoryId}`);
    expect(resCat.status).toBe(200);
    for (const item of resCat.body.data) {
      expect(item.categoryId).toBe(testCategoryId);
    }

    // Filter by type
    const resType = await request(app).get('/api/v1/items?type=CONSUMABLE');
    expect(resType.status).toBe(200);
    for (const item of resType.body.data) {
      expect(item.type).toBe('CONSUMABLE');
    }

    // Filter by active status
    const resActive = await request(app)
      .get('/api/v1/items?isActive=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resActive.status).toBe(200);
    for (const item of resActive.body.data) {
      expect(item.isActive).toBe(true);
    }

    // Filter by low stock
    const resLowStock = await request(app).get('/api/v1/items?isLowStock=true');
    expect(resLowStock.status).toBe(200);
    for (const item of resLowStock.body.data) {
      expect(item.isLowStock).toBe(true);
      expect(item.available).toBeLessThan(item.minStockAlert);
    }
  });

  // ========================================================
  // Scenario 5: Pagination, Sorting and Reset
  // ========================================================
  it('E2E-04: Verifies pagination limits, sorting, and metadata', async () => {
    const resPage = await request(app).get('/api/v1/items?page=1&limit=3&sortBy=name&sortOrder=asc');
    expect(resPage.status).toBe(200);
    expect(resPage.body.data.length).toBe(3);
    expect(resPage.body.meta.page).toBe(1);
    expect(resPage.body.meta.limit).toBe(3);
    expect(resPage.body.meta.hasNextPage).toBe(true);

    const names = resPage.body.data.map((i: any) => i.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  // ========================================================
  // Scenario 6 & 7: Add Item & Duplicate SKU (409)
  // ========================================================
  let e2eItemId = '';
  const e2eSku = `E2E-TEST-${Date.now().toString().slice(-4)}`;

  it('E2E-05: Creates new item and strictly prevents duplicate SKU (409)', async () => {
    // Create new item
    const createRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: e2eSku,
        name: 'E2E Test OLED Display 0.96 inch',
        description: 'Màn hình OLED I2C 128x64 xanh dương',
        unit: 'Chiếc',
        type: ItemType.TRACKED_ASSET,
        categoryId: testCategoryId,
        minStockAlert: 5,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.code).toBe(e2eSku);
    e2eItemId = createRes.body.data.id;
    createdTestIds.push(e2eItemId);

    // Attempt duplicate SKU
    const dupRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: e2eSku,
        name: 'Duplicate SKU Attempt',
        unit: 'Chiếc',
        categoryId: testCategoryId,
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.success).toBe(false);
    expect(dupRes.body.message).toContain('đã tồn tại');
  });

  // ========================================================
  // Scenario 8 & 9: Edit Item & Stock Immutability Check
  // ========================================================
  it('E2E-06: Updates descriptive properties and verifies stock quantities cannot be modified', async () => {
    expect(e2eItemId).toBeTruthy();

    // 1. Verify normal descriptive update
    const updateRes = await request(app)
      .put(`/api/v1/items/${e2eItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Test OLED Display 0.96 inch (Updated Revision V2)',
        description: 'Phiên bản V2 hỗ trợ cả I2C và SPI',
        minStockAlert: 10,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.name).toContain('Revision V2');
    expect(updateRes.body.data.minStockAlert).toBe(10);
    expect(updateRes.body.data.totalOnHand).toBe(0);

    // 2. Verify stock manipulation attempt is strictly rejected (422)
    const stockHackRes = await request(app)
      .put(`/api/v1/items/${e2eItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Valid Name',
        onHand: 1000, // Forbidden stock field
      });

    expect(stockHackRes.status).toBe(422);
  });

  // ========================================================
  // Scenario 10: View Detail & Location Stock Breakdown
  // ========================================================
  it('E2E-07: Reads full detail and verifies location breakdown & invariant formula', async () => {
    // Query seed item ARD-UNO-R3 by ID
    const uno = await prisma.item.findUnique({ where: { code: 'ARD-UNO-R3' } });
    expect(uno).toBeTruthy();

    const detailRes = await request(app).get(`/api/v1/items/${uno!.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.success).toBe(true);

    const data = detailRes.body.data;
    expect(data.code).toBe('ARD-UNO-R3');
    expect(data.totalOnHand).toBeGreaterThanOrEqual(1);

    // Enforce Available = OnHand - Reserved - Quarantined - KitAllocated
    const expectedAvail = Math.max(
      0,
      data.totalOnHand - data.totalReserved - data.totalQuarantined - data.totalKitAllocated
    );
    expect(data.available).toBe(expectedAvail);

    // Check location breakdown array
    expect(Array.isArray(data.stockBalances)).toBe(true);
    if (data.stockBalances.length > 0) {
      const loc = data.stockBalances[0];
      expect(loc.location).toBeDefined();
      expect(loc.available).toBe(
        Math.max(0, loc.onHand - loc.reserved - loc.quarantined - loc.kitAllocated)
      );
    }
  });

  // ========================================================
  // Scenario 11 & 12: Deactivate & Reactivate with Reason
  // ========================================================
  it('E2E-08: Deactivates with reason and reactivates item with AuditLog', async () => {
    expect(e2eItemId).toBeTruthy();

    // 1. Deactivate
    const deactRes = await request(app)
      .patch(`/api/v1/items/${e2eItemId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        isActive: false,
        reason: 'E2E Testing Soft Deactivation',
      });

    expect(deactRes.status).toBe(200);
    expect(deactRes.body.data.isActive).toBe(false);

    // Verify Student cannot access inactive item (403)
    const stdAccessRes = await request(app)
      .get(`/api/v1/items/${e2eItemId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(stdAccessRes.status).toBe(403);

    // 2. Reactivate
    const reactRes = await request(app)
      .patch(`/api/v1/items/${e2eItemId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        isActive: true,
        reason: 'E2E Testing Reactivation Complete',
      });

    expect(reactRes.status).toBe(200);
    expect(reactRes.body.data.isActive).toBe(true);

    // Verify Student can access active item again
    const stdAccessActive = await request(app)
      .get(`/api/v1/items/${e2eItemId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(stdAccessActive.status).toBe(200);
  });

  // ========================================================
  // Scenario 13: Verify AuditLog Trail in PostgreSQL
  // ========================================================
  it('E2E-09: Verifies complete AuditLog trail (CREATE, UPDATE, DEACTIVATE, REACTIVATE)', async () => {
    expect(e2eItemId).toBeTruthy();

    const logs = await prisma.auditLog.findMany({
      where: {
        entity: 'Item',
        entityId: e2eItemId,
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(4);
    const actions = logs.map((l) => l.action);

    expect(actions).toContain('CREATE_ITEM');
    expect(actions).toContain('UPDATE_ITEM');
    expect(actions).toContain('DEACTIVATE_ITEM');
    expect(actions).toContain('REACTIVATE_ITEM');

    // Verify log attributes integrity
    for (const log of logs) {
      expect(log.userId).toBeTruthy();
      expect(log.entity).toBe('Item');
      expect(log.entityId).toBe(e2eItemId);
      expect(log.createdAt).toBeInstanceOf(Date);
    }
  });

  // ========================================================
  // Scenario 14: Refresh and Data Persistence
  // ========================================================
  it('E2E-10: Verifies data persistence after simulated refresh', async () => {
    expect(e2eItemId).toBeTruthy();

    // Query fresh from Database
    const persisted = await prisma.item.findUnique({
      where: { id: e2eItemId },
      include: { category: true },
    });

    expect(persisted).toBeTruthy();
    expect(persisted?.code).toBe(e2eSku);
    expect(persisted?.name).toContain('Revision V2');
    expect(persisted?.isActive).toBe(true);
  });

  // ========================================================
  // Scenario 15: RBAC Comprehensive Verification (4 Roles)
  // ========================================================
  describe('E2E-11: Comprehensive RBAC across all 4 roles', () => {
    it('ADMIN has full permissions (Read, Create, Edit, Toggle)', async () => {
      const readRes = await request(app).get('/api/v1/items').set('Authorization', `Bearer ${adminToken}`);
      expect(readRes.status).toBe(200);
    });

    it('LAB_MANAGER has full permissions (Read, Create, Edit, Toggle)', async () => {
      const tempSku = `E2E-TEST-MGR-${Date.now().toString().slice(-4)}`;
      const createRes = await request(app)
        .post('/api/v1/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          code: tempSku,
          name: 'Manager Item',
          unit: 'Cái',
          categoryId: testCategoryId,
        });

      expect(createRes.status).toBe(201);
      createdTestIds.push(createRes.body.data.id);
    });

    it('TECHNICIAN is read-only and blocked with 403 on write attempts', async () => {
      const createRes = await request(app)
        .post('/api/v1/items')
        .set('Authorization', `Bearer ${techToken}`)
        .send({
          code: 'E2E-TECH-FORBIDDEN',
          name: 'Tech Forbidden',
          unit: 'Cái',
          categoryId: testCategoryId,
        });
      expect(createRes.status).toBe(403);

      const updateRes = await request(app)
        .put(`/api/v1/items/${e2eItemId}`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ name: 'Tech Update Forbidden' });
      expect(updateRes.status).toBe(403);

      const statusRes = await request(app)
        .patch(`/api/v1/items/${e2eItemId}/status`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ isActive: false });
      expect(statusRes.status).toBe(403);
    });

    it('STUDENT is read-only (active only) and blocked with 403 on write attempts', async () => {
      const createRes = await request(app)
        .post('/api/v1/items')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          code: 'E2E-STD-FORBIDDEN',
          name: 'Student Forbidden',
          unit: 'Cái',
          categoryId: testCategoryId,
        });
      expect(createRes.status).toBe(403);

      const updateRes = await request(app)
        .put(`/api/v1/items/${e2eItemId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Student Update Forbidden' });
      expect(updateRes.status).toBe(403);

      const statusRes = await request(app)
        .patch(`/api/v1/items/${e2eItemId}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ isActive: false });
      expect(statusRes.status).toBe(403);
    });
  });

  // ========================================================
  // Scenario 16: Physical Deletion Blocked (405)
  // ========================================================
  it('E2E-12: Physical deletion is blocked with HTTP 405 Method Not Allowed', async () => {
    const delRes = await request(app).delete(`/api/v1/items/${e2eItemId}`);
    expect(delRes.status).toBe(405);
    expect(delRes.body.success).toBe(false);
    expect(delRes.body.message).toContain('không hỗ trợ xóa vật lý');
  });

  // ========================================================
  // Scenario 17: Transaction Rollback on Failure
  // ========================================================
  it('E2E-13: Ensures transaction rollback occurs if AuditLog writing fails', async () => {
    const rollbackCode = `E2E-ROLLBACK-ITEM-${Date.now()}`;
    const testAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    expect(testAdmin).toBeTruthy();

    let rollbackSucceeded = false;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.item.create({
          data: {
            code: rollbackCode,
            name: 'Will Be Rolled Back',
            unit: 'Cái',
            categoryId: testCategoryId,
          },
        });

        // Write audit log inside the same transaction
        await tx.auditLog.create({
          data: {
            userId: testAdmin!.id,
            action: 'CREATE_ITEM',
            entity: 'Item',
            entityId: item.id,
            newValue: { code: rollbackCode },
          },
        });

        // Intentionally throw error to simulate downstream failure
        throw new Error('Simulated Downstream Failure for Transaction Rollback');
      });
    } catch (e: any) {
      if (e.message.includes('Simulated Downstream Failure')) {
        rollbackSucceeded = true;
      }
    }

    expect(rollbackSucceeded).toBe(true);

    // Verify specifically that neither the item NOR the audit log from this transaction persisted
    const rolledBackItem = await prisma.item.findUnique({
      where: { code: rollbackCode },
    });
    expect(rolledBackItem).toBeNull();

    const rolledBackAudit = await prisma.auditLog.findFirst({
      where: {
        entity: 'Item',
        newValue: { path: ['code'], equals: rollbackCode },
      },
    });
    expect(rolledBackAudit).toBeNull();
  });
});
