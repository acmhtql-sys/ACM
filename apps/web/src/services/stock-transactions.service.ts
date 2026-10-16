import { apiClient } from './api';
import { isStockTransactionWriteEnabled, isStockAdjustmentEnabled } from '../config/features';
import {
  ImportStockInput,
  ExportStockInput,
  TransferStockInput,
  AdjustStockInput,
  AdjustStockInputV2,
  IdempotencyQueryResponse,
} from '@acm/shared';
import {
  StockTransactionSummary,
  StockTransactionListResponse,
  QueryStockTransactionsParams,
} from '../types/stock-transactions';
import { parseStockError } from './stock-error-parser';
import { getStockPermissions, canPerformStockMutation } from './stock-rbac';

export { parseStockError, getStockPermissions, canPerformStockMutation };

export const stockTransactionsService = {
  /**
   * Retrieves paginated list of stock transactions with search, filter, and sorting.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async listTransactions(
    params: QueryStockTransactionsParams = {}
  ): Promise<StockTransactionListResponse> {
    const cleanParams: Record<string, any> = {};

    if (params.search?.trim()) {
      cleanParams.search = params.search.trim();
    }
    if (params.type) {
      cleanParams.type = params.type;
    }
    if (params.status) {
      cleanParams.status = params.status;
    }
    if (params.startDate) {
      cleanParams.startDate = params.startDate;
    }
    if (params.endDate) {
      cleanParams.endDate = params.endDate;
    }
    if (params.sortBy) {
      cleanParams.sortBy = params.sortBy;
    }
    if (params.sortOrder) {
      cleanParams.sortOrder = params.sortOrder;
    }
    if (params.page) {
      cleanParams.page = params.page;
    }
    if (params.limit) {
      cleanParams.limit = params.limit;
    }

    const response = await apiClient.get('/stock-transactions', { params: cleanParams });
    return {
      transactions: response.data.data || [],
      meta: response.data.meta || {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  },

  /**
   * Retrieves single transaction details by ID.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async getTransactionById(id: string): Promise<StockTransactionSummary> {
    const response = await apiClient.get(`/stock-transactions/${encodeURIComponent(id)}`);
    return response.data.data;
  },

  /**
   * Queries the execution status of a transaction by Idempotency-Key.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   * Pure SELECT query. Returns 404 for non-existent OR non-owner keys.
   */
  async queryIdempotencyRecord(
    key: string
  ): Promise<IdempotencyQueryResponse['data']> {
    const response = await apiClient.get(
      `/stock-transactions/idempotency/${encodeURIComponent(key)}`
    );
    return response.data.data;
  },

  /**
   * Imports components/equipment into inventory.
   * Fail-Closed Feature Flag Check: Requires VITE_ENABLE_STOCK_TRANSACTION_WRITES = 'true'.
   * RBAC: ADMIN, LAB_MANAGER
   */
  async importStock(
    payload: ImportStockInput,
    idempotencyKey: string
  ): Promise<StockTransactionSummary> {
    if (!isStockTransactionWriteEnabled()) {
      throw new Error(
        'Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.'
      );
    }

    const response = await apiClient.post('/stock-transactions/import', payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data;
  },

  /**
   * Exports components/equipment from inventory.
   * Fail-Closed Feature Flag Check: Requires VITE_ENABLE_STOCK_TRANSACTION_WRITES = 'true'.
   * RBAC: ADMIN, LAB_MANAGER
   */
  async exportStock(
    payload: ExportStockInput,
    idempotencyKey: string
  ): Promise<StockTransactionSummary> {
    if (!isStockTransactionWriteEnabled()) {
      throw new Error(
        'Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.'
      );
    }

    const response = await apiClient.post('/stock-transactions/export', payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data;
  },

  /**
   * Transfers components/equipment between locations.
   * Fail-Closed Feature Flag Check: Requires VITE_ENABLE_STOCK_TRANSACTION_WRITES = 'true'.
   * RBAC: ADMIN, LAB_MANAGER
   */
  async transferStock(
    payload: TransferStockInput,
    idempotencyKey: string
  ): Promise<StockTransactionSummary> {
    if (!isStockTransactionWriteEnabled()) {
      throw new Error(
        'Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.'
      );
    }

    const response = await apiClient.post('/stock-transactions/transfer', payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data;
  },

  /**
   * Adjusts inventory balances based on physical inventory counts.
   * Supports Snapshot V2 (adjustStockSchemaV2) with 4-dimensional snapshot validation.
   * Fail-Closed Feature Flag Check: Requires VITE_ENABLE_STOCK_TRANSACTION_WRITES = 'true'.
   * RBAC: ADMIN, LAB_MANAGER
   */
  async adjustStock(
    payload: AdjustStockInputV2 | AdjustStockInput,
    idempotencyKey: string
  ): Promise<StockTransactionSummary> {
    if (!isStockTransactionWriteEnabled()) {
      throw new Error(
        'Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified / Disabled để bảo vệ Database.'
      );
    }
    if (!isStockAdjustmentEnabled()) {
      throw new Error(
        'Tính năng Điều chỉnh kho (ADJUSTMENT) đang bị khóa độc lập (chưa phê duyệt riêng).'
      );
    }

    const response = await apiClient.post('/stock-transactions/adjustment', payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data;
  },
};
