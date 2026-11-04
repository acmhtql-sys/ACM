import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, ItemType, BorrowStatus, StockStatus } from '@acm/shared';
import { reportsService } from '../src/modules/reports/reports.service';
import { reportsRouter } from '../src/modules/reports/reports.router';
import { prisma } from '../src/config/database';
import { AppError } from '../src/shared/AppError';

// Mock prisma client
vi.mock('../src/config/database', () => ({
  prisma: {
    item: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    stockBalance: {
      findMany: vi.fn(),
    },
    borrowRequest: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    returnDetail: {
      count: vi.fn(),
    },
  },
}));

// Mock auth middleware for router tests
vi.mock('../src/middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    if (!req.headers?.authorization) {
      return next(new AppError('Không có token xác thực', 401));
    }
    next();
  }),
}));

class MockResponse {
  statusCode: number = 200;
  headers: Record<string, string> = {};
  body: any = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(data: any) {
    this.body = data;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name] = value;
    return this;
  }
}

async function invokeRouter(
  router: any,
  method: string,
  path: string,
  reqOverrides: Record<string, any> = {}
): Promise<{ res: MockResponse; error?: any }> {
  return new Promise((resolve) => {
    const req: any = {
      method,
      url: path,
      originalUrl: path,
      headers: { authorization: 'Bearer test-token' },
      query: {},
      params: {},
      body: {},
      ...reqOverrides,
    };

    const res = new MockResponse();
    let errorHandled = false;

    const next = (err?: any) => {
      errorHandled = true;
      resolve({ res, error: err });
    };

    const origJson = res.json.bind(res);
    res.json = (data: any) => {
      origJson(data);
      if (!errorHandled) {
        resolve({ res });
      }
      return res;
    };

    router(req, res, next);
  });
}

