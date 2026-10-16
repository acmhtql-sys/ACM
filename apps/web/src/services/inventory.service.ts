import { apiClient } from './api';
import {
  InventorySummaryResponse,
  StockBalanceResponse,
  PaginationMeta,
  LocationResponse,
  LocationNode,
  StockBalanceSortField,
  SortOrder,
} from '@acm/shared';
import { locationsService } from './locations.service';

export interface GetStockBalancesParams {
  search?: string;
  itemId?: string;
  locationId?: string;
  isLowStock?: boolean;
  sortBy?: StockBalanceSortField;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

export interface StockBalancesResult {
  balances: StockBalanceResponse[];
  meta: PaginationMeta;
}

export const inventoryService = {
  /**
   * Fetches aggregated inventory summary metrics from the backend.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async getSummary(): Promise<InventorySummaryResponse> {
    const response = await apiClient.get('/inventory/summary');
    return response.data.data;
  },

  /**
   * Fetches paginated stock balances with search, filters, and sorting.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async getBalances(params: GetStockBalancesParams = {}): Promise<StockBalancesResult> {
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
    if (typeof params.isLowStock === 'boolean') {
      cleanParams.isLowStock = params.isLowStock;
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

    const response = await apiClient.get('/inventory/balance', { params: cleanParams });
    return {
      balances: response.data.data || [],
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
   * Fetches active locations list for filter dropdown.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async getLocations(limit = 100): Promise<LocationResponse[]> {
    const response = await apiClient.get('/locations', {
      params: { limit, isActive: true },
    });
    return response.data.data || [];
  },

  /**
   * Fetches full hierarchical location tree.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async getLocationTree(includeInactive = false): Promise<LocationNode[]> {
    const response = await apiClient.get('/locations/tree', {
      params: { includeInactive },
    });
    return response.data.data || [];
  },

  /**
   * Fetches single location detail with parent, children, and stock balances.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN
   */
  async getLocationDetail(id: string): Promise<any> {
    const response = await apiClient.get(`/locations/${id}`);
    return response.data.data;
  },

  /**
   * Creates new location.
   */
  async createLocation(data: any): Promise<LocationResponse> {
    return locationsService.createLocation(data);
  },

  /**
   * Updates location attributes.
   */
  async updateLocation(id: string, data: any): Promise<LocationResponse> {
    return locationsService.updateLocation(id, data);
  },

  /**
   * Updates location status.
   */
  async updateLocationStatus(id: string, data: any): Promise<LocationResponse> {
    return locationsService.updateLocationStatus(id, data);
  },
};
