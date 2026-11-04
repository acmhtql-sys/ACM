import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';
import { reportsRouter } from '../src/modules/reports/reports.router';
import { prisma } from '../src/config/database';
import { AppError } from '../src/shared/AppError';

// Mock prisma client
vi.mock('../src/config/database', () => ({
  prisma: {
    item: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    stockBalance: {
      findMany: vi.fn(),
    },
    borrowRequest: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    stockTransaction: {
      findMany: vi.fn(),
    },
  },
}));

// Mock auth middleware so we can control req.user and test RBAC / route logic
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
  ended: boolean = false;
  private onEnd?: (res: MockResponse) => void;

  setOnEnd(cb: (res: MockResponse) => void) {
    this.onEnd = cb;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: any) {
    this.body = payload;
    this.ended = true;
    if (this.onEnd) this.onEnd(this);
    return this;
  }

  send(payload: any) {
    this.body = payload;
    this.ended = true;
    if (this.onEnd) this.onEnd(this);
    return this;
  }
}

function invokeRouter(
  router: any,
  req: any,
  res: MockResponse
): Promise<{ req: any; res: MockResponse; err?: any }> {
  return new Promise((resolve) => {
    res.setOnEnd(() => {
      resolve({ req, res });
    });
    router(req, res, (err: any) => {
      resolve({ req, res, err });
    });
  });
}