describe('Reports & Analytics Module Unit & Router Tests', () => {
  const adminUser = {
    id: 'admin-uuid-001',
    email: 'admin@acm.local',
    fullName: 'Quản Trị Viên',
    role: UserRole.ADMIN,
  };

  const managerUser = {
    id: 'manager-uuid-002',
    email: 'manager@acm.local',
    fullName: 'Quản Lý Lab',
    role: UserRole.LAB_MANAGER,
  };

  const studentUser = {
    id: 'student-uuid-004',
    email: 'student@acm.local',
    fullName: 'Sinh Viên',
    role: UserRole.STUDENT,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ReportsService.getInventoryReport', () => {
    it('computes Available inventory using strict formula: onHand - reserved - quarantined - kitAllocated without subtracting borrowed twice', async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
        {
          id: 'item-1',
          code: 'ESP32-DEVKIT',
          name: 'ESP32 DevKit V1',
          unit: 'cái',
          type: ItemType.TRACKED_ASSET,
          minStockAlert: 5,
          category: { name: 'Vi điều khiển' },
          stockBalances: [
            {
              locationId: 'loc-1',
              onHand: 20,
              reserved: 3,
              quarantined: 2,
              kitAllocated: 5,
              borrowed: 4, // physically outside lab, onHand already excludes or tracks it
            },
            {
              locationId: 'loc-2',
              onHand: 10,
              reserved: 0,
              quarantined: 0,
              kitAllocated: 0,
              borrowed: 0,
            },
          ],
        } as any,
      ]);

      const report = await reportsService.getInventoryReport({}, adminUser as any);
      expect(report).toHaveLength(1);
      const row = report[0];

      // Total onHand: 20 + 10 = 30
      // Total reserved: 3
      // Total quarantined: 2
      // Total kitAllocated: 5
      // Total borrowed: 4
      // Available = max(0, 30 - 3 - 2 - 5) = 20. (Borrowed is NOT subtracted again)
      expect(row.onHand).toBe(30);
      expect(row.reserved).toBe(3);
      expect(row.quarantined).toBe(2);
      expect(row.kitAllocated).toBe(5);
      expect(row.borrowed).toBe(4);
      expect(row.available).toBe(20);
      expect(row.stockStatus).toBe(StockStatus.IN_STOCK);
    });

    it('correctly classifies OUT_OF_STOCK and LOW_STOCK based on minStockAlert per item', async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
        {
          id: 'item-out',
          code: 'OUT-01',
          name: 'Hết hàng',
          unit: 'cái',
          type: ItemType.CONSUMABLE,
          minStockAlert: 5,
          category: null,
          stockBalances: [
            { onHand: 5, reserved: 5, quarantined: 0, kitAllocated: 0, borrowed: 0 },
          ], // available = 0
        },
        {
          id: 'item-low',
          code: 'LOW-01',
          name: 'Sắp hết hàng',
          unit: 'cái',
          type: ItemType.CONSUMABLE,
          minStockAlert: 10,
          category: { name: 'Cảm biến' },
          stockBalances: [
            { onHand: 8, reserved: 0, quarantined: 0, kitAllocated: 0, borrowed: 0 },
          ], // available = 8 (< 10)
        },
      ] as any);

      const report = await reportsService.getInventoryReport({}, adminUser as any);
      expect(report).toHaveLength(2);
      expect(report[0].stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      expect(report[0].categoryName).toBe('Chưa phân loại');
      expect(report[1].stockStatus).toBe(StockStatus.LOW_STOCK);
    });

    it('handles empty inventory list gracefully without error', async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([]);
      const report = await reportsService.getInventoryReport({}, adminUser as any);
      expect(report).toEqual([]);
    });
  });

  describe('ReportsService.getBorrowReturnReport', () => {
    it('aggregates operational borrow metrics including PARTIALLY_RETURNED and overdue loans', async () => {
      vi.mocked(prisma.borrowRequest.count)
        .mockResolvedValueOnce(50) // totalRequests
        .mockResolvedValueOnce(5)  // approved
        .mockResolvedValueOnce(15) // handedOver
        .mockResolvedValueOnce(20) // returned
        .mockResolvedValueOnce(5)  // partiallyReturned
        .mockResolvedValueOnce(3)  // rejected
        .mockResolvedValueOnce(2); // cancelled

      vi.mocked(prisma.returnDetail.count).mockResolvedValueOnce(4); // damagedOrLost

      const pastDate = new Date(Date.now() - 3 * 24 * 3600 * 1000); // 3 days ago
      vi.mocked(prisma.borrowRequest.findMany).mockResolvedValueOnce([
        {
          id: 'req-overdue-1',
          requestNumber: 'REQ-2026-001',
          purpose: 'Làm đồ án tốt nghiệp',
          expectedBorrowDate: new Date('2026-02-01'),
          expectedReturnDate: pastDate,
          status: BorrowStatus.PARTIALLY_RETURNED,
          borrower: {
            fullName: 'Sinh Viên A',
            email: 'sva@student.acm.local',
            phoneNumber: '0901234567',
          },
          details: [
            {
              item: { code: 'ESP32', name: 'ESP32 DevKit' },
              quantity: 2,
              returnedQuantity: 1,
            },
          ],
        },
      ] as any);

      const result = await reportsService.getBorrowReturnReport(adminUser as any);
      expect(result.summary.totalRequests).toBe(50);
      expect(result.summary.handedOverCount).toBe(15);
      expect(result.summary.returnedCount).toBe(20);
      expect(result.summary.partiallyReturnedCount).toBe(5);
      expect(result.summary.damagedOrLostCount).toBe(4);
      expect(result.summary.overdueCount).toBe(1);

      // Return rate: returned / (handedOver + returned + partiallyReturned) = 20 / 40 = 50%
      expect(result.summary.returnRatePercent).toBe(50);

      // Overdue item detail
      expect(result.overdueList).toHaveLength(1);
      expect(result.overdueList[0].requestNumber).toBe('REQ-2026-001');
      expect(result.overdueList[0].borrowerName).toBe('Sinh Viên A');
      expect(result.overdueList[0].daysOverdue).toBeGreaterThanOrEqual(3);
      expect(result.overdueList[0].items[0].quantity).toBe(2);
      expect(result.overdueList[0].items[0].returnedQuantity).toBe(1);
    });

    it('handles empty borrow/return data gracefully (100% default return rate)', async () => {
      vi.mocked(prisma.borrowRequest.count).mockResolvedValue(0);
      vi.mocked(prisma.returnDetail.count).mockResolvedValue(0);
      vi.mocked(prisma.borrowRequest.findMany).mockResolvedValue([]);

      const result = await reportsService.getBorrowReturnReport(adminUser as any);
      expect(result.summary.totalRequests).toBe(0);
      expect(result.summary.returnRatePercent).toBe(100);
      expect(result.overdueList).toHaveLength(0);
    });
  });

  describe('ReportsService.getLowStockAlerts', () => {
    it('returns items at or below minStockAlert threshold and sorts by urgency ratio ascending', async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
        {
          id: 'item-1',
          code: 'SEN-01',
          name: 'Cảm biến siêu âm',
          unit: 'cái',
          minStockAlert: 10,
          category: { name: 'Cảm biến' },
          stockBalances: [{ onHand: 5, reserved: 0, quarantined: 0, kitAllocated: 0 }], // avail = 5, urgency = 5/10 = 0.5
        },
        {
          id: 'item-2',
          code: 'RES-01',
          name: 'Điện trở 10k',
          unit: 'gói',
          minStockAlert: 20,
          category: { name: 'Linh kiện dán' },
          stockBalances: [{ onHand: 2, reserved: 0, quarantined: 0, kitAllocated: 0 }], // avail = 2, urgency = 2/20 = 0.1
        },
        {
          id: 'item-3',
          code: 'OK-01',
          name: 'Nguồn tổ ong',
          unit: 'cái',
          minStockAlert: 2,
          category: null,
          stockBalances: [{ onHand: 10, reserved: 0, quarantined: 0, kitAllocated: 0 }], // avail = 10 (> 2, not alert)
        },
      ] as any);

      const alerts = await reportsService.getLowStockAlerts(adminUser as any);
      expect(alerts).toHaveLength(2);
      // Most urgent first: RES-01 (0.1) before SEN-01 (0.5)
      expect(alerts[0].code).toBe('RES-01');
      expect(alerts[0].urgencyRatio).toBe(0.1);
      expect(alerts[1].code).toBe('SEN-01');
      expect(alerts[1].urgencyRatio).toBe(0.5);
    });
  });

  describe('ReportsRouter RBAC & Authorization Gates', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const { error } = await invokeRouter(reportsRouter, 'GET', '/inventory', {
        headers: {},
      });
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(401);
    });

    it('rejects non-ADMIN users (LAB_MANAGER, STUDENT) with 403 Forbidden on /inventory', async () => {
      const { error: managerErr } = await invokeRouter(reportsRouter, 'GET', '/inventory', {
        user: managerUser,
      });
      expect(managerErr).toBeDefined();
      expect(managerErr.statusCode).toBe(403);

      const { error: studentErr } = await invokeRouter(reportsRouter, 'GET', '/inventory', {
        user: studentUser,
      });
      expect(studentErr).toBeDefined();
      expect(studentErr.statusCode).toBe(403);
    });

    it('rejects non-ADMIN users with 403 on /borrow-return and /low-stock', async () => {
      const { error: brErr } = await invokeRouter(reportsRouter, 'GET', '/borrow-return', {
        user: managerUser,
      });
      expect(brErr.statusCode).toBe(403);

      const { error: lsErr } = await invokeRouter(reportsRouter, 'GET', '/low-stock', {
        user: studentUser,
      });
      expect(lsErr.statusCode).toBe(403);
    });

    it('allows ADMIN to access /inventory, /borrow-return, and /low-stock with 200 OK', async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValue([]);
      vi.mocked(prisma.borrowRequest.count).mockResolvedValue(0);
      vi.mocked(prisma.returnDetail.count).mockResolvedValue(0);

      const { res: invRes } = await invokeRouter(reportsRouter, 'GET', '/inventory', {
        user: adminUser,
      });
      expect(invRes.statusCode).toBe(200);
      expect(invRes.body?.success).toBe(true);

      const { res: brRes } = await invokeRouter(reportsRouter, 'GET', '/borrow-return', {
        user: adminUser,
      });
      expect(brRes.statusCode).toBe(200);

      const { res: lsRes } = await invokeRouter(reportsRouter, 'GET', '/low-stock', {
        user: adminUser,
      });
      expect(lsRes.statusCode).toBe(200);
    });
  });
});
