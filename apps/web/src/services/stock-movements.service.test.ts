import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stockMovementsService } from './stock-movements.service';
import { apiClient } from './api';
import { StockTransactionType, StockMovementSortField, SortOrder } from '@acm/shared';

vi.mock('./api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('ACM Step S2C-2: stockMovementsService Unit Tests (GET Only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-MOV-01: listMovements calls GET /stock-movements with default parameters', async () => {
    const mockResponse = {
      data: {
        success: true,
        message: 'Lịch sử biến động kho',
        data: [
          {
            id: 'mov-1',
            itemId: 'item-1',
            locationId: 'loc-1',
            type: StockTransactionType.IMPORT,
            quantityDelta: 50,
            onHandBefore: 10,
            onHandAfter: 60,
            referenceType: 'STOCK_TRANSACTION',
            referenceId: 'tx-001',
            reason: 'Nhập kho lô mới',
            createdAt: '2026-10-14T10:00:00.000Z',
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    };

    (apiClient.get as any).mockResolvedValueOnce(mockResponse);

    const result = await stockMovementsService.listMovements();

    expect(apiClient.get).toHaveBeenCalledWith('/stock-movements', { params: {} });
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].id).toBe('mov-1');
    expect(result.movements[0].quantityDelta).toBe(50);
    expect(result.meta.totalItems).toBe(1);
  });

  it('TC-MOV-02: listMovements cleans and passes all search and filter parameters', async () => {
    const mockResponse = {
      data: {
        data: [],
        meta: {
          page: 2,
          limit: 10,
          totalItems: 35,
          totalPages: 4,
          hasNextPage: true,
          hasPrevPage: true,
        },
      },
    };

    (apiClient.get as any).mockResolvedValueOnce(mockResponse);

    const params = {
      search: '  Kiểm kê định kỳ  ',
      itemId: '00000000-0000-0000-0000-000000000001',
      locationId: '00000000-0000-0000-0000-000000000002',
      type: StockTransactionType.ADJUSTMENT,
      referenceType: 'STOCK_TRANSACTION',
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      sortBy: StockMovementSortField.QUANTITY_DELTA,
      sortOrder: SortOrder.ASC,
      page: 2,
      limit: 10,
    };

    const result = await stockMovementsService.listMovements(params);

    expect(apiClient.get).toHaveBeenCalledWith('/stock-movements', {
      params: {
        search: 'Kiểm kê định kỳ',
        itemId: '00000000-0000-0000-0000-000000000001',
        locationId: '00000000-0000-0000-0000-000000000002',
        type: StockTransactionType.ADJUSTMENT,
        referenceType: 'STOCK_TRANSACTION',
        startDate: '2026-10-01',
        endDate: '2026-10-14',
        sortBy: StockMovementSortField.QUANTITY_DELTA,
        sortOrder: SortOrder.ASC,
        page: 2,
        limit: 10,
      },
    });

    expect(result.meta.page).toBe(2);
    expect(result.meta.totalItems).toBe(35);
  });

  it('TC-MOV-03: listMovements provides safe fallback meta when response data is undefined', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      data: {},
    });

    const result = await stockMovementsService.listMovements();

    expect(result.movements).toEqual([]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('TC-MOV-04: listMovements does NOT include empty search string in query params', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      data: { data: [] },
    });

    await stockMovementsService.listMovements({ search: '   ' });

    expect(apiClient.get).toHaveBeenCalledWith('/stock-movements', { params: {} });
  });
});