describe('Reports & Dashboard API – Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/reports/summary RBAC & Authentication', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: {},
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(reportsRouter, req, res);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
    });

    it('returns 403 when user is STUDENT', async () => {
      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: { authorization: 'Bearer token' },
        user: { id: 'std-1', role: UserRole.STUDENT },
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(reportsRouter, req, res);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    it('returns 403 when user is TECHNICIAN', async () => {
      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: { authorization: 'Bearer token' },
        user: { id: 'tech-1', role: UserRole.TECHNICIAN },
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(reportsRouter, req, res);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    it('returns 403 when user is LAB_MANAGER', async () => {
      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: { authorization: 'Bearer token' },
        user: { id: 'mgr-1', role: UserRole.LAB_MANAGER },
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(reportsRouter, req, res);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });
  });

  describe('Inventory KPI & Invariant Formula Evaluation', () => {
    it('computes inventory KPIs accurately without double-subtracting borrowed stock', async () => {
      vi.mocked(prisma.item.count).mockResolvedValue(10);

      // Warehouse stock balances:
      // OnHand: 100, Reserved: 15, Quarantined: 5, KitAllocated: 10, Borrowed: 25
      // Expected Available: 100 - 15 - 5 - 10 = 70.
      // Borrowed (25) is already outside the lab and must NOT be deducted twice.
      vi.mocked(prisma.stockBalance.findMany).mockResolvedValue([
        {
          id: 'sb-1',
          itemId: 'item-1',
          locationId: 'loc-1',
          onHand: 60,
          reserved: 10,
          quarantined: 2,
          kitAllocated: 5,
          borrowed: 15,
        },
        {
          id: 'sb-2',
          itemId: 'item-2',
          locationId: 'loc-2',
          onHand: 40,
          reserved: 5,
          quarantined: 3,
          kitAllocated: 5,
          borrowed: 10,
        },
      ] as any);

      // Active borrow requests query must include PARTIALLY_RETURNED
      vi.mocked(prisma.borrowRequest.count).mockImplementation(async (args: any) => {
        if (args?.where?.status?.in) {
          expect(args.where.status.in).toContain('APPROVED');
          expect(args.where.status.in).toContain('HANDED_OVER');
          expect(args.where.status.in).toContain('PARTIALLY_RETURNED');
          return 4; // 4 active borrows
        }
        if (args?.where?.status === 'PENDING') {
          return 2; // 2 pending approval
        }
        return 0;
      });

      // Active items low stock check
      vi.mocked(prisma.item.findMany).mockResolvedValue([
        {
          id: 'item-1',
          minStockAlert: 10,
          stockBalances: [
            { onHand: 60, reserved: 10, quarantined: 2, kitAllocated: 5, borrowed: 15 },
          ], // available = 43 >= 10 -> OK
        },
        {
          id: 'item-2',
          minStockAlert: 30,
          stockBalances: [
            { onHand: 40, reserved: 5, quarantined: 3, kitAllocated: 5, borrowed: 10 },
          ], // available = 27 < 30 -> LOW STOCK
        },
        {
          id: 'item-3',
          minStockAlert: 5,
          stockBalances: [], // available = 0 < 5 -> LOW STOCK (out of stock)
        },
      ] as any);

      vi.mocked(prisma.stockTransaction.findMany).mockResolvedValue([]);
      vi.mocked(prisma.borrowRequest.findMany).mockResolvedValue([]);

      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: { authorization: 'Bearer admin-token' },
        user: { id: 'admin-id', role: UserRole.ADMIN },
      };
      const res = new MockResponse();
      await invokeRouter(reportsRouter, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const kpis = res.body.data.kpis;
      expect(kpis.totalItems).toBe(10);
      expect(kpis.totalOnHand).toBe(100);
      expect(kpis.totalReserved).toBe(15);
      expect(kpis.totalQuarantined).toBe(5);
      expect(kpis.totalKitAllocated).toBe(10);
      expect(kpis.totalBorrowed).toBe(25);
      expect(kpis.totalAvailable).toBe(70); // 100 - 15 - 5 - 10 = 70
      expect(kpis.activeBorrows).toBe(4);
      expect(kpis.pendingApprovalBorrows).toBe(2);
      expect(kpis.lowStockCount).toBe(2); // item-2 and item-3

      // Distribution chart checks
      const dist = res.body.data.distribution;
      expect(dist.find((d: any) => d.name.includes('Available'))?.value).toBe(70);
      expect(dist.find((d: any) => d.name.includes('Borrowed'))?.value).toBe(25);
      expect(dist.find((d: any) => d.name.includes('Reserved'))?.value).toBe(15);
      expect(dist.find((d: any) => d.name.includes('KitAllocated'))?.value).toBe(10);
      expect(dist.find((d: any) => d.name.includes('Quarantined'))?.value).toBe(5);

      // Monthly trends: empty when no transactions exist
      expect(res.body.data.monthlyTrends).toEqual([]);
    });

    it('computes real monthly trends when historical transactions exist', async () => {
      vi.mocked(prisma.item.count).mockResolvedValue(5);
      vi.mocked(prisma.stockBalance.findMany).mockResolvedValue([]);
      vi.mocked(prisma.borrowRequest.count).mockResolvedValue(0);
      vi.mocked(prisma.item.findMany).mockResolvedValue([]);

      const now = new Date();
      vi.mocked(prisma.stockTransaction.findMany).mockResolvedValue([
        {
          id: 'tx-1',
          type: 'IMPORT',
          status: 'COMPLETED',
          createdAt: now,
          details: [{ quantity: 50 }, { quantity: 30 }],
        },
        {
          id: 'tx-2',
          type: 'EXPORT',
          status: 'COMPLETED',
          createdAt: now,
          details: [{ quantity: 15 }],
        },
      ] as any);

      vi.mocked(prisma.borrowRequest.findMany).mockResolvedValue([
        { id: 'br-1', createdAt: now, status: 'APPROVED' },
      ] as any);

      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: { authorization: 'Bearer admin-token' },
        user: { id: 'admin-id', role: UserRole.ADMIN },
      };
      const res = new MockResponse();
      await invokeRouter(reportsRouter, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.monthlyTrends).toHaveLength(6);
      const latestMonth = res.body.data.monthlyTrends[5];
      expect(latestMonth.imports).toBe(80);
      expect(latestMonth.exports).toBe(15);
      expect(latestMonth.borrows).toBe(1);
    });

    it('forwards database errors through next()', async () => {
      vi.mocked(prisma.item.count).mockRejectedValue(new Error('Prisma Connection Failure'));

      const req: any = {
        method: 'GET',
        url: '/summary',
        headers: { authorization: 'Bearer admin-token' },
        user: { id: 'admin-id', role: UserRole.ADMIN },
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(reportsRouter, req, res);

      expect(err).toBeDefined();
      expect(err.message).toBe('Prisma Connection Failure');
    });
  });
});
