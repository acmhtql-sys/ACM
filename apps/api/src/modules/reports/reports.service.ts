import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../middleware/auth';
import {
  BorrowStatus,
  StockStatus,
  ItemType,
  InventoryReportItem,
  BorrowReturnReportResponse,
  BorrowReturnReportSummary,
  OverdueLoanItem,
  LowStockAlertItem,
  QueryReportsInput,
} from '@acm/shared';

export class ReportsService {
  /**
   * Retrieves detailed inventory valuation report by item, category and stock distribution.
   * Ground truth: Available = max(0, onHand - reserved - quarantined - kitAllocated).
   * Borrowed items are not subtracted twice.
   */
  async getInventoryReport(
    query: QueryReportsInput,
    _currentUser: AuthenticatedUser
  ): Promise<InventoryReportItem[]> {
    const where: any = { isActive: true };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.type) {
      where.type = query.type;
    }

    const items = await prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true } },
        stockBalances: true,
      },
      orderBy: { code: 'asc' },
    });

    return items.map((item) => {
      let onHand = 0;
      let reserved = 0;
      let quarantined = 0;
      let kitAllocated = 0;
      let borrowed = 0;

      for (const bal of item.stockBalances) {
        onHand += bal.onHand;
        reserved += bal.reserved;
        quarantined += bal.quarantined;
        kitAllocated += bal.kitAllocated;
        borrowed += bal.borrowed;
      }

      const available = Math.max(0, onHand - reserved - quarantined - kitAllocated);

      let stockStatus = StockStatus.IN_STOCK;
      if (available === 0) {
        stockStatus = StockStatus.OUT_OF_STOCK;
      } else if (available < item.minStockAlert) {
        stockStatus = StockStatus.LOW_STOCK;
      }

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        type: item.type as unknown as ItemType,
        categoryName: item.category?.name || 'Chưa phân loại',
        onHand,
        reserved,
        quarantined,
        kitAllocated,
        borrowed,
        available,
        minStockAlert: item.minStockAlert,
        stockStatus,
      };
    });
  }

  /**
   * Retrieves comprehensive borrow and return operational statistics.
   * Includes PARTIALLY_RETURNED in active counts and overdue detection.
   */
  async getBorrowReturnReport(_currentUser: AuthenticatedUser): Promise<BorrowReturnReportResponse> {
    const [
      totalRequests,
      approvedCount,
      handedOverCount,
      returnedCount,
      partiallyReturnedCount,
      rejectedCount,
      cancelledCount,
      damagedOrLostDetails,
      overdueRecords,
    ] = await Promise.all([
      prisma.borrowRequest.count(),
      prisma.borrowRequest.count({ where: { status: BorrowStatus.APPROVED } }),
      prisma.borrowRequest.count({ where: { status: BorrowStatus.HANDED_OVER } }),
      prisma.borrowRequest.count({ where: { status: BorrowStatus.RETURNED } }),
      prisma.borrowRequest.count({ where: { status: BorrowStatus.PARTIALLY_RETURNED } }),
      prisma.borrowRequest.count({ where: { status: BorrowStatus.REJECTED } }),
      prisma.borrowRequest.count({ where: { status: BorrowStatus.CANCELLED } }),
      prisma.returnDetail.count({
        where: { condition: { in: ['DAMAGED', 'LOST'] } },
      }),
      prisma.borrowRequest.findMany({
        where: {
          status: { in: [BorrowStatus.HANDED_OVER, BorrowStatus.PARTIALLY_RETURNED] },
          expectedReturnDate: { lt: new Date() },
        },
        include: {
          borrower: { select: { fullName: true, email: true, phoneNumber: true } },
          details: { include: { item: { select: { name: true, code: true } } } },
        },
        orderBy: { expectedReturnDate: 'asc' },
      }),
    ]);

    const activeOrCompleted = handedOverCount + returnedCount + partiallyReturnedCount;
    const returnRatePercent =
      activeOrCompleted > 0 ? Math.round((returnedCount / activeOrCompleted) * 100) : 100;

    const summary: BorrowReturnReportSummary = {
      totalRequests,
      approvedCount,
      handedOverCount,
      returnedCount,
      partiallyReturnedCount,
      rejectedCount,
      cancelledCount,
      overdueCount: overdueRecords.length,
      returnRatePercent,
      damagedOrLostCount: damagedOrLostDetails,
    };

    const now = Date.now();
    const overdueList: OverdueLoanItem[] = overdueRecords.map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      borrowerName: r.borrower?.fullName,
      borrowerEmail: r.borrower?.email,
      borrowerPhone: r.borrower?.phoneNumber,
      purpose: r.purpose,
      expectedBorrowDate: r.expectedBorrowDate,
      expectedReturnDate: r.expectedReturnDate,
      daysOverdue: Math.max(
        1,
        Math.floor((now - new Date(r.expectedReturnDate).getTime()) / (1000 * 3600 * 24))
      ),
      items: r.details.map((d) => ({
        code: d.item?.code,
        name: d.item?.name,
        quantity: d.quantity,
        returnedQuantity: d.returnedQuantity,
      })),
    }));

    return {
      summary,
      overdueList,
    };
  }

  /**
   * Retrieves items whose available quantity is at or below their configured minStockAlert threshold.
   * Sorted by urgency ratio (available / minStockAlert) ascending.
   */
  async getLowStockAlerts(_currentUser: AuthenticatedUser): Promise<LowStockAlertItem[]> {
    const items = await prisma.item.findMany({
      where: { isActive: true },
      include: {
        category: { select: { name: true } },
        stockBalances: true,
      },
    });

    const alerts: LowStockAlertItem[] = [];

    for (const item of items) {
      let onHand = 0;
      let reserved = 0;
      let quarantined = 0;
      let kitAllocated = 0;

      for (const bal of item.stockBalances) {
        onHand += bal.onHand;
        reserved += bal.reserved;
        quarantined += bal.quarantined;
        kitAllocated += bal.kitAllocated;
      }

      const available = Math.max(0, onHand - reserved - quarantined - kitAllocated);

      if (available <= item.minStockAlert) {
        const stockStatus = available === 0 ? StockStatus.OUT_OF_STOCK : StockStatus.LOW_STOCK;
        const urgencyRatio = item.minStockAlert > 0 ? available / item.minStockAlert : 0;

        alerts.push({
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          categoryName: item.category?.name || 'Chưa phân loại',
          onHand,
          available,
          minStockAlert: item.minStockAlert,
          stockStatus,
          urgencyRatio,
        });
      }
    }

    alerts.sort((a, b) => a.urgencyRatio - b.urgencyRatio);
    return alerts;
  }
}

export const reportsService = new ReportsService();
