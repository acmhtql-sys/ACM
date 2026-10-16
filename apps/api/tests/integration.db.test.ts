import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { calculateAvailableStock, UserRole, ItemType } from '@acm/shared';

const app = createApp();

describe('ACM Phase 1 Real Database Integration Test Suite', () => {
  let adminToken = '';
  let studentToken = '';
  let testCategoryId = '';
  let createdItemId = '';

  beforeAll(async () => {
    const dbStatus = await checkDatabaseConnection();
    expect(dbStatus.connected).toBe(true);

    const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    expect(currentDbResult[0]?.db).toBe('acm_inventory_test');

    // Retrieve a category for item testing
    const cat = await prisma.category.findFirst();
    if (cat) {
      testCategoryId = cat.id;
    }
  });

  afterAll(async () => {
    // Requirement 6: Cleanup of test items by ID and pattern
    try {
      if (createdItemId) {
        await prisma.stockBalance.deleteMany({ where: { itemId: createdItemId } });
        await prisma.asset.deleteMany({ where: { itemId: createdItemId } });
        await prisma.borrowDetail.deleteMany({ where: { itemId: createdItemId } });
        await prisma.stockTransactionDetail.deleteMany({ where: { itemId: createdItemId } });
        await prisma.item.deleteMany({ where: { id: createdItemId } });
      }

      await prisma.item.deleteMany({
        where: { code: { startsWith: 'TEST-STM32-' } },
      });
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  });

  // Test Case 1: Database Connection Liveness & Readiness
  it('TC01: Checks Database Connection Liveness & Readiness', async () => {
    const livenessRes = await request(app).get('/api/v1/health/liveness');
    expect(livenessRes.status).toBe(200);
    expect(livenessRes.body.status).toBe('ok');
    expect(livenessRes.body.service).toBe('ACM API');

    const readinessRes = await request(app).get('/api/v1/health/readiness');
    expect(readinessRes.status).toBe(200);
    expect(readinessRes.body.status).toBe('ready');
    expect(readinessRes.body.database).toBe('connected');
  });

  // Test Case 2: Verify Seed Data Existence in Database
  it('TC02: Verifies Seeded Roles, Users, and Core Items in Database', async () => {
    const rolesCount = await prisma.role.count();
    expect(rolesCount).toBeGreaterThanOrEqual(4);

    const usersCount = await prisma.user.count();
    expect(usersCount).toBeGreaterThanOrEqual(4);

    const coreItemCodes = ['ARD-UNO-R3', 'ESP32-WROOM-32', 'DHT22-AM2302', 'SR04-ULTRASONIC', 'SERVO-SG90', 'LED-5MM-RGB', 'RES-KIT-1-4W'];
    const foundItems = await prisma.item.findMany({
      where: { code: { in: coreItemCodes } },
    });
    expect(foundItems.length).toBe(7);
  });

  // Test Case 3: Authentication with Development Admin and Student accounts
  it('TC03: Authenticates via POST /api/v1/auth/login and receives JWT', async () => {
    // Login as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acm.local', password: 'ACM@dev2026!' });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.user.role).toBe(UserRole.ADMIN);
    expect(typeof adminRes.body.data.token).toBe('string');
    adminToken = adminRes.body.data.token;

    // Login as Student
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@acm.local', password: 'ACM@dev2026!' });

    expect(studentRes.status).toBe(200);
    expect(studentRes.body.success).toBe(true);
    expect(studentRes.body.data.user.role).toBe(UserRole.STUDENT);
    expect(typeof studentRes.body.data.token).toBe('string');
    studentToken = studentRes.body.data.token;
  });

  // Test Case 4: Read items list from Database via API
  it('TC04: Reads Items Catalog via GET /api/v1/items', async () => {
    const res = await request(app).get('/api/v1/items');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);

    if (!testCategoryId && res.body.data[0]?.category?.id) {
      testCategoryId = res.body.data[0].category.id;
    }
  });

  // Test Case 5: Create a new test item via API (Admin)
  it('TC05: Creates a New Test Item via POST /api/v1/items (Admin RBAC)', async () => {
    expect(adminToken).toBeTruthy();
    expect(testCategoryId).toBeTruthy();

    const testItemPayload = {
      code: `TEST-STM32-${Date.now().toString().slice(-4)}`,
      name: 'STM32F401 BlackPill ARM Cortex-M4',
      description: 'Linh kiện kiểm thử tích hợp tự động',
      unit: 'Cái',
      type: ItemType.TRACKED_ASSET,
      categoryId: testCategoryId,
      minStockAlert: 5,
    };

    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testItemPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe(testItemPayload.code);
    expect(res.body.data.id).toBeTruthy();
    createdItemId = res.body.data.id;
  });

  // Test Case 6: Read newly created item from Database
  it('TC06: Reads newly created item back from Database via GET /api/v1/items/:id', async () => {
    expect(createdItemId).toBeTruthy();

    const res = await request(app).get(`/api/v1/items/${createdItemId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdItemId);
    expect(res.body.data.name).toBe('STM32F401 BlackPill ARM Cortex-M4');
  });

  // Test Case 7: Check stock quantity & invariant calculations
  it('TC07: Checks stock balance & enforces Available = OnHand - Reserved - Quarantined - KitAllocated', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/balance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);

    for (const b of res.body.data) {
      const calculated = b.onHand - b.reserved - b.quarantined - b.kitAllocated;
      expect(b.available).toBe(Math.max(0, calculated));
      // Borrowed is out-of-warehouse and must NOT be deducted twice
      expect(b.borrowed).toBeGreaterThanOrEqual(0);
    }
  });

  // Test Case 8: Checks non-negative stock constraints
  it('TC08: Rejects negative stock quantities with validation error', async () => {
    const invalidPayload = {
      onHand: 10,
      reserved: -5,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    };

    expect(() => calculateAvailableStock(invalidPayload)).toThrow(/cannot be negative/);
  });

  // Test Case 9: Transaction rollback on failure
  it('TC09: Verifies Database Transaction Rollback on failure', async () => {
    const initialCount = await prisma.category.count();

    // Execute transaction that fails at step 2
    let errorThrown = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.category.create({
          data: {
            code: `TEMP-ROLLBACK-${Date.now()}`,
            name: 'Temp Category',
          },
        });
        throw new Error('Forced Rollback for Testing');
      });
    } catch (e: any) {
      errorThrown = true;
      expect(e.message).toBe('Forced Rollback for Testing');
    }

    expect(errorThrown).toBe(true);
    const afterCount = await prisma.category.count();
    expect(afterCount).toBe(initialCount); // Rolled back cleanly!
  });

  // Test Case 10: Enforces RBAC permissions on protected API endpoints
  it('TC10: Enforces RBAC - Student is Forbidden (403) from creating items or viewing user list', async () => {
    expect(studentToken).toBeTruthy();

    // Student trying to view user management
    const usersRes = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(usersRes.status).toBe(403);
    expect(usersRes.body.success).toBe(false);

    // Student trying to create an item
    const createRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        code: 'STUDENT-HACK-ITEM',
        name: 'Forbidden Item',
        unit: 'Cái',
        categoryId: testCategoryId,
      });

    expect(createRes.status).toBe(403);
    expect(createRes.body.success).toBe(false);
  });
});
