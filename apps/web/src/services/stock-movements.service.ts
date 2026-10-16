import { apiClient } from './api';
import {
  StockMovementListResponse,
  QueryStockMovementsParams,
} from '../types/stock-transactions';

export const stockMovementsService = {
  /**
   * Retrieves paginated stock movement ledger with search, filtering, and sorting.
   * Route: GET /api/v1/stock-movements
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN (STUDENT is 403 Forbidden).
   */
  async listMovements(
    params: QueryStockMovementsParams = {}
  ): Promise<StockMovementListResponse> {
    const cleanParams: Record<string, any> = {};

    if (params.search?.trim()) {
      cleanParams.search = params.search.trim();
    }
    if (params.itemId) {
      cleanParams.itemId = params.itemId;
    }
    if (params.locationId) {
      cleanParams.locationId = params.locationId;
    }
    if (params.type) {
      cleanParams.type = params.type;
    }
    if (params.referenceType) {
      cleanParams.referenceType = params.referenceType;
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

    const response = await apiClient.get('/stock-movements', { params: cleanParams });

    return {
      movements: response.data?.data || [],
      meta: response.data?.meta || {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  },
};
