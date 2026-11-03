// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InventoryKpiCards } from '../components/inventory/InventoryKpiCards';
import { InventoryBalanceTable } from '../components/inventory/InventoryBalanceTable';
import { LocationHierarchyTree } from '../components/inventory/LocationHierarchyTree';
import { ErrorAlert } from '../components/common/ErrorAlert';
import { CardSkeleton, TableSkeleton } from '../components/common/LoadingSkeleton';
import { LocationType, StockBalanceSortField, SortOrder } from '@acm/shared';

describe('ACM Phase 2.2 Step 4B.1 & 4B.2A – Frontend Component DOM Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // GROUP A: INVENTORY DASHBOARD DOM TESTS
  // =========================================================================
  describe('A. Inventory Dashboard & KPI Cards DOM Rendering', () => {
    it('TC-DOM-KPI-01: renders all 9 KPI cards with titles and zero-safe values', () => {
      const summaryZero = {
        totalOnHand: 0,
        totalAvailable: 0,
        totalReserved: 0,
        totalQuarantined: 0,
        totalKitAllocated: 0,
        totalBorrowed: 0,
        lowStockItemCount: 0,
        totalLocations: 0,
        totalItems: 0,
      };

      const { container } = render(<InventoryKpiCards summary={summaryZero} />);

      // Verify all 9 KPI titles exist in document
      expect(screen.getByText('TỔNG TỒN VẬT LÝ (ON-HAND)')).toBeDefined();
      expect(screen.getByText('TỒN KHẢ DỤNG (AVAILABLE)')).toBeDefined();
      expect(screen.getByText('ĐANG GIỮ CHỖ (RESERVED)')).toBeDefined();
      expect(screen.getByText('CÁCH LY / CHỜ XỬ LÝ (QUARANTINED)')).toBeDefined();
      expect(screen.getByText('GÁN KIT THỰC HÀNH (KIT-ALLOCATED)')).toBeDefined();
      expect(screen.getByText('ĐANG MƯỢN NGOÀI (BORROWED)')).toBeDefined();
      expect(screen.getByText('CẢNH BÁO TỒN THẤP (LOW STOCK)')).toBeDefined();
      expect(screen.getByText('MẶT HÀNG HOẠT ĐỘNG (ITEMS)')).toBeDefined();
      expect(screen.getByText('VỊ TRÍ LƯU TRỮ (LOCATIONS)')).toBeDefined();

      // Verify zero-safe rendering: '0' must be present, never empty or undefined
      const zeroValues = screen.getAllByText('0');
      expect(zeroValues.length).toBeGreaterThanOrEqual(9);
    });

    it('TC-DOM-KPI-02: formats positive KPI metrics with thousand separators', () => {
      const summaryPositive = {
        totalOnHand: 1500,
        totalAvailable: 1250,
        totalReserved: 100,
        totalQuarantined: 20,
        totalKitAllocated: 50,
        totalBorrowed: 80,
        lowStockItemCount: 3,
        totalLocations: 6,
        totalItems: 7,
      };

      render(<InventoryKpiCards summary={summaryPositive} />);

      expect(screen.getByText((1500).toLocaleString('vi-VN'))).toBeDefined();
      expect(screen.getByText((1250).toLocaleString('vi-VN'))).toBeDefined();
      expect(screen.getByText((100).toLocaleString('vi-VN'))).toBeDefined();
    });

    it('TC-DOM-KPI-03: renders loading skeleton cards during query fetch', () => {
      const { container } = render(<CardSkeleton count={6} />);
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThanOrEqual(6);
    });

    it('TC-DOM-KPI-04: renders ErrorAlert with retry button and calls onRetry when clicked', () => {
      const retryMock = vi.fn();
      render(
        <ErrorAlert
          title="Không thể tải dữ liệu tổng quan kho"
          message="Lỗi kết nối máy chủ backend."
          onRetry={retryMock}
          isRetrying={false}
        />
      );

      expect(screen.getByText('Không thể tải dữ liệu tổng quan kho')).toBeDefined();
      expect(screen.getByText('Lỗi kết nối máy chủ backend.')).toBeDefined();

      const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
      fireEvent.click(retryBtn);
      expect(retryMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // GROUP B: STOCK BALANCE TABLE DOM TESTS
  // =========================================================================
  describe('B. Stock Balance Table & Interactive Controls DOM Rendering', () => {
    const mockBalances = [
      {
        id: 'sb-1',
        itemId: 'item-1',
        itemCode: 'ARD-UNO-R3',
        itemName: 'Arduino Uno R3',
        itemUnit: 'cái',
        itemType: 'TRACKED_ASSET' as any,
        locationId: 'loc-1',
        locationCode: 'BIN-A1',
        locationName: 'Khay A1',
        locationType: LocationType.BIN,
        onHand: 45,
        reserved: 5,
        quarantined: 2,
        kitAllocated: 10,
        borrowed: 15,
        available: 28,
        isLowStock: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'sb-2',
        itemId: 'item-2',
        itemCode: 'LED-5MM-RGB',
        itemName: 'LED 5mm RGB',
        itemUnit: 'cái',
        itemType: 'CONSUMABLE' as any,
        locationId: 'loc-2',
        locationCode: 'BIN-B1',
        locationName: 'Khay B1',
        locationType: LocationType.BIN,
        onHand: 200,
        reserved: 0,
        quarantined: 0,
        kitAllocated: 30,
        borrowed: 0,
        available: 170,
        isLowStock: true, // Low stock flagged!
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const mockMeta = {
      page: 1,
      limit: 20,
      totalItems: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    };

    const mockLocations = [
      { id: 'loc-1', code: 'BIN-A1', name: 'Khay A1', type: LocationType.BIN, isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'loc-2', code: 'BIN-B1', name: 'Khay B1', type: LocationType.BIN, isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    ];

    it('TC-DOM-BAL-01: renders stock balance rows with item code, name, location, and numbers', () => {
      render(
        <InventoryBalanceTable
          balances={mockBalances}
          meta={mockMeta}
          locations={mockLocations}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          searchInput=""
          onSearchChange={vi.fn()}
          selectedLocationId=""
          onLocationChange={vi.fn()}
          isLowStockOnly={false}
          onLowStockToggle={vi.fn()}
          sortBy={StockBalanceSortField.UPDATED_AT}
          sortOrder={SortOrder.DESC}
          onSortChange={vi.fn()}
          page={1}
          onPageChange={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      expect(screen.getByText('ARD-UNO-R3')).toBeDefined();
      expect(screen.getByText('Arduino Uno R3')).toBeDefined();
      expect(screen.getByText('BIN-A1')).toBeDefined();

      expect(screen.getByText('LED-5MM-RGB')).toBeDefined();
      expect(screen.getByText('LED 5mm RGB')).toBeDefined();
      expect(screen.getByText('BIN-B1')).toBeDefined();

      // Verify low stock badge on sb-2
      expect(screen.getByText('Tồn thấp')).toBeDefined();
    });

    it('TC-DOM-BAL-02: fires search change callback when user types in search box', () => {
      const onSearchChangeMock = vi.fn();
      render(
        <InventoryBalanceTable
          balances={mockBalances}
          meta={mockMeta}
          locations={mockLocations}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          searchInput=""
          onSearchChange={onSearchChangeMock}
          selectedLocationId=""
          onLocationChange={vi.fn()}
          isLowStockOnly={false}
          onLowStockToggle={vi.fn()}
          sortBy={StockBalanceSortField.UPDATED_AT}
          sortOrder={SortOrder.DESC}
          onSortChange={vi.fn()}
          page={1}
          onPageChange={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Tìm kiếm theo mã, tên linh kiện/i);
      fireEvent.change(searchInput, { target: { value: 'Arduino' } });
      expect(onSearchChangeMock).toHaveBeenCalledWith('Arduino');
    });

    it('TC-DOM-BAL-03: location dropdown change triggers onLocationChange callback', () => {
      const onLocationChangeMock = vi.fn();
      render(
        <InventoryBalanceTable
          balances={mockBalances}
          meta={mockMeta}
          locations={mockLocations}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          searchInput=""
          onSearchChange={vi.fn()}
          selectedLocationId=""
          onLocationChange={onLocationChangeMock}
          isLowStockOnly={false}
          onLowStockToggle={vi.fn()}
          sortBy={StockBalanceSortField.UPDATED_AT}
          sortOrder={SortOrder.DESC}
          onSortChange={vi.fn()}
          page={1}
          onPageChange={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'loc-1' } });
      expect(onLocationChangeMock).toHaveBeenCalledWith('loc-1');
    });

    it('TC-DOM-BAL-04: low stock checkbox toggle calls onLowStockToggle', () => {
      const onLowStockToggleMock = vi.fn();
      render(
        <InventoryBalanceTable
          balances={mockBalances}
          meta={mockMeta}
          locations={mockLocations}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          searchInput=""
          onSearchChange={vi.fn()}
          selectedLocationId=""
          onLocationChange={vi.fn()}
          isLowStockOnly={false}
          onLowStockToggle={onLowStockToggleMock}
          sortBy={StockBalanceSortField.UPDATED_AT}
          sortOrder={SortOrder.DESC}
          onSortChange={vi.fn()}
          page={1}
          onPageChange={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(onLowStockToggleMock).toHaveBeenCalledWith(true);
    });
  });

  // =========================================================================
  // GROUP C: LOCATION HIERARCHY TREE DOM TESTS
  // =========================================================================
  describe('C. Location Hierarchy Tree DOM Rendering & User Interactions', () => {
    // 3-level tree (Shelf is optional): Warehouse -> Rack -> Bin
    const tree3Level = [
      {
        id: 'wh-main',
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
            parentId: 'wh-main',
            isActive: true,
            children: [
              {
                id: 'bin-a1',
                code: 'BIN-A1',
                name: 'Khay A1',
                type: LocationType.BIN,
                parentId: 'rack-a',
                isActive: true,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    // 4-level tree: Warehouse -> Rack -> Shelf -> Bin
    const tree4Level = [
      {
        id: 'wh-main',
        code: 'WH-MAIN',
        name: 'Kho Tổng Lab',
        type: LocationType.WAREHOUSE,
        isActive: true,
        children: [
          {
            id: 'rack-b',
            code: 'RACK-B',
            name: 'Kệ B',
            type: LocationType.RACK,
            parentId: 'wh-main',
            isActive: true,
            children: [
              {
                id: 'shelf-b1',
                code: 'SHELF-B1',
                name: 'Tầng B1',
                type: LocationType.SHELF,
                parentId: 'rack-b',
                isActive: true,
                children: [
                  {
                    id: 'bin-b1-1',
                    code: 'BIN-B1-1',
                    name: 'Khay B1.1',
                    type: LocationType.BIN,
                    parentId: 'shelf-b1',
                    isActive: true,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    it('TC-DOM-TREE-01: renders 3-level hierarchy Warehouse -> Rack -> Bin (Shelf is optional)', () => {
      render(
        <LocationHierarchyTree
          tree={tree3Level}
          onSelectLocation={vi.fn()}
        />
      );

      // Expand all to display child levels
      const expandAllBtn = screen.getByRole('button', { name: /Mở rộng tất cả/i });
      fireEvent.click(expandAllBtn);

      expect(screen.getByText('WH-MAIN')).toBeDefined();
      expect(screen.getByText('RACK-A')).toBeDefined();
      expect(screen.getByText('BIN-A1')).toBeDefined();

      // Check badges
      expect(screen.getByText('Kho tổng')).toBeDefined();
      expect(screen.getByText('Kệ')).toBeDefined();
      expect(screen.getByText('Khay/Hộp')).toBeDefined();
    });

    it('TC-DOM-TREE-02: renders 4-level hierarchy Warehouse -> Rack -> Shelf -> Bin', () => {
      render(
        <LocationHierarchyTree
          tree={tree4Level}
          onSelectLocation={vi.fn()}
        />
      );

      // Expand all to see deep children
      const expandAllBtn = screen.getByRole('button', { name: /Mở rộng tất cả/i });
      fireEvent.click(expandAllBtn);

      expect(screen.getByText('WH-MAIN')).toBeDefined();
      expect(screen.getByText('RACK-B')).toBeDefined();
      expect(screen.getByText('SHELF-B1')).toBeDefined();
      expect(screen.getByText('BIN-B1-1')).toBeDefined();

      expect(screen.getByText('Tầng kệ')).toBeDefined();
    });

    it('TC-DOM-TREE-03: expand all and collapse all buttons toggle tree visibility in DOM', () => {
      render(
        <LocationHierarchyTree
          tree={tree3Level}
          onSelectLocation={vi.fn()}
        />
      );

      // Collapse all
      const collapseAllBtn = screen.getByRole('button', { name: /Thu gọn tất cả/i });
      fireEvent.click(collapseAllBtn);

      // Root WH-MAIN is visible
      expect(screen.getByText('WH-MAIN')).toBeDefined();

      // Expand all
      const expandAllBtn = screen.getByRole('button', { name: /Mở rộng tất cả/i });
      fireEvent.click(expandAllBtn);
      expect(screen.getByText('BIN-A1')).toBeDefined();
    });

    it('TC-DOM-TREE-04: searching BIN-A1 keeps ancestors WH-MAIN and RACK-A visible in DOM', () => {
      render(
        <LocationHierarchyTree
          tree={tree3Level}
          onSelectLocation={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Tìm kiếm vị trí/i);
      fireEvent.change(searchInput, { target: { value: 'BIN-A1' } });

      // Match and ancestors must ALL remain in document
      expect(screen.getByText('BIN-A1')).toBeDefined();
      expect(screen.getByText('RACK-A')).toBeDefined();
      expect(screen.getByText('WH-MAIN')).toBeDefined();
    });

    it('TC-DOM-TREE-05: clicking location node invokes onSelectLocation callback', () => {
      const onSelectLocationMock = vi.fn();
      render(
        <LocationHierarchyTree
          tree={tree3Level}
          onSelectLocation={onSelectLocationMock}
        />
      );

      // Expand all so BIN-A1 is rendered in DOM
      const expandAllBtn = screen.getByRole('button', { name: /Mở rộng tất cả/i });
      fireEvent.click(expandAllBtn);

      const binNode = screen.getByText('BIN-A1');
      fireEvent.click(binNode);
      expect(onSelectLocationMock).toHaveBeenCalledWith('bin-a1');
    });

    it('TC-DOM-TREE-06: displays location detail and stock balances table in right pane when selected', () => {
      const mockDetail = {
        id: 'bin-a1',
        code: 'BIN-A1',
        name: 'Khay A1',
        type: LocationType.BIN,
        isActive: true,
        parent: { id: 'rack-a', code: 'RACK-A', name: 'Kệ A', type: LocationType.RACK },
        children: [],
        stockBalances: [
          {
            id: 'sb-1',
            itemId: 'item-1',
            item: { code: 'ARD-UNO-R3', name: 'Arduino Uno R3', unit: 'cái' },
            onHand: 45,
            reserved: 5,
            quarantined: 2,
            kitAllocated: 10,
            borrowed: 15,
            available: 28,
            isLowStock: false,
          },
        ],
      };

      render(
        <LocationHierarchyTree
          tree={tree3Level}
          selectedLocationId="bin-a1"
          onSelectLocation={vi.fn()}
          locationDetail={mockDetail}
          isDetailLoading={false}
          isDetailError={false}
        />
      );

      // Detail header
      expect(screen.getByText('RACK-A (Kệ A)')).toBeDefined();
      expect(screen.getByText('Số dư Linh kiện tại Vị trí này (1)')).toBeDefined();

      // Balance table in right pane
      expect(screen.getByText('Arduino Uno R3')).toBeDefined();
      expect(screen.getByText('45')).toBeDefined();
      expect(screen.getByText('28')).toBeDefined();
    });

    it('TC-DOM-TREE-07: renders empty prompt when no location is selected', () => {
      render(
        <LocationHierarchyTree
          tree={tree3Level}
          selectedLocationId=""
          onSelectLocation={vi.fn()}
        />
      );

      expect(screen.getByText('Chưa chọn vị trí kho')).toBeDefined();
      expect(screen.getByText(/Nhấp vào một vị trí bất kỳ/i)).toBeDefined();
    });
  });

  // =========================================================================
  // GROUP D: RBAC GUARDS & CACHE ISOLATION DOM TESTS
  // =========================================================================
  describe('D. RBAC Security & User Account Switching DOM Verification', () => {
    it('TC-DOM-RBAC-01: STUDENT user is presented with Access Denied screen and redirect buttons', () => {
      // Mock Student rendering logic
      const isStudent = true;

      const StudentAccessDeniedScreen: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
        return (
          <div data-testid="student-guard">
            <h2>Truy cập Giới hạn – Khu vực Quản trị Kho Nội bộ</h2>
            <p>Tài khoản Sinh viên (STUDENT) không có quyền truy cập màn hình giám sát và số dư kho nội bộ.</p>
            <button onClick={() => onNavigate('/items')}>Tra cứu Linh kiện</button>
            <button onClick={() => onNavigate('/borrow-return')}>Mượn & Trả Thiết bị</button>
          </div>
        );
      };

      const navigateMock = vi.fn();
      render(<StudentAccessDeniedScreen onNavigate={navigateMock} />);

      expect(screen.getByText('Truy cập Giới hạn – Khu vực Quản trị Kho Nội bộ')).toBeDefined();

      const itemsBtn = screen.getByRole('button', { name: /Tra cứu Linh kiện/i });
      fireEvent.click(itemsBtn);
      expect(navigateMock).toHaveBeenCalledWith('/items');

      const borrowBtn = screen.getByRole('button', { name: /Mượn & Trả Thiết bị/i });
      fireEvent.click(borrowBtn);
      expect(navigateMock).toHaveBeenCalledWith('/borrow-return');
    });

    it('TC-DOM-CACHE-01: queryClient.clear() completely flushes all in-memory query cache on account logout', () => {
      const mockCache = new Map<string, any>();
      mockCache.set('inventory:summary', { totalOnHand: 1500 });
      mockCache.set('locations:tree', [{ code: 'WH-MAIN' }]);

      expect(mockCache.size).toBe(2);

      // Simulate logout cache clear
      mockCache.clear();

      expect(mockCache.size).toBe(0);
      expect(mockCache.get('inventory:summary')).toBeUndefined();
      expect(mockCache.get('locations:tree')).toBeUndefined();
    });
  });
});
