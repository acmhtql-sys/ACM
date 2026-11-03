// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseStockError } from './stock-error-parser';
import {
  canPerformStockMutation,
  canReadStockTransactions,
  canQueryIdempotencyKey,
  isStockReadOnlyRole,
  isStockForbiddenRole,
  getStockPermissions,
} from './stock-rbac';
import { stockTransactionsService } from './stock-transactions.service';
import { apiClient } from './api';
import { UserRole, AdjustStockInputV2 } from '@acm/shared';

vi.mock('./api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('S2C-1 Stock API Client Core & Error Parser Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // =========================================================================
  // GROUP 1: STOCK ERROR PARSER - HTTP 409 SUBTYPES & AMBIGUITY
  // =========================================================================
  describe('Group 1: Error Parser - HTTP 409 Subtypes & Ambiguity', () => {
    it('ERR-01: identifies HTTP 409 CONCURRENT_STOCK_MODIFICATION from response.details.errorCode', () => {
      const mock409Error = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            success: false,
            message:
              "Số dư tồn kho của linh kiện '072d6d1d-...' tại vị trí '3b3751a8-...' đã bị thay đổi bởi giao dịch đồng thời khác. Vui lòng tải lại số dư mới nhất và lập lại phiếu kiểm kê.",
            details: {
              errorCode: 'CONCURRENT_STOCK_MODIFICATION',
              conflict: {
                itemId: '072d6d1d-2422-4c8b-a079-76751a34e575',
                locationId: '3b3751a8-b2bf-4cb0-aa8f-0d62e8fef601',
                expectedSnapshot: {
                  onHand: 100,
                  reserved: 0,
                  quarantined: 0,
                  kitAllocated: 0,
                },
                currentSnapshot: {
                  onHand: 90,
                  reserved: 0,
                  quarantined: 0,
                  kitAllocated: 0,
                },
              },
            },
          },
        },
      };

      const parsed = parseStockError(mock409Error);

      expect(parsed.type).toBe('SNAPSHOT_CONFLICT');
      expect(parsed.statusCode).toBe(409);
      expect(parsed.errorCode).toBe('CONCURRENT_STOCK_MODIFICATION');
      expect(parsed.isAmbiguous).toBe(false);
      expect(parsed.canAutoRetry).toBe(false); // MUST NEVER auto-retry stale snapshot
      expect(parsed.conflict).toBeDefined();
      expect(parsed.conflict?.expectedSnapshot.onHand).toBe(100);
      expect(parsed.conflict?.currentSnapshot.onHand).toBe(90);
    });

    it('ERR-02: identifies HTTP 409 Idempotency In-Progress from concurrent duplicate message', () => {
      const mockInProgressError = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            success: false,
            message:
              'Yêu cầu với Idempotency-Key này đang được xử lý đồng thời, vui lòng thử lại sau',
          },
        },
      };

      const parsed = parseStockError(mockInProgressError);

      expect(parsed.type).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(parsed.statusCode).toBe(409);
      expect(parsed.isAmbiguous).toBe(true);
      expect(parsed.canAutoRetry).toBe(false); // DO NOT auto-POST; must wait and query GET idempotency
    });

    it('ERR-03: identifies HTTP 409 Idempotency Payload Mismatch when key reused with different body', () => {
      const mockPayloadMismatchError = {
        name: 'AxiosError',
        response: {
          status: 409,
          data: {
            success: false,
            message:
              'Phát hiện xung đột Idempotency: Cùng khóa Idempotency-Key nhưng nội dung yêu cầu (payload) đã bị thay đổi.',
          },
        },
      };

      const parsed = parseStockError(mockPayloadMismatchError);

      expect(parsed.type).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      expect(parsed.statusCode).toBe(409);
      expect(parsed.isAmbiguous).toBe(false);
      expect(parsed.canAutoRetry).toBe(false);
    });

    it('ERR-04: identifies Network Timeout as AMBIGUOUS (commit status unknown)', () => {
      const mockTimeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
        request: {},
      };

      const parsed = parseStockError(mockTimeoutError);

      expect(parsed.type).toBe('NETWORK_TIMEOUT_AMBIGUOUS');
      expect(parsed.statusCode).toBe(0);
      expect(parsed.isAmbiguous).toBe(true);
      expect(parsed.canAutoRetry).toBe(false); // MUST NOT blindly POST retry
    });

    it('ERR-05: identifies HTTP 500/504 as AMBIGUOUS server error', () => {
      const mock504Error = {
        response: {
          status: 504,
          data: { message: 'Gateway Timeout' },
        },
      };

      const parsed = parseStockError(mock504Error);

      expect(parsed.type).toBe('SERVER_ERROR_AMBIGUOUS');
      expect(parsed.statusCode).toBe(504);
      expect(parsed.isAmbiguous).toBe(true);
      expect(parsed.canAutoRetry).toBe(false);
    });

    it('ERR-06: identifies HTTP 404 from Idempotency lookup as AMBIGUOUS (anti-probing non-owner defense)', () => {
      const mock404IdempotencyError = {
        response: {
          status: 404,
          data: {
            success: false,
            message:
              'Không tìm thấy bản ghi giao dịch tương ứng với Idempotency-Key này trên máy chủ',
            details: {
              errorCode: 'IDEMPOTENCY_KEY_NOT_FOUND',
              status: 'UNKNOWN',
            },
          },
        },
      };

      const parsed = parseStockError(mock404IdempotencyError);

      expect(parsed.type).toBe('NOT_FOUND_AMBIGUOUS');
      expect(parsed.statusCode).toBe(404);
      expect(parsed.isAmbiguous).toBe(true); // MUST NOT assume uncommitted! Non-owner or in-flight delay
      expect(parsed.canAutoRetry).toBe(false);
    });

    it('ERR-06B: identifies HTTP 404 with generic body and no details as AMBIGUOUS when URL targets idempotency', () => {
      const mockGeneric404Error = {
        config: { url: '/api/v1/stock-transactions/idempotency/some-random-key' },
        response: {
          status: 404,
          data: {
            message: 'Not Found',
          },
        },
      };

      const parsed = parseStockError(mockGeneric404Error);

      expect(parsed.type).toBe('NOT_FOUND_AMBIGUOUS');
      expect(parsed.statusCode).toBe(404);
      expect(parsed.isAmbiguous).toBe(true);
      expect(parsed.canAutoRetry).toBe(false); // MUST NOT auto-retry POST
    });

    it('ERR-06C: identifies HTTP 404 as AMBIGUOUS when context.isIdempotencyLookup is true even with empty body', () => {
      const mockEmpty404Error = {
        response: {
          status: 404,
          data: {},
        },
      };

      const parsed = parseStockError(mockEmpty404Error, { isIdempotencyLookup: true });

      expect(parsed.type).toBe('NOT_FOUND_AMBIGUOUS');
      expect(parsed.statusCode).toBe(404);
      expect(parsed.isAmbiguous).toBe(true);
      expect(parsed.canAutoRetry).toBe(false);
    });

    it('ERR-06D: distinguishes standard resource 404 (non-idempotency) as non-ambiguous', () => {
      const mockStandard404Error = {
        config: { url: '/api/v1/items/00000000-0000-0000-0000-000000000099' },
        response: {
          status: 404,
          data: {
            message: 'Linh kiện không tồn tại',
          },
        },
      };

      const parsed = parseStockError(mockStandard404Error);

      expect(parsed.type).toBe('UNKNOWN');
      expect(parsed.statusCode).toBe(404);
      expect(parsed.isAmbiguous).toBe(false); // Deterministic resource not found
      expect(parsed.canAutoRetry).toBe(false);
    });

    it('ERR-07: identifies HTTP 403 Forbidden for RBAC violations', () => {
      const mock403Error = {
        response: {
          status: 403,
          data: {
            success: false,
            message:
              'Bạn không có quyền thực hiện hành động này. Yêu cầu một trong các quyền: [ADMIN, LAB_MANAGER]',
          },
        },
      };

      const parsed = parseStockError(mock403Error);

      expect(parsed.type).toBe('FORBIDDEN_RBAC');
      expect(parsed.statusCode).toBe(403);
      expect(parsed.isAmbiguous).toBe(false);
      expect(parsed.canAutoRetry).toBe(false);
    });

    it('ERR-08: identifies HTTP 422 Unprocessable Entity with Zod field errors', () => {
      const mock422Error = {
        response: {
          status: 422,
          data: {
            success: false,
            message: 'Dữ liệu đầu vào không hợp lệ',
            details: [
              { field: 'items.0.actualOnHand', message: 'Số lượng kiểm đếm thực tế không được âm' },
            ],
          },
        },
      };

      const parsed = parseStockError(mock422Error);

      expect(parsed.type).toBe('VALIDATION_ERROR');
      expect(parsed.statusCode).toBe(422);
      expect(parsed.validationErrors).toBeDefined();
      expect(parsed.validationErrors?.length).toBe(1);
      expect(parsed.validationErrors?.[0].field).toBe('items.0.actualOnHand');
    });

    it('ERR-09: identifies HTTP 400 Insufficient Available Stock', () => {
      const mock400Insufficient = {
        response: {
          status: 400,
          data: {
            success: false,
            message: 'Số lượng tồn khả dụng không đủ để xuất kho (yêu cầu: 20, khả dụng: 5)',
          },
        },
      };

      const parsed = parseStockError(mock400Insufficient);

      expect(parsed.type).toBe('INSUFFICIENT_STOCK');
      expect(parsed.statusCode).toBe(400);
      expect(parsed.isAmbiguous).toBe(false);
    });
  });

  // =========================================================================
  // GROUP 2: RBAC PERMISSIONS MAPPING
  // =========================================================================
  describe('Group 2: RBAC Permissions Mapping - Aligned with Backend Middleware', () => {
    it('RBAC-01: ADMIN has full mutation, read, and idempotency query access', () => {
      expect(canPerformStockMutation(UserRole.ADMIN)).toBe(true);
      expect(canReadStockTransactions(UserRole.ADMIN)).toBe(true);
      expect(canQueryIdempotencyKey(UserRole.ADMIN)).toBe(true);
      expect(isStockReadOnlyRole(UserRole.ADMIN)).toBe(false);
      expect(isStockForbiddenRole(UserRole.ADMIN)).toBe(false);

      const perms = getStockPermissions(UserRole.ADMIN);
      expect(perms.canImport).toBe(true);
      expect(perms.canExport).toBe(true);
      expect(perms.canTransfer).toBe(true);
      expect(perms.canAdjust).toBe(true);
      expect(perms.canViewHistory).toBe(true);
      expect(perms.canQueryIdempotency).toBe(true);
      expect(perms.isReadOnly).toBe(false);
      expect(perms.isForbidden).toBe(false);
    });

    it('RBAC-02: LAB_MANAGER has full mutation, read, and idempotency query access', () => {
      expect(canPerformStockMutation(UserRole.LAB_MANAGER)).toBe(true);
      expect(canReadStockTransactions(UserRole.LAB_MANAGER)).toBe(true);
      expect(canQueryIdempotencyKey(UserRole.LAB_MANAGER)).toBe(true);
      expect(isStockReadOnlyRole(UserRole.LAB_MANAGER)).toBe(false);
      expect(isStockForbiddenRole(UserRole.LAB_MANAGER)).toBe(false);

      const perms = getStockPermissions(UserRole.LAB_MANAGER);
      expect(perms.canImport).toBe(true);
      expect(perms.canExport).toBe(true);
      expect(perms.canTransfer).toBe(true);
      expect(perms.canAdjust).toBe(true);
      expect(perms.canViewHistory).toBe(true);
      expect(perms.canQueryIdempotency).toBe(true);
      expect(perms.isReadOnly).toBe(false);
      expect(perms.isForbidden).toBe(false);
    });

    it('RBAC-03: TECHNICIAN has Read-Only access (CANNOT mutate, CAN view history)', () => {
      expect(canPerformStockMutation(UserRole.TECHNICIAN)).toBe(false);
      expect(canReadStockTransactions(UserRole.TECHNICIAN)).toBe(true);
      expect(canQueryIdempotencyKey(UserRole.TECHNICIAN)).toBe(true);
      expect(isStockReadOnlyRole(UserRole.TECHNICIAN)).toBe(true);
      expect(isStockForbiddenRole(UserRole.TECHNICIAN)).toBe(false);

      const perms = getStockPermissions(UserRole.TECHNICIAN);
      expect(perms.canImport).toBe(false);
      expect(perms.canExport).toBe(false);
      expect(perms.canTransfer).toBe(false);
      expect(perms.canAdjust).toBe(false);
      expect(perms.canViewHistory).toBe(true);
      expect(perms.canQueryIdempotency).toBe(true);
      expect(perms.isReadOnly).toBe(true);
      expect(perms.isForbidden).toBe(false);
    });

    it('RBAC-04: STUDENT is Strictly Forbidden from all stock transactions', () => {
      expect(canPerformStockMutation(UserRole.STUDENT)).toBe(false);
      expect(canReadStockTransactions(UserRole.STUDENT)).toBe(false);
      expect(canQueryIdempotencyKey(UserRole.STUDENT)).toBe(false);
      expect(isStockReadOnlyRole(UserRole.STUDENT)).toBe(false);
      expect(isStockForbiddenRole(UserRole.STUDENT)).toBe(true);

      const perms = getStockPermissions(UserRole.STUDENT);
      expect(perms.canImport).toBe(false);
      expect(perms.canExport).toBe(false);
      expect(perms.canTransfer).toBe(false);
      expect(perms.canAdjust).toBe(false);
      expect(perms.canViewHistory).toBe(false);
      expect(perms.canQueryIdempotency).toBe(false);
      expect(perms.isReadOnly).toBe(false);
      expect(perms.isForbidden).toBe(true);
    });

    it('RBAC-05: Missing or null role defaults to strictly forbidden', () => {
      expect(canPerformStockMutation(null)).toBe(false);
      expect(canReadStockTransactions(undefined)).toBe(false);
      expect(isStockForbiddenRole(null)).toBe(true);
      expect(isStockForbiddenRole('')).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 3: STOCK API CLIENT METHODS & IDEMPOTENCY CONTRACT
  // =========================================================================
  describe('Group 3: Stock API Client Service Contract', () => {
    const mockKey = '550e8400-e29b-41d4-a716-446655440000';

    it('SVC-01: queryIdempotencyRecord requests GET /stock-transactions/idempotency/:key with encoded key', async () => {
      const mockResultData = {
        key: mockKey,
        status: 'COMMITTED',
        statusCode: 201,
        transaction: {
          id: '27034f3f-faa6-470d-b2d1-eaa19331dc21',
          transactionNumber: 'ADJ-20261014-1200',
          type: 'ADJUSTMENT',
          status: 'COMPLETED',
          notes: 'Test',
          itemCount: 1,
          totalQuantity: 10,
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockResultData,
        },
      });

      const res = await stockTransactionsService.queryIdempotencyRecord(mockKey);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/stock-transactions/idempotency/${encodeURIComponent(mockKey)}`
      );
      expect(res.status).toBe('COMMITTED');
      expect(res.transaction?.transactionNumber).toBe('ADJ-20261014-1200');
    });

    it('SVC-02: adjustStock transmits Snapshot V2 payload and Idempotency-Key header', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'true');
      vi.stubEnv('VITE_ENABLE_STOCK_ADJUSTMENT', 'true');

      const v2Payload: AdjustStockInputV2 = {
        reason: 'Kiểm kê định kỳ Snapshot V2',
        items: [
          {
            itemId: '072d6d1d-2422-4c8b-a079-76751a34e575',
            locationId: '3b3751a8-b2bf-4cb0-aa8f-0d62e8fef601',
            expectedOnHand: 100,
            expectedReserved: 0,
            expectedQuarantined: 0,
            expectedKitAllocated: 0,
            actualOnHand: 90,
          },
        ],
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: '27034f3f-faa6-470d-b2d1-eaa19331dc21',
            transactionNumber: 'ADJ-20261014-1200',
            type: 'ADJUSTMENT',
            status: 'COMPLETED',
            itemCount: 1,
            totalQuantity: 10,
          },
        },
      });

      const res = await stockTransactionsService.adjustStock(v2Payload, mockKey);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/stock-transactions/adjustment',
        v2Payload,
        {
          headers: {
            'Idempotency-Key': mockKey,
          },
        }
      );
      expect(res.transactionNumber).toBe('ADJ-20261014-1200');
    });

    it('SVC-03: Fail-Closed Feature Flag blocks adjustStock if flag is disabled', async () => {
      vi.stubEnv('VITE_ENABLE_STOCK_TRANSACTION_WRITES', 'false');

      const v2Payload: AdjustStockInputV2 = {
        reason: 'Kiểm kê định kỳ',
        items: [
          {
            itemId: '072d6d1d-2422-4c8b-a079-76751a34e575',
            locationId: '3b3751a8-b2bf-4cb0-aa8f-0d62e8fef601',
            expectedOnHand: 100,
            expectedReserved: 0,
            expectedQuarantined: 0,
            expectedKitAllocated: 0,
            actualOnHand: 90,
          },
        ],
      };

      await expect(stockTransactionsService.adjustStock(v2Payload, mockKey)).rejects.toThrow(
        'Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.'
      );
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });
});
