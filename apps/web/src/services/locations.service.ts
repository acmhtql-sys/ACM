import { apiClient } from './api';
import {
  CreateLocationInput,
  UpdateLocationInput,
  UpdateLocationStatusInput,
  LocationResponse,
  LocationNode,
} from '@acm/shared';
import { isLocationWriteEnabled } from '../config/features';

export const locationsService = {
  /**
   * Fetches active locations list for dropdowns or filters.
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
   * RBAC: ADMIN, LAB_MANAGER only.
   * Protected by runtime Feature Flag (VITE_ENABLE_LOCATION_WRITES).
   */
  async createLocation(data: CreateLocationInput): Promise<LocationResponse> {
    if (!isLocationWriteEnabled()) {
      throw new Error(
        'Chức năng tạo vị trí kho đang tạm khóa tại giai đoạn thử nghiệm (VITE_ENABLE_LOCATION_WRITES=false).'
      );
    }
    const response = await apiClient.post('/locations', data);
    return response.data.data;
  },

  /**
   * Updates existing location attributes.
   * RBAC: ADMIN, LAB_MANAGER only.
   * Protected by runtime Feature Flag (VITE_ENABLE_LOCATION_WRITES).
   */
  async updateLocation(id: string, data: UpdateLocationInput): Promise<LocationResponse> {
    if (!isLocationWriteEnabled()) {
      throw new Error(
        'Chức năng cập nhật vị trí kho đang tạm khóa tại giai đoạn thử nghiệm (VITE_ENABLE_LOCATION_WRITES=false).'
      );
    }
    const response = await apiClient.put(`/locations/${id}`, data);
    return response.data.data;
  },

  /**
   * Safely activates or deactivates location with backend guards.
   * RBAC: ADMIN, LAB_MANAGER only.
   * Protected by runtime Feature Flag (VITE_ENABLE_LOCATION_WRITES).
   */
  async updateLocationStatus(
    id: string,
    data: UpdateLocationStatusInput
  ): Promise<LocationResponse> {
    if (!isLocationWriteEnabled()) {
      throw new Error(
        'Chức năng đổi trạng thái vị trí kho đang tạm khóa tại giai đoạn thử nghiệm (VITE_ENABLE_LOCATION_WRITES=false).'
      );
    }
    const response = await apiClient.patch(`/locations/${id}/status`, data);
    return response.data.data;
  },
};
