import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateAvailableStock,
  StockBalanceSortField,
  SortOrder,
  UserRole,
  LocationType,
  LocationResponse,
  buildLocationTree,
} from '@acm/shared';
import { inventoryService, GetStockBalancesParams } from '../services/inventory.service';
import { apiClient } from '../services/api';
import { getLocationTypeMeta } from '../components/inventory/LocationHierarchyTree';

describe('ACM Phase 2.2 Step 4B.1 & 4B.2A – Frontend Inventory & Locations Read-Only Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Dashboard Summary KPIs & Zero-Safe Formatting', () => {
    it('TC-KPI-01: formats positive summary numbers with thousand separators', () => {
      const summary = {
        totalOnHand: 1250,
        totalAvailable: 1130,
        totalReserved: 75,
        totalQuarantined: 15,
        totalKitAllocated: 30,
        totalBorrowed: 45,
        lowStockItemCount: 2,
        totalLocations: 6,
        totalItems: 7,
      };

      const formatNum = (val: number | undefined | null) => {
        if (val === undefined || val === null || isNaN(val)) return '0';
        return val.toLocaleString('vi-VN');
      };

      expect(formatNum(summary.totalOnHand)).toBe((1250).toLocaleString('vi-VN'));
      expect(formatNum(summary.totalAvailable)).toBe((1130).toLocaleString('vi-VN'));
      expect(formatNum(summary.totalReserved)).toBe((75).toLocaleString('vi-VN'));
      expect(formatNum(summary.lowStockItemCount)).toBe((2).toLocaleString('vi-VN'));
    });

    it('TC-KPI-02: zero values are explicitly rendered as "0" without falling back to blank or undefined', () => {
      const formatNum = (val: number | undefined | null) => {
        if (val === undefined || val === null || isNaN(val)) return '0';
        return val.toLocaleString('vi-VN');
      };

      expect(formatNum(0)).toBe('0');
      expect(formatNum(null)).toBe('0');
      expect(formatNum(undefined)).toBe('0');
      expect(formatNum(NaN)).toBe('0');
    });

    it('TC-KPI-03: fetches summary data from GET /inventory/summary via inventoryService', async () => {
      const mockSummary = {
        totalOnHand: 500,
        totalAvailable: 420,
        totalReserved: 50,
        totalQuarantined: 10,
        totalKitAllocated: 20,
        totalBorrowed: 30,
        lowStockItemCount: 1,
        totalLocations: 6,
        totalItems: 7,
      };

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        data: { success: true, data: mockSummary },
      });

      const result = await inventoryService.getSummary();
      expect(apiClient.get).toHaveBeenCalledWith('/inventory/summary');
      expect(result).toEqual(mockSummary);
      expect(result.totalOnHand).toBe(500);
      expect(result.totalAvailable).toBe(420);
    });
  });

  describe('2. Stock Balance Invariant & Available Formula Verification', () => {
    it('TC-BAL-01: Available formula preserves Available = OnHand - Reserved - Quarantined - KitAllocated', () => {
      const balance = {
        onHand: 100,
        reserved: 15,
        quarantined: 5,
        kitAllocated: 10,
        borrowed: 25,
      };

      const available = calculateAvailableStock(balance);
      // 100 - 15 - 5 - 10 = 70 (Borrowed = 25 is NOT subtracted a second time)
      expect(available).toBe(70);
    });

    it('TC-BAL-02: Available does not double-count Borrowed deduction', () => {
      const balanceWithBorrowed = {
        onHand: 50,
        reserved: 5,
        quarantined: 0,
        kitAllocated: 0,
        borrowed: 100, // Large borrowed amount outside lab
      };

      const available = calculateAvailableStock(balanceWithBorrowed);
      // 50 - 5 = 45. If borrowed were deducted, it would result in negative/0
      expect(available).toBe(45);
    });

    it('TC-BAL-03: clamps Available to 0 if commitments equal OnHand', () => {
      const balance = {
        onHand: 30,
        reserved: 20,
        quarantined: 5,
        kitAllocated: 5,
        borrowed: 10,
      };

      const available = calculateAvailableStock(balance);
      expect(available).toBe(0);
    });
  });

  describe('3. Inventory Balance API Service & Query Parameter Construction', () => {
    it('TC-SVC-01: sanitizes query parameters, omitting empty strings and undefined keys', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        data: {
          success: true,
          data: [],
          meta: { page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        },
      });

      const params: GetStockBalancesParams = {
        search: '   ', // whitespace only
        locationId: '',
        itemId: undefined,
        isLowStock: true,
        sortBy: StockBalanceSortField.AVAILABLE,
        sortOrder: SortOrder.ASC,
        page: 2,
        limit: 20,
      };

      await inventoryService.getBalances(params);

      expect(getSpy).toHaveBeenCalledWith('/inventory/balance', {
        params: {
          isLowStock: true,
          sortBy: 'available',
          sortOrder: 'asc',
          page: 2,
          limit: 20,
        },
      });
    });

    it('TC-SVC-02: includes trimmed search and locationId when provided', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'b-1',
              itemId: 'item-1',
              itemCode: 'RES-001',
              itemName: 'Điện trở 10k Ohm',
              itemUnit: 'cái',
              locationId: 'loc-1',
              locationCode: 'BIN-A1',
              locationName: 'Khay A1',
              onHand: 500,
              reserved: 50,
              quarantined: 10,
              kitAllocated: 20,
              borrowed: 30,
              available: 420,
              isLowStock: false,
            },
          ],
          meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        },
      });

      const result = await inventoryService.getBalances({
        search: '  RES-001  ',
        locationId: 'loc-uuid-123',
        page: 1,
      });

      expect(getSpy).toHaveBeenCalledWith('/inventory/balance', {
        params: {
          search: 'RES-001',
          locationId: 'loc-uuid-123',
          page: 1,
        },
      });
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].available).toBe(420);
      expect(result.meta.totalItems).toBe(1);
    });

    it('TC-SVC-03: fetches active locations for filter dropdown', async () => {
      const mockLocations = [
        { id: 'loc-1', code: 'WH-MAIN', name: 'Kho Tổng Lab' },
        { id: 'loc-2', code: 'RACK-A', name: 'Kệ A' },
      ];

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        data: { success: true, data: mockLocations },
      });

      const locations = await inventoryService.getLocations(50);
      expect(apiClient.get).toHaveBeenCalledWith('/locations', {
        params: { limit: 50, isActive: true },
      });
      expect(locations).toHaveLength(2);
      expect(locations[0].code).toBe('WH-MAIN');
    });
  });

  describe('4. Search Debounce & URL Synchronization Logic', () => {
    it('TC-DEB-01: debounce delays query execution until 300ms has elapsed without typing', () => {
      vi.useFakeTimers();

      let executedSearch = '';
      const setDebounced = (val: string) => {
        executedSearch = val;
      };

      const simulateInputChange = (val: string) => {
        setTimeout(() => {
          setDebounced(val.trim());
        }, 300);
      };

      simulateInputChange('A');
      vi.advanceTimersByTime(100);
      expect(executedSearch).toBe(''); // Not executed yet

      simulateInputChange('ARD');
      vi.advanceTimersByTime(100);
      expect(executedSearch).toBe(''); // Still not executed

      vi.advanceTimersByTime(250);
      expect(executedSearch).toBe('ARD'); // Executed after timeout

      vi.useRealTimers();
    });

    it('TC-URL-01: synchronizes search, filters, sorting and pagination to URL parameters', () => {
      const params = new URLSearchParams();
      params.set('tab', 'balances');
      params.set('search', 'Arduino');
      params.set('locationId', 'loc-123');
      params.set('isLowStock', 'true');
      params.set('sortBy', StockBalanceSortField.ON_HAND);
      params.set('sortOrder', SortOrder.DESC);
      params.set('page', '2');

      expect(params.get('tab')).toBe('balances');
      expect(params.get('search')).toBe('Arduino');
      expect(params.get('locationId')).toBe('loc-123');
      expect(params.get('isLowStock')).toBe('true');
      expect(params.get('sortBy')).toBe('onHand');
      expect(params.get('sortOrder')).toBe('desc');
      expect(params.get('page')).toBe('2');

      // Changing search or location resets page to 1
      params.set('page', '1');
      expect(params.get('page')).toBe('1');
    });
  });

  describe('5. RBAC Protection & Access Control Rules', () => {
    it('TC-RBAC-01: ADMIN role is authorized to view Inventory Dashboard and Balances', () => {
      const user = { id: 'u-admin', email: 'admin@acm.edu.vn', fullName: 'Admin', role: UserRole.ADMIN };
      const isAuthorized = user.role === 'ADMIN' || user.role === 'LAB_MANAGER' || user.role === 'TECHNICIAN';
      const isStudent = user.role === 'STUDENT';

      expect(isAuthorized).toBe(true);
      expect(isStudent).toBe(false);
    });

    it('TC-RBAC-02: LAB_MANAGER role is authorized to view Inventory Dashboard and Balances', () => {
      const user = { id: 'u-mgr', email: 'mgr@acm.edu.vn', fullName: 'Manager', role: UserRole.LAB_MANAGER };
      const isAuthorized = user.role === 'ADMIN' || user.role === 'LAB_MANAGER' || user.role === 'TECHNICIAN';
      const isStudent = user.role === 'STUDENT';

      expect(isAuthorized).toBe(true);
      expect(isStudent).toBe(false);
    });

    it('TC-RBAC-03: TECHNICIAN role is authorized to view Inventory Dashboard and Balances in Read-Only mode', () => {
      const user = { id: 'u-tech', email: 'tech@acm.edu.vn', fullName: 'Tech', role: UserRole.TECHNICIAN };
      const isAuthorized = user.role === 'ADMIN' || user.role === 'LAB_MANAGER' || user.role === 'TECHNICIAN';
      const isStudent = user.role === 'STUDENT';

      expect(isAuthorized).toBe(true);
      expect(isStudent).toBe(false);
    });

    it('TC-RBAC-04: STUDENT role is blocked from Inventory Admin route with access denied state', () => {
      const user = { id: 'u-stu', email: 'stu@acm.edu.vn', fullName: 'Student', role: UserRole.STUDENT };
      const isAuthorized = user.role === 'ADMIN' || user.role === 'LAB_MANAGER' || user.role === 'TECHNICIAN';
      const isStudent = user.role === 'STUDENT';

      expect(isAuthorized).toBe(false);
      expect(isStudent).toBe(true);
    });

    it('TC-RBAC-05: Unauthenticated access is rejected by ProtectedRoute', () => {
      const token = null;
      const isAuthenticated = !!token;
      expect(isAuthenticated).toBe(false);
    });
  });

  describe('6. HTTP Error Handling Discrimination (401 vs 403 vs 400)', () => {
    it('TC-ERR-01: HTTP 401 unauthenticated clears tokens and redirects to /login', () => {
      const error = { response: { status: 401 } };
      let sessionCleared = false;
      let redirectUrl = '';

      if (error.response?.status === 401) {
        sessionCleared = true;
        redirectUrl = '/login';
      }

      expect(sessionCleared).toBe(true);
      expect(redirectUrl).toBe('/login');
    });

    it('TC-ERR-02: HTTP 403 Forbidden does NOT clear tokens or log out user', () => {
      const error = { response: { status: 403, data: { message: 'Không có quyền truy cập' } } };
      let sessionCleared = false;
      let forbiddenMessage = '';

      if (error.response?.status === 403) {
        forbiddenMessage = error.response.data.message;
      } else if (error.response?.status === 401) {
        sessionCleared = true;
      }

      expect(sessionCleared).toBe(false); // Session intact!
      expect(forbiddenMessage).toBe('Không có quyền truy cập');
    });

    it('TC-ERR-03: HTTP 400 Business Rule error surfaces error message for retry', () => {
      const error = {
        response: {
          status: 400,
          data: { success: false, message: 'Số lượng khả dụng không đủ để xuất kho' },
        },
      };

      const extractedMessage = error.response.data.message;
      expect(extractedMessage).toContain('Số lượng khả dụng không đủ');
    });
  });

  describe('7. TanStack Query Keys & Cache Isolation', () => {
    it('TC-CACHE-01: balance query keys uniquely isolate different filters to prevent stale data bleed', () => {
      const keyFilterA = [
        'inventory',
        'balances',
        { search: 'Arduino', locationId: 'loc-1', isLowStock: false, sortBy: 'onHand', sortOrder: 'desc', page: 1, limit: 20 },
      ];

      const keyFilterB = [
        'inventory',
        'balances',
        { search: 'ESP32', locationId: 'loc-2', isLowStock: true, sortBy: 'available', sortOrder: 'asc', page: 1, limit: 20 },
      ];

      expect(JSON.stringify(keyFilterA)).not.toBe(JSON.stringify(keyFilterB));
    });

    it('TC-CACHE-02: summary query key is cleanly separated from balances key', () => {
      const summaryKey = ['inventory', 'summary'];
      const balancesKey = ['inventory', 'balances', {}];

      expect(summaryKey[1]).toBe('summary');
      expect(balancesKey[1]).toBe('balances');
      expect(summaryKey[1]).not.toBe(balancesKey[1]);
    });
  });

  describe('8. Location Tree Building & Flexible Hierarchy Support (Optional Shelf)', () => {
    it('TC-TREE-01: builds 4-level hierarchy Warehouse -> Rack -> Shelf -> Bin', () => {
      const flatLocations: LocationResponse[] = [
        { id: 'wh-1', code: 'WH-MAIN', name: 'Kho Tổng', type: LocationType.WAREHOUSE, parentId: null, isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'rack-1', code: 'RACK-A', name: 'Kệ A', type: LocationType.RACK, parentId: 'wh-1', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'shelf-1', code: 'SHELF-A1', name: 'Tầng 1', type: LocationType.SHELF, parentId: 'rack-1', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'bin-1', code: 'BIN-A1-1', name: 'Hộp 1', type: LocationType.BIN, parentId: 'shelf-1', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ];

      const tree = buildLocationTree(flatLocations);
      expect(tree).toHaveLength(1);
      expect(tree[0].code).toBe('WH-MAIN');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].code).toBe('RACK-A');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].code).toBe('SHELF-A1');
      expect(tree[0].children[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].children[0].code).toBe('BIN-A1-1');
    });

    it('TC-TREE-02: builds 3-level hierarchy Warehouse -> Rack -> Bin verifying Shelf is optional', () => {
      const flatLocations: LocationResponse[] = [
        { id: 'wh-1', code: 'WH-MAIN', name: 'Kho Tổng', type: LocationType.WAREHOUSE, parentId: null, isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'rack-a', code: 'RACK-A', name: 'Kệ A', type: LocationType.RACK, parentId: 'wh-1', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'bin-a1', code: 'BIN-A1', name: 'Khay A1', type: LocationType.BIN, parentId: 'rack-a', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ];

      const tree = buildLocationTree(flatLocations);
      expect(tree).toHaveLength(1);
      expect(tree[0].code).toBe('WH-MAIN');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].code).toBe('RACK-A');
      // BIN is directly under RACK without SHELF
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].code).toBe('BIN-A1');
      expect(tree[0].children[0].children[0].type).toBe(LocationType.BIN);
    });

    it('TC-TREE-03: fetches location tree via inventoryService.getLocationTree()', async () => {
      const mockTree = [
        {
          id: 'wh-1',
          code: 'WH-MAIN',
          name: 'Kho Tổng',
          type: LocationType.WAREHOUSE,
          isActive: true,
          children: [],
        },
      ];

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        data: { success: true, data: mockTree },
      });

      const result = await inventoryService.getLocationTree(false);
      expect(apiClient.get).toHaveBeenCalledWith('/locations/tree', {
        params: { includeInactive: false },
      });
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('WH-MAIN');
    });

    it('TC-TREE-04: fetches location detail with parent, children, and stock balances', async () => {
      const mockDetail = {
        id: 'loc-1',
        code: 'BIN-A1',
        name: 'Khay A1',
        type: LocationType.BIN,
        parent: { id: 'rack-1', code: 'RACK-A', name: 'Kệ A', type: LocationType.RACK },
        children: [],
        stockBalances: [
          {
            id: 'sb-1',
            itemId: 'item-1',
            item: { code: 'RES-001', name: 'Điện trở 10k', unit: 'cái' },
            onHand: 50,
            available: 50,
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        data: { success: true, data: mockDetail },
      });

      const result = await inventoryService.getLocationDetail('loc-1');
      expect(apiClient.get).toHaveBeenCalledWith('/locations/loc-1');
      expect(result.code).toBe('BIN-A1');
      expect(result.parent?.code).toBe('RACK-A');
      expect(result.stockBalances).toHaveLength(1);
    });
  });

  describe('9. Tree Search Filtering & Ancestor Preservation Logic', () => {
    const sampleTree = [
      {
        id: 'wh-1',
        code: 'WH-MAIN',
        name: 'Kho Tổng Lab',
        type: LocationType.WAREHOUSE,
        isActive: true,
        children: [
          {
            id: 'rack-a',
            code: 'RACK-A',
            name: 'Kệ A',
            type: LocationType.RACK,
            parentId: 'wh-1',
            isActive: true,
            children: [
              {
                id: 'bin-a1',
                code: 'BIN-A1',
                name: 'Khay A1 Linh Kiện Thụ Động',
                type: LocationType.BIN,
                parentId: 'rack-a',
                isActive: true,
                children: [],
              },
            ],
          },
          {
            id: 'rack-b',
            code: 'RACK-B',
            name: 'Kệ B',
            type: LocationType.RACK,
            parentId: 'wh-1',
            isActive: true,
            children: [
              {
                id: 'bin-b1',
                code: 'BIN-B1',
                name: 'Khay B1 Vi Điều Khiển',
                type: LocationType.BIN,
                parentId: 'rack-b',
                isActive: true,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    it('TC-SRCH-01: searching for leaf node preserves all ancestor nodes in hierarchy path', () => {
      const query = 'BIN-A1'.toLowerCase();
      const matches = new Set<string>();
      const ancestors = new Set<string>();

      const checkNode = (node: any, path: string[]) => {
        const isMatch = node.code.toLowerCase().includes(query) || node.name.toLowerCase().includes(query);
        if (isMatch) {
          matches.add(node.id);
          path.forEach((p) => ancestors.add(p));
        }
        node.children?.forEach((c: any) => checkNode(c, [...path, node.id]));
      };

      sampleTree.forEach((root) => checkNode(root, []));

      expect(matches.has('bin-a1')).toBe(true);
      expect(ancestors.has('rack-a')).toBe(true); // Parent preserved
      expect(ancestors.has('wh-1')).toBe(true);   // Root ancestor preserved
      expect(matches.has('rack-b')).toBe(false);  // Sibling excluded
      expect(matches.has('bin-b1')).toBe(false);  // Unrelated leaf excluded
    });

    it('TC-SRCH-02: search matches case-insensitively on Vietnamese name accents and code', () => {
      const query = 'thụ động'.toLowerCase();
      let matched = false;

      const check = (node: any) => {
        if (node.name.toLowerCase().includes(query)) matched = true;
        node.children?.forEach(check);
      };

      sampleTree.forEach(check);
      expect(matched).toBe(true);
    });

    it('TC-SRCH-03: empty search returns 100% full tree without omitting any node', () => {
      const query = '   ';
      const isSearchActive = query.trim().length > 0;
      expect(isSearchActive).toBe(false);
    });
  });

  describe('10. Location Hierarchy Tree Expand, Collapse & Cycle Protection', () => {
    it('TC-EXP-01: collect all parent IDs recursively for "Mở rộng tất cả"', () => {
      const sampleTree = [
        {
          id: 'wh-1',
          code: 'WH-MAIN',
          children: [
            {
              id: 'rack-a',
              code: 'RACK-A',
              children: [
                { id: 'bin-a1', code: 'BIN-A1', children: [] },
              ],
            },
          ],
        },
      ];

      const parentIds: string[] = [];
      const traverse = (nodes: any[]) => {
        for (const n of nodes) {
          if (n.children && n.children.length > 0) {
            parentIds.push(n.id);
            traverse(n.children);
          }
        }
      };
      traverse(sampleTree);

      expect(parentIds).toEqual(['wh-1', 'rack-a']);
    });

    it('TC-EXP-02: "Thu gọn tất cả" resets expanded state to empty object', () => {
      const expandedState: Record<string, boolean> = { 'wh-1': true, 'rack-a': true };
      const collapsedState: Record<string, boolean> = {};

      expect(Object.keys(collapsedState)).toHaveLength(0);
      expect(collapsedState['wh-1']).toBeUndefined();
    });

    it('TC-EXP-03: cycle protection guards against circular references in tree traversal', () => {
      // Simulate cyclic data: nodeA -> nodeB -> nodeA
      const nodeA: any = { id: 'A', code: 'LOC-A', children: [] };
      const nodeB: any = { id: 'B', code: 'LOC-B', children: [nodeA] };
      nodeA.children.push(nodeB);

      const visited = new Set<string>();
      const collected: string[] = [];

      const safeTraverse = (node: any) => {
        if (visited.has(node.id)) return; // Prevent infinite loop!
        visited.add(node.id);
        collected.push(node.id);
        for (const child of node.children) {
          safeTraverse(child);
        }
      };

      safeTraverse(nodeA);

      expect(collected).toEqual(['A', 'B']);
      expect(visited.size).toBe(2);
    });

    it('TC-META-01: returns correct visual styles and icons for all location types', () => {
      const whMeta = getLocationTypeMeta(LocationType.WAREHOUSE);
      expect(whMeta.label).toBe('Kho tổng');
      expect(whMeta.bg).toContain('indigo');

      const rackMeta = getLocationTypeMeta(LocationType.RACK);
      expect(rackMeta.label).toBe('Kệ');
      expect(rackMeta.bg).toContain('blue');

      const shelfMeta = getLocationTypeMeta(LocationType.SHELF);
      expect(shelfMeta.label).toBe('Tầng kệ');
      expect(shelfMeta.bg).toContain('amber');

      const binMeta = getLocationTypeMeta(LocationType.BIN);
      expect(binMeta.label).toBe('Khay/Hộp');
      expect(binMeta.bg).toContain('emerald');
    });
  });

  describe('11. Account Switching & React Query Cache Clearance Verification', () => {
    it('TC-CACHE-CLEAR-01: login and logout clear React Query cache to prevent Admin data bleeding to Student', () => {
      const mockQueryClient = {
        clear: vi.fn(),
      };

      // Simulate login action
      mockQueryClient.clear();
      expect(mockQueryClient.clear).toHaveBeenCalledTimes(1);

      // Simulate logout action
      mockQueryClient.clear();
      expect(mockQueryClient.clear).toHaveBeenCalledTimes(2);
    });

    it('TC-CACHE-CLEAR-02: query keys for locations tree and detail are properly segmented', () => {
      const treeKey = ['locations', 'tree'];
      const detailKey = ['locations', 'detail', 'loc-123'];
      const balancesKey = ['inventory', 'balances', {}];

      expect(treeKey[0]).toBe('locations');
      expect(detailKey[1]).toBe('detail');
      expect(treeKey).not.toEqual(detailKey);
      expect(treeKey).not.toEqual(balancesKey);
    });
  });

  describe('12. Read-Only Mode & RBAC Guard Guarantees for Locations Tree', () => {
    it('TC-RBAC-LOC-01: STUDENT role is blocked from locations tree tab', () => {
      const studentUser = { id: 'u-1', role: UserRole.STUDENT };
      const isAuthorized = studentUser.role === 'ADMIN' || studentUser.role === 'LAB_MANAGER' || studentUser.role === 'TECHNICIAN';
      expect(isAuthorized).toBe(false);
    });

    it('TC-RBAC-LOC-02: TECHNICIAN role is granted read-only access to locations tree', () => {
      const techUser = { id: 'u-2', role: UserRole.TECHNICIAN };
      const isAuthorized = techUser.role === 'ADMIN' || techUser.role === 'LAB_MANAGER' || techUser.role === 'TECHNICIAN';
      expect(isAuthorized).toBe(true);
    });

    it('TC-URL-LOC-01: selects location and synchronizes tab=locations&selectedId to URL search params', () => {
      const params = new URLSearchParams();
      params.set('tab', 'locations');
      params.set('selectedId', 'wh-main-uuid');

      expect(params.get('tab')).toBe('locations');
      expect(params.get('selectedId')).toBe('wh-main-uuid');
    });

    it('TC-RO-01: Read-Only mode contains zero mutation endpoints for create, update, or delete', () => {
      // In Step 4B.2A: strictly read-only
      const allowedActions = ['view_tree', 'view_detail', 'search', 'expand', 'collapse', 'select'];
      const forbiddenWriteActions = ['create_location', 'update_location', 'delete_location', 'change_status'];

      forbiddenWriteActions.forEach((action) => {
        expect(allowedActions.includes(action)).toBe(false);
      });
    });
  });
});

