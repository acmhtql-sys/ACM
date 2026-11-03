import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { LocationType } from '@acm/shared';
import { locationsService } from '../src/modules/locations/locations.service';

const app = createApp();

describe('ACM Phase 2.2 Backend API Integration Test Suite – Locations Management', () => {
  let adminToken = '';
  let managerToken = '';
  let techToken = '';
  let studentToken = '';

  let testWarehouseId = '';
  let testRackId = '';
  let testShelfId = '';
  let testBin1Id = '';
  let testBin2Id = '';

  beforeAll(async () => {
    // 1. Strictly verify connection to isolated test database
    const dbStatus = await checkDatabaseConnection();
    expect(dbStatus.connected).toBe(true);

    const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    expect(currentDbResult[0]?.db).toBe('acm_inventory_test');

    // 2. Authenticate all 4 roles
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
    // Strict cleanup of all test-generated locations and related audit logs in acm_inventory_test
    try {
      await prisma.stockBalance.deleteMany({
        where: { location: { code: { startsWith: 'TEST-LOC-' } } },
      });

      await prisma.asset.deleteMany({
        where: { serialNumber: { startsWith: 'TEST-ASSET-LOC-' } },
      });

      await prisma.stockReservation.deleteMany({
        where: { location: { code: { startsWith: 'TEST-LOC-' } } },
      });

      await prisma.borrowRequest.deleteMany({
        where: { requestNumber: { startsWith: 'TEST-BR-' } },
      });

      await prisma.auditLog.deleteMany({
        where: {
          entity: 'Location',
          OR: [
            { newValue: { path: ['code'], string_contains: 'TEST-LOC-' } },
            { oldValue: { path: ['code'], string_contains: 'TEST-LOC-' } },
          ],
        },
      });

      // Delete in reverse hierarchy order to prevent FK violation
      await prisma.location.deleteMany({
        where: { code: { startsWith: 'TEST-LOC-BIN' } },
      });
      await prisma.location.deleteMany({
        where: { code: { startsWith: 'TEST-LOC-SHELF' } },
      });
      await prisma.location.deleteMany({
        where: { code: { startsWith: 'TEST-LOC-RACK' } },
      });
      await prisma.location.deleteMany({
        where: { code: { startsWith: 'TEST-LOC-' } },
      });
    } catch (cleanupErr) {
      console.warn('Location test cleanup warning:', cleanupErr);
    }
  });

  // ========================================================
  // 1. GET /api/v1/locations/tree
  // ========================================================
  describe('GET /api/v1/locations/tree', () => {
    it('returns hierarchical tree structure with root warehouse and children for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/locations/tree')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const rootWarehouses = res.body.data;
      expect(rootWarehouses.length).toBeGreaterThanOrEqual(1);

      const mainWh = rootWarehouses.find((w: any) => w.code === 'WH-MAIN');
      expect(mainWh).toBeDefined();
      expect(mainWh.level).toBe(0);
      expect(Array.isArray(mainWh.children)).toBe(true);
      expect(mainWh.children.length).toBeGreaterThanOrEqual(2); // RACK-A and RACK-B
    });

    it('allows TECHNICIAN to view tree structure (read-only)', async () => {
      const res = await request(app)
        .get('/api/v1/locations/tree')
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('blocks STUDENT from viewing tree structure with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/locations/tree')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access to tree with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/locations/tree');
      expect(res.status).toBe(401);
    });
  });

  // ========================================================
  // 2. GET /api/v1/locations (Flat list, Filtering, Pagination)
  // ========================================================
  describe('GET /api/v1/locations', () => {
    it('returns paginated flat list with metadata for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6); // 6 seed locations

      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(20);
      expect(res.body.meta.totalItems).toBeGreaterThanOrEqual(6);
    });

    it('allows TECHNICIAN to view paginated flat list (read-only)', async () => {
      const res = await request(app)
        .get('/api/v1/locations')
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('blocks STUDENT from viewing locations list with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/locations')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access to locations list with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/locations');
      expect(res.status).toBe(401);
    });

    it('filters locations by type (e.g. RACK)', async () => {
      const res = await request(app)
        .get('/api/v1/locations?type=RACK')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      for (const loc of res.body.data) {
        expect(loc.type).toBe('RACK');
      }
    });

    it('searches locations by keyword in code or name', async () => {
      const res = await request(app)
        .get('/api/v1/locations?search=MAIN')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].code).toBe('WH-MAIN');
    });

    it('sorts locations by code descending', async () => {
      const res = await request(app)
        .get('/api/v1/locations?sortBy=code&sortOrder=desc')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const codes = res.body.data.map((l: any) => l.code);
      const sortedCodes = [...codes].sort((a, b) => b.localeCompare(a));
      expect(codes).toEqual(sortedCodes);
    });
  });

  // ========================================================
  // 3. POST /api/v1/locations (Creation, Hierarchy, RBAC)
  // ========================================================
  describe('POST /api/v1/locations', () => {
    it('allows ADMIN to create root WAREHOUSE', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-WH',
          name: 'Kho Thử Nghiệm Tự Động',
          type: LocationType.WAREHOUSE,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('TEST-LOC-WH');
      expect(res.body.data.type).toBe(LocationType.WAREHOUSE);
      expect(res.body.data.parentId).toBeNull();
      testWarehouseId = res.body.data.id;
    });

    it('allows LAB_MANAGER to create child RACK under WAREHOUSE', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          code: 'TEST-LOC-RACK',
          name: 'Kệ Thử Nghiệm 1',
          type: LocationType.RACK,
          parentId: testWarehouseId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('TEST-LOC-RACK');
      expect(res.body.data.type).toBe(LocationType.RACK);
      expect(res.body.data.parentId).toBe(testWarehouseId);
      testRackId = res.body.data.id;
    });

    it('creates child SHELF under RACK (4-tier hierarchy: WAREHOUSE -> RACK -> SHELF -> BIN)', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-SHELF',
          name: 'Tầng Kệ Thử Nghiệm S1',
          type: LocationType.SHELF,
          parentId: testRackId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe(LocationType.SHELF);
      expect(res.body.data.parentId).toBe(testRackId);
      testShelfId = res.body.data.id;
    });

    it('creates child BIN under SHELF (completing 4-tier hierarchy)', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-BIN-1',
          name: 'Khay Linh Kiện B1-01',
          type: LocationType.BIN,
          parentId: testShelfId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe(LocationType.BIN);
      expect(res.body.data.parentId).toBe(testShelfId);
      testBin1Id = res.body.data.id;
    });

    it('creates child BIN directly under RACK (3-tier hierarchy: WAREHOUSE -> RACK -> BIN)', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-BIN-2',
          name: 'Khay Trực Tiếp Dưới Kệ B2-01',
          type: LocationType.BIN,
          parentId: testRackId, // Direct RACK -> BIN
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe(LocationType.BIN);
      expect(res.body.data.parentId).toBe(testRackId);
      testBin2Id = res.body.data.id;
    });

    it('verifies AuditLog entry created for location creation', async () => {
      const log = await prisma.auditLog.findFirst({
        where: {
          action: 'CREATE_LOCATION',
          entity: 'Location',
          entityId: testWarehouseId,
        },
      });
      expect(log).toBeDefined();
      expect(log?.entity).toBe('Location');
    });

    it('rejects duplicate location code with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-WH', // Existing code!
          name: 'Trùng mã kho',
          type: LocationType.WAREHOUSE,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đã tồn tại trong hệ thống/);
    });

    it('rejects case-insensitive duplicate location code with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'test-loc-wh', // Lowercase of TEST-LOC-WH
          name: 'Trùng mã kho chữ thường',
          type: LocationType.WAREHOUSE,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đã tồn tại trong hệ thống/);
    });

    it('rejects non-existent parentId with 404 Not Found', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-ORPHAN',
          name: 'Không có cha hợp lệ',
          type: LocationType.RACK,
          parentId: '99999999-9999-9999-9999-999999999999',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/không tồn tại/);
    });

    it('rejects invalid hierarchy relationships (e.g. WAREHOUSE under BIN) with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-INV-WH',
          name: 'Kho dưới Khay (sai quy tắc)',
          type: LocationType.WAREHOUSE,
          parentId: testBin1Id, // WAREHOUSE cannot be under BIN!
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/không thể trực thuộc vị trí khác|vị trí gốc cao nhất/);
    });

    it('rejects SHELF or BIN without parent with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-NO-PARENT-BIN',
          name: 'Khay không có cha',
          type: LocationType.BIN,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/bắt buộc phải có vị trí cha/);
    });

    it('rejects whitespace-only code or name with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: '   ',
          name: 'Tên hợp lệ',
          type: LocationType.WAREHOUSE,
        });

      expect(res.status).toBe(422);
    });

    it('strictly rejects injected stock balance parameters with 422', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-LOC-INJECT',
          name: 'Cố ý tiêm onHand',
          type: LocationType.WAREHOUSE,
          onHand: 100, // Disallowed!
        });

      expect(res.status).toBe(422);
    });

    it('forbids TECHNICIAN and STUDENT from creating locations (403 Forbidden)', async () => {
      const techRes = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${techToken}`)
        .send({
          code: 'TEST-LOC-TECH',
          name: 'Kỹ thuật viên thử tạo',
          type: LocationType.WAREHOUSE,
        });
      expect(techRes.status).toBe(403);

      const studentRes = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          code: 'TEST-LOC-STUDENT',
          name: 'Sinh viên thử tạo',
          type: LocationType.WAREHOUSE,
        });
      expect(studentRes.status).toBe(403);
    });

    it('handles concurrent creation of same location code with different casing (one succeeds, one gets 409)', async () => {
      const codeLower = 'test-loc-conc-wh';
      const codeUpper = 'TEST-LOC-CONC-WH';
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            code: codeLower,
            name: 'Kho Concurrency 1',
            type: LocationType.WAREHOUSE,
          }),
        request(app)
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            code: codeUpper,
            name: 'Kho Concurrency 2',
            type: LocationType.WAREHOUSE,
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);
      const successRes = res1.status === 201 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(successRes.body.data.code).toBe('TEST-LOC-CONC-WH');
      expect(conflictRes.body.message).toMatch(/đã tồn tại trong hệ thống/);

      // Cleanup
      await prisma.auditLog.deleteMany({
        where: {
          entity: 'Location',
          entityId: successRes.body.data.id,
        },
      });
      await prisma.location.deleteMany({
        where: { code: 'TEST-LOC-CONC-WH' },
      });
    });

    it('rolls back database transaction completely when AuditLog creation fails', async () => {
      const testCode = 'TEST-LOC-ROLLBACK-SVC';
      const invalidUserId = '00000000-0000-0000-0000-000000000000';

      let caughtError: any = null;
      try {
        await locationsService.createLocation(
          {
            code: testCode,
            name: 'Kho Kiểm Thử Rollback',
            type: LocationType.WAREHOUSE,
          },
          invalidUserId
        );
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();

      // Assert the location was NEVER persisted to database (atomic rollback)
      const foundLoc = await prisma.location.findFirst({
        where: { code: testCode },
      });
      expect(foundLoc).toBeNull();

      // Assert no audit log was created for this entity
      const foundAudit = await prisma.auditLog.findFirst({
        where: {
          entity: 'Location',
          newValue: { path: ['code'], equals: testCode },
        },
      });
      expect(foundAudit).toBeNull();
    });
  });

  // ========================================================
  // 4. GET /api/v1/locations/:id (Detail, Hierarchy, Stock)
  // ========================================================
  describe('GET /api/v1/locations/:id', () => {
    it('returns detail of warehouse with its children list for ADMIN', async () => {
      const res = await request(app)
        .get(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('TEST-LOC-WH');
      expect(Array.isArray(res.body.data.children)).toBe(true);
      expect(res.body.data.children.length).toBeGreaterThanOrEqual(1);
    });

    it('allows TECHNICIAN to view location detail (read-only)', async () => {
      const res = await request(app)
        .get(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('TEST-LOC-WH');
    });

    it('blocks STUDENT from accessing location detail with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access to location detail with 401 Unauthorized', async () => {
      const res = await request(app).get(`/api/v1/locations/${testWarehouseId}`);
      expect(res.status).toBe(401);
    });

    it('returns detail of bin with parent information and stockBalances array', async () => {
      const res = await request(app)
        .get(`/api/v1/locations/${testBin1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('TEST-LOC-BIN-1');
      expect(res.body.data.parent).toBeDefined();
      expect(res.body.data.parent.code).toBe('TEST-LOC-SHELF');
      expect(Array.isArray(res.body.data.stockBalances)).toBe(true);
    });

    it('returns 404 for non-existent location ID', async () => {
      const res = await request(app)
        .get('/api/v1/locations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Không tìm thấy vị trí kho yêu cầu/);
    });
  });

  // ========================================================
  // 5. PUT /api/v1/locations/:id (Update, Anti-Loop, RBAC)
  // ========================================================
  describe('PUT /api/v1/locations/:id', () => {
    it('allows LAB_MANAGER to update location name', async () => {
      const res = await request(app)
        .put(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Kho Thử Nghiệm Tự Động (Đã Cập Nhật)',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Kho Thử Nghiệm Tự Động (Đã Cập Nhật)');
    });

    it('rejects empty update body with 422', async () => {
      const res = await request(app)
        .put(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(422);
    });

    it('rejects setting parentId to itself with 400 Bad Request', async () => {
      const res = await request(app)
        .put(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parentId: testWarehouseId, // Self!
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Vị trí cha không thể là chính nó/);
    });

    it('ANTI-LOOP: rejects moving ancestor under its own descendant with 400 Bad Request', async () => {
      // testWarehouseId is ancestor of testRackId and testBin1Id
      // Trying to set testWarehouseId.parentId = testRackId would create a cycle!
      const res = await request(app)
        .put(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parentId: testRackId, // Cycle!
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vòng lặp phân cấp/);
    });

    it('rejects updating code to an existing code with 409 Conflict', async () => {
      const res = await request(app)
        .put(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'WH-MAIN', // Duplicate!
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đã tồn tại trong hệ thống/);
    });

    it('forbids TECHNICIAN and STUDENT from updating locations (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/v1/locations/${testWarehouseId}`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ name: 'Tech update attempt' });
      expect(res.status).toBe(403);
    });
  });

  // ========================================================
  // 6. PATCH /api/v1/locations/:id/status (Safe Deactivation & Reactivation)
  // ========================================================
  describe('PATCH /api/v1/locations/:id/status', () => {
    it('SAFE GUARD 1: blocks deactivating a parent location that still has active children with 400', async () => {
      // testWarehouseId has active child testRackId
      const res = await request(app)
        .patch(`/api/v1/locations/${testWarehouseId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
          reason: 'Thử tắt kho tổng khi còn kệ',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vẫn còn.*vị trí con đang hoạt động/);
    });

    it('SAFE GUARD 2: blocks deactivating a location that has physical on-hand stock with 400', async () => {
      // Temporarily link a stock balance to testBin2Id
      const item = await prisma.item.findFirst({ where: { code: 'ARD-UNO-R3' } });
      expect(item).toBeTruthy();

      const tempBalance = await prisma.stockBalance.create({
        data: {
          itemId: item!.id,
          locationId: testBin2Id,
          onHand: 15, // Physical stock!
        },
      });

      const res = await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
          reason: 'Thử tắt khi còn tồn kho',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vẫn còn tồn kho vật lý/);

      // Clean up temporary stock balance
      await prisma.stockBalance.delete({ where: { id: tempBalance.id } });
    });

    it('SAFE GUARD: blocks deactivating a location when active Tracked Asset exists at location with 400', async () => {
      const item = await prisma.item.findFirst({ where: { code: 'ARD-UNO-R3' } });
      expect(item).toBeTruthy();

      const tempAsset = await prisma.asset.create({
        data: {
          serialNumber: `TEST-ASSET-LOC-${Date.now()}`,
          itemId: item!.id,
          locationId: testBin2Id,
          status: 'AVAILABLE',
        },
      });

      const res = await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
          reason: 'Thử tắt khi còn thiết bị',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vẫn còn.*tài sản\/thiết bị/);

      await prisma.asset.delete({ where: { id: tempAsset.id } });
    });

    it('SAFE GUARD: blocks deactivating a location when active StockReservation exists with 400', async () => {
      const item = await prisma.item.findFirst({ where: { code: 'ARD-UNO-R3' } });
      const student = await prisma.user.findFirst({ where: { role: 'STUDENT' } });
      expect(item).toBeTruthy();
      expect(student).toBeTruthy();

      const tempBorrowReq = await prisma.borrowRequest.create({
        data: {
          requestNumber: `TEST-BR-${Date.now()}`,
          borrowerId: student!.id,
          purpose: 'Mượn thiết bị kiểm thử deactivation',
          expectedBorrowDate: new Date(),
          expectedReturnDate: new Date(Date.now() + 86400000),
        },
      });

      const tempRes = await prisma.stockReservation.create({
        data: {
          borrowRequestId: tempBorrowReq.id,
          itemId: item!.id,
          locationId: testBin2Id,
          quantity: 2,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
          reason: 'Thử tắt khi còn phiếu giữ chỗ',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/phiếu giữ chỗ/);

      await prisma.stockReservation.delete({ where: { id: tempRes.id } });
      await prisma.borrowRequest.delete({ where: { id: tempBorrowReq.id } });
    });

    it('allows deactivating an empty leaf location (BIN-2)', async () => {
      const res = await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
          reason: 'Bảo trì khay linh kiện',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'DEACTIVATE_LOCATION',
          entityId: testBin2Id,
        },
      });
      expect(audit).toBeDefined();
    });

    it('allows reactivating the deactivated leaf location', async () => {
      const res = await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: true,
          reason: 'Hoàn tất bảo trì khay linh kiện',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'REACTIVATE_LOCATION',
          entityId: testBin2Id,
        },
      });
      expect(audit).toBeDefined();
    });

    it('SAFE GUARD 3: blocks reactivating a child location when its parent is inactive', async () => {
      // First, deactivate leaf bin2
      await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      // Deactivate shelf and bin1
      await request(app)
        .patch(`/api/v1/locations/${testBin1Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      await request(app)
        .patch(`/api/v1/locations/${testShelfId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      // Now rack has no active children -> can deactivate rack
      const deactRack = await request(app)
        .patch(`/api/v1/locations/${testRackId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(deactRack.status).toBe(200);

      // Now attempting to reactivate testBin2Id (whose parent testRackId is inactive) must fail!
      const reactivateChild = await request(app)
        .patch(`/api/v1/locations/${testBin2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(reactivateChild.status).toBe(400);
      expect(reactivateChild.body.message).toMatch(/khi vị trí cha.*đang bị vô hiệu hóa/);

      // Restore rack active status
      await request(app)
        .patch(`/api/v1/locations/${testRackId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
    });

    it('blocks STUDENT from directly accessing inactive location with 403 Forbidden', async () => {
      // testBin1Id is currently inactive
      const res = await request(app)
        .get(`/api/v1/locations/${testBin1Id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/không có quyền/);
    });

    it('forbids TECHNICIAN and STUDENT from changing status (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/locations/${testBin1Id}/status`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ isActive: true });

      expect(res.status).toBe(403);
    });
  });

  // ========================================================
  // 7. DELETE /api/v1/locations/:id (Forbidden 405)
  // ========================================================
  describe('DELETE /api/v1/locations/:id', () => {
    it('returns 405 Method Not Allowed for DELETE request', async () => {
      const res = await request(app).delete(`/api/v1/locations/${testBin1Id}`);
      expect(res.status).toBe(405);
      expect(res.body.message).toMatch(/không hỗ trợ xóa vật lý/);
    });
  });
});
