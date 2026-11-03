// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stockTransactionsService } from './stock-transactions.service';
import { apiClient } from './api';
import {
  StockTransactionType,
  TransactionStatus,
  StockTransactionSortField,
  SortOrder,
  ImportStockInput,
  ExportStockInput,
  TransferStockInput,
  AdjustStockInput,
} from '@acm/shared';

// Mock apiClient to isolate all HTTP communication without real network or DB access
vi.mock('./api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('stockTransactionsService - Client Service Mock Contract Test Suite (Task 5)', () => {
  const mockIdempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  const sampleImportPayload: ImportStockInput = {
    notes: 'Phiếu nhập linh kiện đợt 1',
    items: [
      {
        itemId: '11111111-1111-1111-1111-111111111111',
        locationId: '22222222-2222-2222-2222-222222222222',
        quantity: 10,
        unitCost: 150000,
        notes: 'Hàng mới 100%',
      },
    ],
  };

  const sampleExportPayload: ExportStockInput = {
    reason: 'Xuất linh kiện phục vụ thực hành môn Robot',
    notes: 'Kíp 1 thứ 3',
    items: [
      {
        itemId: '11111111-1111-1111-1111-111111111111',
        locationId: '22222222-2222-2222-2222-222222222222',
        quantity: 5,
      },
    ],
  };

  const sampleTransferPayload: TransferStockInput = {
    reason: 'Điều chuyển linh kiện sang ngăn chứa mới',
    notes: 'Sắp xếp lại kho',
    items: [
      {
        itemId: '11111111-1111-1111-1111-111111111111',
        fromLocationId: '22222222-2222-2222-2222-222222222222',
        toLocationId: '33333333-3333-3333-3333-333333333333',
        quantity: 4,
      },
    ],
  };

  const sampleAdjustPayload: AdjustStockInput = {
    reason: 'Kiểm kê định kỳ cuối tháng 10',
    notes: 'Số liệu kiểm đếm thực tế',
    items: [
      {
        itemId: '11111111-1111-1111-1111-111111111111',
        locationId: '22222222-2222-2222-2222-222222222222',
        actualOnHand: 12,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // =========================================================================
  // SUBGROUP 1: FAIL-CLOSED FEATURE FLAG PROTECTION (FLAG OFF)
  // =========================================================================
  describe('Fail-Closed Feature Flag Protection (VITE_ENABLE_STOCK_TRANSACTION_WRITES = false)', () => {
    it('SVC-FC-01: importStock throws Fail-Closed Error and blocks HTTP POST when flag is OFF', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'false');

      await expect(
        stockTransactionsService.importStock(sampleImportPayload, mockIdempotencyKey)
      ).rejects.toThrow('Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.');

      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('SVC-FC-02: exportStock throws Fail-Closed Error and blocks HTTP POST when flag is OFF', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'false');

      await expect(
        stockTransactionsService.exportStock(sampleExportPayload, mockIdempotencyKey)
      ).rejects.toThrow('Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.');

      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('SVC-FC-03: transferStock throws Fail-Closed Error and blocks HTTP POST when flag is OFF', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'false');

      await expect(
        stockTransactionsService.transferStock(sampleTransferPayload, mockIdempotencyKey)
      ).rejects.toThrow('Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.');

      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('SVC-FC-04: adjustStock throws Fail-Closed Error and blocks HTTP POST when flag is OFF', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'false');

      await expect(
        stockTransactionsService.adjustStock(sampleAdjustPayload, mockIdempotencyKey)
      ).rejects.toThrow('Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.');

      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('SVC-FC-05: adjustStock throws Fail-Closed Error and blocks HTTP POST when write flag is ON but adjustment flag is OFF', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'true');
      vi.stubEnv('VITE_ENABLE_STOCK_ADJUSTMENT', 'false');

      await expect(
        stockTransactionsService.adjustStock(sampleAdjustPayload, mockIdempotencyKey)
      ).rejects.toThrow(
        'Tính năng Điều chỉnh kho (ADJUSTMENT) đang bị khóa độc lập (chưa phê duyệt riêng).'
      );

      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SUBGROUP 2: MOCK CONTRACT VERIFICATION WITH SIMULATED FLAG ON
  // =========================================================================
  describe('Mock Contract Verification (Simulated Flag ON in Test Environment)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'true');
    });

    it('SVC-ON-01: importStock posts to /stock-transactions/import with exact endpoint, headers and payload', async () => {
      const mockResponseData = {
        id: 'tx-imp-01',
        transactionNumber: 'IMP-20261013-0001',
        type: StockTransactionType.IMPORT,
        status: TransactionStatus.COMPLETED,
        itemCount: 1,
        totalQuantity: 10,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: mockResponseData },
      });

      const result = await stockTransactionsService.importStock(
        sampleImportPayload,
        mockIdempotencyKey
      );

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/stock-transactions/import',
        sampleImportPayload,
        {
          headers: {
            'Idempotency-Key': mockIdempotencyKey,
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('SVC-ON-02: exportStock posts to /stock-transactions/export with exact endpoint, headers and payload', async () => {
      const mockResponseData = {
        id: 'tx-exp-01',
        transactionNumber: 'EXP-20261013-0001',
        type: StockTransactionType.EXPORT,
        status: TransactionStatus.COMPLETED,
        itemCount: 1,
        totalQuantity: 5,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: mockResponseData },
      });

      const result = await stockTransactionsService.exportStock(
        sampleExportPayload,
        mockIdempotencyKey
      );

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/stock-transactions/export',
        sampleExportPayload,
        {
          headers: {
            'Idempotency-Key': mockIdempotencyKey,
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('SVC-ON-03: transferStock posts to /stock-transactions/transfer with exact endpoint, headers and payload', async () => {
      const mockResponseData = {
        id: 'tx-trf-01',
        transactionNumber: 'TRF-20261013-0001',
        type: StockTransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        itemCount: 1,
        totalQuantity: 4,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: mockResponseData },
      });

      const result = await stockTransactionsService.transferStock(
        sampleTransferPayload,
        mockIdempotencyKey
      );

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/stock-transactions/transfer',
        sampleTransferPayload,
        {
          headers: {
            'Idempotency-Key': mockIdempotencyKey,
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('SVC-ON-04: adjustStock posts to /stock-transactions/adjustment with exact endpoint, headers and payload when adjustment flag is ON', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_ADJUSTMENT', 'true');
      const mockResponseData = {
        id: 'tx-adj-01',
        transactionNumber: 'ADJ-20261013-0001',
        type: StockTransactionType.ADJUSTMENT,
        status: TransactionStatus.COMPLETED,
        itemCount: 1,
        totalQuantity: 2,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: mockResponseData },
      });

      const result = await stockTransactionsService.adjustStock(
        sampleAdjustPayload,
        mockIdempotencyKey
      );

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/stock-transactions/adjustment',
        sampleAdjustPayload,
        {
          headers: {
            'Idempotency-Key': mockIdempotencyKey,
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('SVC-ON-05: Replay with identical snapshot verifies exact same Idempotency-Key and JSON body across attempts', async () => {
      const mockResponseData = {
        id: 'tx-imp-01',
        transactionNumber: 'IMP-20261013-0001',
        type: StockTransactionType.IMPORT,
        status: TransactionStatus.COMPLETED,
      };

      vi.mocked(apiClient.post).mockResolvedValue({
        data: { success: true, data: mockResponseData },
      });

      // First submit
      await stockTransactionsService.importStock(sampleImportPayload, mockIdempotencyKey);

      // Second submit (Replay with same key & payload)
      await stockTransactionsService.importStock(sampleImportPayload, mockIdempotencyKey);

      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(apiClient.post).toHaveBeenNthCalledWith(
        1,
        '/stock-transactions/import',
        sampleImportPayload,
        { headers: { 'Idempotency-Key': mockIdempotencyKey } }
      );
      expect(apiClient.post).toHaveBeenNthCalledWith(
        2,
        '/stock-transactions/import',
        sampleImportPayload,
        { headers: { 'Idempotency-Key': mockIdempotencyKey } }
      );
    });

    it('SVC-ON-06: Propagates HTTP 409 Conflict error object cleanly to caller', async () => {
      const conflictError = {
        response: {
          status: 409,
          data: {
            success: false,
            message: 'Phát hiện xung đột Idempotency: Cùng Idempotency-Key nhưng nội dung yêu cầu (payload) đã bị thay đổi',
          },
        },
      };

      vi.mocked(apiClient.post).mockRejectedValueOnce(conflictError);

      await expect(
        stockTransactionsService.exportStock(sampleExportPayload, mockIdempotencyKey)
      ).rejects.toEqual(conflictError);
    });

    it('SVC-ON-07: Propagates HTTP 400 Insufficient Stock error object cleanly to caller', async () => {
      const insufficientError = {
        response: {
          status: 400,
          data: {
            success: false,
            message: 'Linh kiện không đủ tồn kho khả dụng để xuất',
          },
        },
      };

      vi.mocked(apiClient.post).mockRejectedValueOnce(insufficientError);

      await expect(
        stockTransactionsService.exportStock(sampleExportPayload, mockIdempotencyKey)
      ).rejects.toEqual(insufficientError);
    });
  });

  // =========================================================================
  // SUBGROUP 3: READ CONTRACT TESTS (LIST & DETAIL)
  // =========================================================================
  describe('Read Contract (listTransactions & getTransactionById)', () => {
    it('SVC-RD-01: listTransactions properly serializes query params and cleans undefined/empty values', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            {
              id: 'tx-1',
              transactionNumber: 'IMP-20261013-0001',
              type: StockTransactionType.IMPORT,
              status: TransactionStatus.COMPLETED,
              itemCount: 3,
              totalQuantity: 25,
            },
          ],
          meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
        },
      });

      const result = await stockTransactionsService.listTransactions({
        search: '  IMP-2026  ',
        type: StockTransactionType.IMPORT,
        status: TransactionStatus.COMPLETED,
        sortBy: StockTransactionSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
        page: 1,
        limit: 20,
      });

      expect(apiClient.get).toHaveBeenCalledWith('/stock-transactions', {
        params: {
          search: 'IMP-2026',
          type: StockTransactionType.IMPORT,
          status: TransactionStatus.COMPLETED,
          sortBy: StockTransactionSortField.CREATED_AT,
          sortOrder: SortOrder.DESC,
          page: 1,
          limit: 20,
        },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].itemCount).toBe(3);
      expect(result.transactions[0].totalQuantity).toBe(25);
    });

    it('SVC-RD-02: getTransactionById calls GET /stock-transactions/:id and returns complete transaction details', async () => {
      const mockDetail = {
        id: 'tx-detail-01',
        transactionNumber: 'IMP-20261013-0001',
        type: StockTransactionType.IMPORT,
        status: TransactionStatus.COMPLETED,
        creatorName: 'Quản Trị Viên ACM',
        itemCount: 1,
        totalQuantity: 10,
        details: [
          {
            id: 'd-1',
            itemId: 'item-1',
            locationId: 'loc-1',
            quantity: 10,
            unitCost: 150000,
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { success: true, data: mockDetail },
      });

      const result = await stockTransactionsService.getTransactionById('tx-detail-01');

      expect(apiClient.get).toHaveBeenCalledWith('/stock-transactions/tx-detail-01');
      expect(result).toEqual(mockDetail);
      expect(result.details).toHaveLength(1);
    });
  });
});
