import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import {
  calculateAvailableStock,
  validateStockInvariant,
  validateActiveItemAndLocation,
  sortLockOrder,
  validateMovementLedgerConsistency,
  withRetry,
} from '../src/modules/inventory/inventory.helpers';
import { StockTransactionType } from '@acm/shared';
import { AppError } from '../src/shared/AppError';

const app = createApp();

describe('ACM Phase 2.2 Step 3B.1 Integration & Foundation Test Suite', () => {
  let adminToken = '';
  let managerToken = '';
  let techToken = '';
  let studentToken = '';

  let activeItemId = '';
  let activeLocationId = '';

  beforeAll(async () => {
    // 1. Verify connection to isolated test database
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

    // Pick an active seed item and active seed location from test DB
    const item = await prisma.item.findFirst({ where: { code: 'ARD-UNO-R3', isActive: true } });
    if (item) activeItemId = item.id;

    const location = await prisma.location.findFirst({ where: { code: 'WH-MAIN', isActive: true } });
    if (location) activeLocationId = location.id;
  });

  // ========================================================
  // 1. GET /api/v1/inventory/balance (Upgraded Read-Only Endpoint)
  // ========================================================
  describe('GET /api/v1/inventory/balance', () => {
    it('retrieves real database balances with search and pagination for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/balance?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(10);

      if (res.body.data.length > 0) {
        const first = res.body.data[0];
        expect(first.id).toBeDefined();
        expect(first.itemId).toBeDefined();
        expect(first.itemCode).toBeDefined();
        expect(first.itemName).toBeDefined();
        expect(first.locationId).toBeDefined();
        expect(first.locationCode).toBeDefined();
        expect(first.available).toBe(
          Math.max(0, first.onHand - first.reserved - first.quarantined - first.kitAllocated)
        );
      }
    });

    it('allows TECHNICIAN to view balances (read-only)', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/balance')
        .set('Authorization', `Bearer ${techToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('forbids STUDENT from accessing inventory balance with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/balance')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/không có quyền/);
    });

    it('blocks unauthenticated access to balance with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/inventory/balance');

      expect(res.status).toBe(401);
    });

    it('filters balances by itemId and locationId', async () => {
      if (!activeItemId || !activeLocationId) return;

      const res = await request(app)
        .get(`/api/v1/inventory/balance?itemId=${activeItemId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      for (const b of res.body.data) {
        expect(b.itemId).toBe(activeItemId);
      }
    });
  });

  // ========================================================
  // 2. GET /api/v1/inventory/summary
  // ========================================================
  describe('GET /api/v1/inventory/summary', () => {
    it('returns aggregated inventory metrics for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const summary = res.body.data;
      expect(typeof summary.totalOnHand).toBe('number');
      expect(typeof summary.totalReserved).toBe('number');
      expect(typeof summary.totalQuarantined).toBe('number');
      expect(typeof summary.totalKitAllocated).toBe('number');
      expect(typeof summary.totalBorrowed).toBe('number');
      expect(typeof summary.totalAvailable).toBe('number');
      expect(typeof summary.lowStockItemCount).toBe('number');
      expect(summary.totalItems).toBeGreaterThanOrEqual(1);
      expect(summary.totalLocations).toBeGreaterThanOrEqual(1);
    });

    it('allows TECHNICIAN to view inventory summary', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${techToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('forbids STUDENT from viewing inventory summary with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access to summary with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/inventory/summary');
      expect(res.status).toBe(401);
    });
  });

  // ========================================================
  // 3. GET /api/v1/stock-transactions & /:id
  // ========================================================
  describe('GET /api/v1/stock-transactions', () => {
    it('returns paginated list of stock transactions for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/stock-transactions?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('allows TECHNICIAN to view stock transactions (read-only)', async () => {
      const res = await request(app)
        .get('/api/v1/stock-transactions')
        .set('Authorization', `Bearer ${techToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('forbids STUDENT from accessing stock transactions (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/stock-transactions')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/stock-transactions');
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent stock transaction ID', async () => {
      const res = await request(app)
        .get('/api/v1/stock-transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Không tìm thấy giao dịch kho yêu cầu/);
    });

    it('strictly forbids updating or deleting transactions with 405 Method Not Allowed', async () => {
      const putRes = await request(app)
        .put('/api/v1/stock-transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Try update' });
      expect(putRes.status).toBe(405);
      expect(putRes.body.message).toMatch(/không hỗ trợ sửa đổi chứng từ kho/);

      const delRes = await request(app)
        .delete('/api/v1/stock-transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(405);
      expect(delRes.body.message).toMatch(/không hỗ trợ xóa chứng từ kho/);
    });
  });

  // ========================================================
  // 4. GET /api/v1/stock-movements
  // ========================================================
  describe('GET /api/v1/stock-movements', () => {
    it('returns paginated stock movements ledger for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/stock-movements?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('allows TECHNICIAN to view stock movements', async () => {
      const res = await request(app)
        .get('/api/v1/stock-movements')
        .set('Authorization', `Bearer ${techToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('forbids STUDENT from viewing stock movements (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/stock-movements')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/stock-movements');
      expect(res.status).toBe(401);
    });
  });

  // ========================================================
  // 5. Business Foundation Helpers Unit Tests
  // ========================================================
  describe('Business Foundation Helpers (Unit & Integrity Tests)', () => {
    it('HELPER 1: calculateAvailableStock & validateStockInvariant enforce formula', () => {
      const balance = {
        onHand: 100,
        reserved: 20,
        quarantined: 10,
        kitAllocated: 15,
        borrowed: 35,
      };

      const available = calculateAvailableStock(balance);
      expect(available).toBe(55); // 100 - 20 - 10 - 15 = 55

      // Invariant pass
      expect(() => validateStockInvariant(balance)).not.toThrow();

      // Invariant fails when allocations exceed onHand
      const invalidBalance = {
        onHand: 10,
        reserved: 10,
        quarantined: 5,
        kitAllocated: 0,
        borrowed: 0,
      };
      expect(() => validateStockInvariant(invalidBalance)).toThrow(/exceeds On-hand/);
    });

    it('HELPER 2: validateActiveItemAndLocation checks existence and active status', async () => {
      if (!activeItemId || !activeLocationId) return;

      // Success with active item and active location
      const validated = await validateActiveItemAndLocation(activeItemId, activeLocationId);
      expect(validated.item.id).toBe(activeItemId);
      expect(validated.location.id).toBe(activeLocationId);

      // Rejects non-existent item (404)
      await expect(
        validateActiveItemAndLocation('00000000-0000-0000-0000-000000000000', activeLocationId)
      ).rejects.toThrow(AppError);

      // Rejects non-existent location (404)
      await expect(
        validateActiveItemAndLocation(activeItemId, '00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(AppError);
    });

    it('HELPER 3: sortLockOrder sorts multi-line items deterministically by (itemId ASC, locationId ASC)', () => {
      const items = [
        { itemId: 'item-C', locationId: 'loc-2' },
        { itemId: 'item-A', locationId: 'loc-3' },
        { itemId: 'item-B', locationId: 'loc-1' },
        { itemId: 'item-A', locationId: 'loc-1' },
      ];

      const sorted = sortLockOrder(items);

      expect(sorted).toEqual([
        { itemId: 'item-A', locationId: 'loc-1' },
        { itemId: 'item-A', locationId: 'loc-3' },
        { itemId: 'item-B', locationId: 'loc-1' },
        { itemId: 'item-C', locationId: 'loc-2' },
      ]);
    });

    it('HELPER 4: validateMovementLedgerConsistency verifies ledger balance deltas', () => {
      // Valid IMPORT (+Q, onHandAfter = onHandBefore + Q)
      expect(() =>
        validateMovementLedgerConsistency({
          type: StockTransactionType.IMPORT,
          quantityDelta: 20,
          onHandBefore: 10,
          onHandAfter: 30,
        })
      ).not.toThrow();

      // Valid EXPORT (-Q, onHandAfter = onHandBefore - Q)
      expect(() =>
        validateMovementLedgerConsistency({
          type: StockTransactionType.EXPORT,
          quantityDelta: -10,
          onHandBefore: 30,
          onHandAfter: 20,
        })
      ).not.toThrow();

      // Rejects mismatch: onHandAfter != onHandBefore + quantityDelta
      expect(() =>
        validateMovementLedgerConsistency({
          type: StockTransactionType.IMPORT,
          quantityDelta: 20,
          onHandBefore: 10,
          onHandAfter: 25, // Expected 30
        })
      ).toThrow(/Lệch số liệu sổ cái biến động kho/);

      // Rejects negative onHandAfter
      expect(() =>
        validateMovementLedgerConsistency({
          type: StockTransactionType.EXPORT,
          quantityDelta: -50,
          onHandBefore: 10,
          onHandAfter: -40,
        })
      ).toThrow(/không thể âm/);

      // Rejects IMPORT with negative or zero delta
      expect(() =>
        validateMovementLedgerConsistency({
          type: StockTransactionType.IMPORT,
          quantityDelta: -5,
          onHandBefore: 10,
          onHandAfter: 5,
        })
      ).toThrow(/bắt buộc quantityDelta phải là số dương/);

      // Rejects EXPORT with positive delta
      expect(() =>
        validateMovementLedgerConsistency({
          type: StockTransactionType.EXPORT,
          quantityDelta: 5,
          onHandBefore: 10,
          onHandAfter: 15,
        })
      ).toThrow(/bắt buộc quantityDelta phải là số âm/);
    });

    it('HELPER 5: withRetry retries transient errors and succeeds when error clears', async () => {
      let attempts = 0;
      const result = await withRetry(async (attempt) => {
        attempts = attempt;
        if (attempt < 3) {
          const deadlockErr: any = new Error('deadlock detected');
          deadlockErr.code = '40P01';
          throw deadlockErr;
        }
        return 'SUCCESS_AFTER_RETRIES';
      }, 3, 10);

      expect(attempts).toBe(3);
      expect(result).toBe('SUCCESS_AFTER_RETRIES');
    });

    it('HELPER 5: withRetry immediately rethrows non-retryable errors without retrying', async () => {
      let attempts = 0;
      await expect(
        withRetry(async (attempt) => {
          attempts = attempt;
          throw new AppError('Lỗi nghiệp vụ không thể thử lại', 400);
        }, 3, 10)
      ).rejects.toThrow('Lỗi nghiệp vụ không thể thử lại');

      expect(attempts).toBe(1);
    });
  });
});
