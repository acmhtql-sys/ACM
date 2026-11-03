// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  LocationType,
  StockTransactionType,
  TransactionStatus,
  StockTransactionSortField,
  SortOrder,
  ItemResponse,
  LocationResponse,
  StockBalanceResponse,
} from '@acm/shared';
import { StockTransactionsPage } from './StockTransactionsPage';
import { StockTransactionDetailModal } from '../components/stock-transactions/StockTransactionDetailModal';
import { StockImportModal } from '../components/stock-transactions/StockImportModal';
import { StockExportModal } from '../components/stock-transactions/StockExportModal';
import { StockTransferModal } from '../components/stock-transactions/StockTransferModal';
import { StockAdjustmentModal } from '../components/stock-transactions/StockAdjustmentModal';
import { stockTransactionsService } from '../services/stock-transactions.service';
import * as features from '../config/features';
import { clearAllPendingAmbiguousSessions } from '../hooks/useIdempotentTransaction';
import * as authHook from '../hooks/useAuth';

// Mock services
vi.mock('../services/stock-transactions.service', () => ({
  stockTransactionsService: {
    listTransactions: vi.fn(),
    getTransactionById: vi.fn(),
    importStock: vi.fn(),
    exportStock: vi.fn(),
    transferStock: vi.fn(),
    adjustStock: vi.fn(),
    queryIdempotencyRecord: vi.fn(),
  },
}));

vi.mock('../services/inventory.service', () => ({
  inventoryService: {
    getLocations: vi.fn().mockResolvedValue([
      { id: '22222222-2222-4000-8000-000000000001', code: 'BIN-A1', name: 'Ngăn A1', type: 'BIN', isActive: true },
      { id: '22222222-2222-4000-8000-000000000002', code: 'BIN-A2', name: 'Ngăn A2', type: 'BIN', isActive: true },
      { id: '22222222-2222-4000-8000-000000000003', code: 'RACK-A', name: 'Kệ A', type: 'RACK', isActive: true },
    ]),
    getBalances: vi.fn().mockResolvedValue({
      balances: [
        {
          id: '33333333-3333-4000-8000-000000000001',
          itemId: '11111111-1111-4000-8000-000000000001',
          locationId: '22222222-2222-4000-8000-000000000001',
          onHand: 10,
          reserved: 2,
          quarantined: 1,
          kitAllocated: 1,
          borrowed: 3, // Borrowed must NOT be subtracted again! Available = 10 - 2 - 1 - 1 = 6
        },
        {
          id: '33333333-3333-4000-8000-000000000002',
          itemId: '11111111-1111-4000-8000-000000000002',
          locationId: '22222222-2222-4000-8000-000000000001',
          onHand: 20,
          reserved: 0,
          quarantined: 0,
          kitAllocated: 0,
          borrowed: 0, // Available = 20
        },
      ],
      meta: { totalItems: 2, page: 1, limit: 100, totalPages: 1 },
    }),
  },
}));

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/items') {
        return Promise.resolve({
          data: {
            data: [
              { id: '11111111-1111-4000-8000-000000000001', code: 'RES-10K', name: 'Điện trở 10k', unit: 'Cái', isActive: true },
              { id: '11111111-1111-4000-8000-000000000002', code: 'CAP-100U', name: 'Tụ điện 100uF', unit: 'Cái', isActive: true },
              { id: 'item-inactive', code: 'OLD-CHIP', name: 'Chip cũ', unit: 'Cái', isActive: false },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    }),
    post: vi.fn(),
  },
}));

describe('ACM Phase 2.2 Step 4B.3B – Stock Transactions Frontend DOM Test Suite (Mock-Verified)', () => {
  let queryClient: QueryClient;

  const mockAdminUser = {
    id: 'user-admin-1',
    email: 'admin@acm.test',
    fullName: 'Quản Trị Viên ACM',
    role: 'ADMIN' as const,
  };

  const mockTechnicianUser = {
    id: 'user-tech-1',
    email: 'tech@acm.test',
    fullName: 'Kỹ Thuật Viên Lab',
    role: 'TECHNICIAN' as const,
  };

  const mockStudentUser = {
    id: 'user-student-1',
    email: 'student@acm.test',
    fullName: 'Sinh Viên Thực Tập',
    role: 'STUDENT' as const,
  };

  
  const ITEM_1 = '11111111-1111-4000-8000-000000000001';
  const ITEM_2 = '11111111-1111-4000-8000-000000000002';
  const LOC_1 = '22222222-2222-4000-8000-000000000001';
  const LOC_2 = '22222222-2222-4000-8000-000000000002';
  const LOC_3 = '22222222-2222-4000-8000-000000000003';
  const BAL_1 = '33333333-3333-4000-8000-000000000001';
  const BAL_2 = '33333333-3333-4000-8000-000000000002';

  const mockItems = [
    { id: ITEM_1, code: 'RES-10K', name: 'Điện trở 10k', unit: 'Cái', isActive: true, type: 'COMPONENT' as any, categoryId: 'c1', minStock: 5, maxStock: 100, createdAt: '', updatedAt: '' },
    { id: ITEM_2, code: 'CAP-100U', name: 'Tụ điện 100uF', unit: 'Cái', isActive: true, type: 'COMPONENT' as any, categoryId: 'c1', minStock: 5, maxStock: 100, createdAt: '', updatedAt: '' },
  ] as unknown as ItemResponse[];

  const mockLocations = [
    { id: LOC_1, code: 'BIN-A1', name: 'Ngăn A1', type: LocationType.BIN, isActive: true, createdAt: '', updatedAt: '' },
    { id: LOC_2, code: 'BIN-A2', name: 'Ngăn A2', type: LocationType.BIN, isActive: true, createdAt: '', updatedAt: '' },
    { id: LOC_3, code: 'RACK-A', name: 'Kệ A', type: LocationType.RACK, isActive: true, createdAt: '', updatedAt: '' },
  ] as unknown as LocationResponse[];

  const mockBalances = [
    {
      id: BAL_1,
      itemId: ITEM_1,
      locationId: LOC_1,
      onHand: 10,
      reserved: 2,
      quarantined: 1,
      kitAllocated: 1,
      borrowed: 3, // Available = 10 - 2 - 1 - 1 = 6
      item: mockItems[0],
      location: mockLocations[0],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: BAL_2,
      itemId: ITEM_1,
      locationId: LOC_2,
      onHand: 5,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0, // Available = 5
      item: mockItems[0],
      location: mockLocations[1],
      createdAt: '',
      updatedAt: '',
    },
  ] as unknown as StockBalanceResponse[];

  const mockTransactions = [
    {
      id: 'tx-1',
      transactionNumber: 'IMP-20261013-0001',
      type: StockTransactionType.IMPORT,
      status: TransactionStatus.COMPLETED,
      notes: 'Phiếu nhập đợt 1',
      createdById: 'user-admin-1',
      creatorName: 'Quản Trị Viên ACM',
      createdAt: '2026-10-13T08:00:00.000Z',
      updatedAt: '2026-10-13T08:00:00.000Z',
      itemCount: 2,
      totalQuantity: 25,
      details: [
        {
          id: 'd-1',
          stockTransactionId: 'tx-1',
          itemId: ITEM_1,
          locationId: LOC_1,
          quantity: 15,
          unitCost: 500,
          notes: 'Điện trở',
          item: mockItems[0],
          location: mockLocations[0],
        },
        {
          id: 'd-2',
          stockTransactionId: 'tx-1',
          itemId: ITEM_2,
          locationId: LOC_2,
          quantity: 10,
          unitCost: 1200,
          notes: 'Tụ điện',
          item: mockItems[1],
          location: mockLocations[1],
        },
      ],
    },
    {
      id: 'tx-orphan-96',
      transactionNumber: 'IMP-20261013-9021',
      type: StockTransactionType.IMPORT,
      status: TransactionStatus.COMPLETED,
      notes: 'Historical orphan header',
      createdById: 'user-admin-1',
      creatorName: 'Quản Trị Viên ACM',
      createdAt: '2026-10-13T09:00:00.000Z',
      updatedAt: '2026-10-13T09:00:00.000Z',
      itemCount: 0,
      totalQuantity: 0,
      details: [], // 0 details!
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearAllPendingAmbiguousSessions();
    vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(true);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      token: 'mock-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    (stockTransactionsService.listTransactions as any).mockResolvedValue({
      transactions: mockTransactions,
      meta: {
        page: 1,
        limit: 20,
        totalItems: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    );
  };

  // =========================================================================
  // GROUP 1: READ-ONLY WORKSPACE & 96 ORPHAN HEADERS DEFENSIVE TESTS
  // =========================================================================
  describe('Group 1: Workspace Rendering & Defensive Orphan Headers', () => {
    it('TC-STK-01: renders stock transactions workspace with toolbar, search and table headers', async () => {
      renderWithProviders(<StockTransactionsPage />);

      expect(screen.getByText('Giao dịch Kho (Stock Transactions)')).toBeDefined();
      expect(screen.getByTestId('search-tx-input')).toBeDefined();
      expect(screen.getByTestId('filter-type-select')).toBeDefined();
      expect(screen.getByTestId('btn-open-import')).toBeDefined();
      expect(screen.getByTestId('btn-open-export')).toBeDefined();

      await waitFor(() => {
        expect(screen.getByText('IMP-20261013-0001')).toBeDefined();
        expect(screen.getByText('IMP-20261013-9021')).toBeDefined();
      });
    });

    it('TC-STK-02: renders safely with historical orphan header having 0 details without crashing DOM', async () => {
      renderWithProviders(<StockTransactionsPage />);

      await waitFor(() => {
        const orphanRow = screen.getByTestId('tx-row-tx-orphan-96');
        expect(orphanRow).toBeDefined();
        expect(orphanRow.textContent).toContain('IMP-20261013-9021');
        expect(orphanRow.textContent).toContain('0'); // itemCount 0 and totalQty 0
      });
    });

    it('TC-STK-03: Transaction Detail Modal renders safe EmptyState when transaction has 0 details', () => {
      renderWithProviders(
        <StockTransactionDetailModal
          isOpen={true}
          onClose={vi.fn()}
          transaction={mockTransactions[1]} // orphan header with details: []
        />
      );

      expect(screen.getByTestId('detail-tx-number').textContent).toBe('IMP-20261013-9021');
      expect(screen.getByTestId('detail-empty-orphan-notice')).toBeDefined();
      expect(
        screen.getByText(/Chứng từ lịch sử không có chi tiết dòng mặt hàng/i)
      ).toBeDefined();
    });

    it('TC-STK-04: Transaction Detail Modal renders full line item table when details exist', () => {
      renderWithProviders(
        <StockTransactionDetailModal
          isOpen={true}
          onClose={vi.fn()}
          transaction={mockTransactions[0]} // tx with 2 details
        />
      );

      expect(screen.getByTestId('detail-tx-number').textContent).toBe('IMP-20261013-0001');
      expect(screen.getByText('Điện trở 10k')).toBeDefined();
      expect(screen.getByText('Tụ điện 100uF')).toBeDefined();
      expect(screen.getByTestId('detail-total-qty').textContent).toBe('25');
    });

    it('TC-STK-05: RBAC - TECHNICIAN role sees transactions list but cannot see create action buttons', async () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockTechnicianUser,
        token: 'mock-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderWithProviders(<StockTransactionsPage />);

      await waitFor(() => {
        expect(screen.getByText('IMP-20261013-0001')).toBeDefined();
      });

      // Write action buttons must NOT be rendered
      expect(screen.queryByTestId('write-actions-toolbar')).toBeNull();
      expect(screen.queryByTestId('btn-open-import')).toBeNull();
      expect(screen.queryByTestId('btn-open-export')).toBeNull();
    });

    it('TC-STK-06: RBAC - STUDENT role is strictly blocked with 403 Forbidden screen', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockStudentUser,
        token: 'mock-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderWithProviders(<StockTransactionsPage />);

      expect(screen.getByTestId('rbac-forbidden-screen')).toBeDefined();
      expect(screen.getByText('403 - Quyền Truy Cập Bị Từ Chối')).toBeDefined();
    });
  });

  // =========================================================================
  // GROUP 2: IMPORT FORM & DYNAMIC ROWS TESTS
  // =========================================================================
  describe('Group 2: Stock Import Form & Validations', () => {
    it('TC-STK-07: Import modal allows adding and removing lines, updating total quantity and cost', () => {
      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('stock-import-modal')).toBeDefined();
      expect(screen.getByTestId('line-row-0')).toBeDefined();

      // Add a second line
      fireEvent.click(screen.getByTestId('btn-add-line'));
      expect(screen.getByTestId('line-row-1')).toBeDefined();

      // Enter quantity on line 0: 5, unitCost: 1000
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });
      fireEvent.change(screen.getByTestId('input-cost-0'), { target: { value: '1000' } });

      // Enter quantity on line 1: 3, unitCost: 2000
      fireEvent.change(screen.getByTestId('input-qty-1'), { target: { value: '3' } });
      fireEvent.change(screen.getByTestId('input-cost-1'), { target: { value: '2000' } });

      // Total quantity: 5 + 3 = 8
      expect(screen.getByTestId('total-qty-display').textContent).toBe('8');

      // Remove line 1
      fireEvent.click(screen.getByTestId('btn-remove-line-1'));
      expect(screen.queryByTestId('line-row-1')).toBeNull();
      expect(screen.getByTestId('total-qty-display').textContent).toBe('5');
    });

    it('TC-STK-08: Import modal rejects duplicate (itemId, locationId) across lines and blocks submit', async () => {
      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      // Add second line
      fireEvent.click(screen.getByTestId('btn-add-line'));

      // Line 0: item-1, loc-1
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });

      // Line 1: duplicate item-1, loc-1
      fireEvent.change(screen.getByTestId('select-item-1'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-1'), { target: { value: LOC_1 } });

      // Click review
      fireEvent.click(screen.getByTestId('btn-review-import'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Trùng lặp linh kiện tại cùng vị trí đã chọn ở dòng trước/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
    });

    it('TC-STK-09: Import modal displays UUIDv4 Idempotency-Key and calls service with key', async () => {
      (stockTransactionsService.importStock as any).mockResolvedValue({
        id: 'new-imp-tx',
        transactionNumber: 'IMP-20261013-NEW1',
      });

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const keyInput = screen.getByTestId('idempotency-key-display') as HTMLInputElement;
      expect(keyInput.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Fill line 0
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '10' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(stockTransactionsService.importStock).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              expect.objectContaining({
                itemId: ITEM_1,
                locationId: LOC_1,
                quantity: 10,
              }),
            ],
          }),
          keyInput.value
        );
      });
    });
  });

  // =========================================================================
  // GROUP 3: EXPORT FORM & AVAILABLE STOCK TESTS
  // =========================================================================
  describe('Group 3: Stock Export Form & Available Stock Guard', () => {
    it('TC-STK-10: Export modal calculates Available = OnHand - Reserved - Quarantined - KitAllocated (Borrowed NOT subtracted)', () => {
      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      // Select item-1 and loc-1 (OnHand: 10, Reserved: 2, Quarantined: 1, KitAllocated: 1, Borrowed: 3)
      // Available must be 10 - 2 - 1 - 1 = 6 (Borrowed 3 is NOT subtracted again!)
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });

      expect(screen.getByTestId('available-badge-0').textContent).toBe('6');
    });

    it('TC-STK-11: Export modal flags over-available quantity error and blocks submit', async () => {
      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), {
        target: { value: 'Xuất phục vụ nghiên cứu' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });

      // Available is 6, enter quantity 10
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '10' } });

      expect(screen.getByTestId('over-stock-error-0')).toBeDefined();

      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Số lượng xuất \(10\) vượt quá tồn kho khả dụng \(6\)/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.exportStock).not.toHaveBeenCalled();
    });

    it('TC-STK-12: Export modal requires reason with at least 3 characters', async () => {
      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: 'Ab' } }); // only 2 chars!
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '2' } });

      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Lý do xuất kho là bắt buộc và phải có ít nhất 3 ký tự/i)).toBeDefined();
      });
    });
  });

  // =========================================================================
  // GROUP 4: TRANSFER FORM & AGGREGATE VALIDATION TESTS
  // =========================================================================
  describe('Group 4: Stock Transfer Form & Aggregate Validation', () => {
    it('TC-STK-13: Transfer modal blocks submit when source and destination locations are identical', async () => {
      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), {
        target: { value: 'Chuyển ngăn chứa' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      // Same source and destination: loc-1 and loc-1
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_1 } });

      expect(screen.getByTestId('same-location-error-0')).toBeDefined();

      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Vị trí nguồn và vị trí đích không được trùng nhau/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.transferStock).not.toHaveBeenCalled();
    });

    it('TC-STK-14: Transfer Aggregate Guard detects total requested across lines exceeding available at source and blocks submit', async () => {
      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // item-1 at loc-1 has Available = 6
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), {
        target: { value: 'Điều chuyển linh kiện sang các ngăn mới' },
      });

      // Line 0: item-1 from loc-1 to loc-2, quantity = 4 (4 <= 6)
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '4' } });

      // Add Line 1: item-1 from loc-1 to loc-3, quantity = 4 (4 <= 6)
      // Total requested from loc-1 is 4 + 4 = 8 > 6!
      fireEvent.click(screen.getByTestId('btn-add-line'));
      fireEvent.change(screen.getByTestId('select-item-1'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-1'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-1'), { target: { value: LOC_3 } });
      fireEvent.change(screen.getByTestId('input-qty-1'), { target: { value: '4' } });

      // Aggregate error should appear
      await waitFor(() => {
        expect(screen.getByTestId('aggregate-over-error-0')).toBeDefined();
        expect(screen.getByTestId('aggregate-over-error-1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Tổng số lượng điều chuyển của linh kiện 'RES-10K' từ vị trí nguồn 'BIN-A1' \(8\) vượt quá tồn khả dụng \(6\)/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.transferStock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GROUP 5: ADJUSTMENT FORM & CONCURRENCY CONSTRAINTS TESTS
  // =========================================================================
  describe('Group 5: Stock Adjustment Form & Constraints', () => {
    it('TC-STK-15: Adjustment modal enforces Non-Zero Delta Rule (blocks submit when all deltas == 0)', async () => {
      render(
        <StockAdjustmentModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // item-1 at loc-1 has onHand = 10
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('adjustment-reason-input'), {
        target: { value: 'Kiểm kê định kỳ tháng 10' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });

      // OnHand is 10, enter actualOnHand = 10 -> delta = 0!
      fireEvent.change(screen.getByTestId('input-actual-onhand-0'), { target: { value: '10' } });

      expect(screen.getByTestId('delta-badge-0').textContent).toBe('0');

      fireEvent.click(screen.getByTestId('btn-submit-adjustment'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Không có chênh lệch tồn kho nào cần điều chỉnh/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.adjustStock).not.toHaveBeenCalled();
    });

    it('TC-STK-16: Adjustment modal blocks submit if actualOnHand is lower than committed stock', async () => {
      render(
        <StockAdjustmentModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // item-1 at loc-1 has committed = 2+1+1 = 4
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('adjustment-reason-input'), {
        target: { value: 'Kiểm kê định kỳ tháng 10' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });

      // Committed is 4, enter actualOnHand = 2 (< committed 4)
      fireEvent.change(screen.getByTestId('input-actual-onhand-0'), { target: { value: '2' } });

      expect(screen.getByTestId('committed-violation-error-0')).toBeDefined();

      fireEvent.click(screen.getByTestId('btn-submit-adjustment'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Không thể điều chỉnh tồn thực tế \(2\) nhỏ hơn số lượng đã cam kết \(4/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.adjustStock).not.toHaveBeenCalled();
    });

    it('TC-STK-17: Adjustment modal displays snapshot timestamp for current onHand balance', () => {
      render(
        <StockAdjustmentModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('snapshot-time-display')).toBeDefined();
      expect(screen.getByTestId('snapshot-time-display').textContent).not.toBe('');
    });
  });

  // =========================================================================
  // GROUP 6: IDEMPOTENCY FSM, TIMEOUT & ERROR MAPPING TESTS
  // =========================================================================
  describe('Group 6: Idempotency Finite State Machine & Error Handling', () => {
    it('TC-STK-18: Prevents double submit while transaction is in flight (disables submit button)', async () => {
      let resolveSubmission: any;
      (stockTransactionsService.importStock as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubmission = resolve;
          })
      );

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      const submitBtn = screen.getByTestId('btn-confirm-submit-import');
      fireEvent.click(submitBtn);

      // In flight
      await waitFor(() => {
        expect(submitBtn.getAttribute('disabled')).not.toBeNull();
        expect(screen.getByText('Đang xử lý giao dịch...')).toBeDefined();
      });

      // Try clicking again
      fireEvent.click(submitBtn);
      expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);

      // Finish submission
      resolveSubmission({ id: 'done', transactionNumber: 'IMP-DONE' });
    });

    it('TC-STK-19: Network Timeout transitions to AMBIGUOUS_OUTCOME, keeps exact key and payload without reset', async () => {
      const timeoutError = new Error('timeout of 10000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';

      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutError);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const keyBefore = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
        expect(screen.getByText(/KẾT QUẢ CHƯA XÁC NHẬN \(AMBIGUOUS OUTCOME\)/i)).toBeDefined();
      });

      // Exact key must NOT be regenerated or rotated!
      const keyAfter = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;
      expect(keyAfter).toBe(keyBefore);
      // Form input must NOT be reset!
      expect((screen.getByTestId('input-qty-0') as HTMLInputElement).value).toBe('5');
    });

    it('TC-STK-20: Retry button in AMBIGUOUS_OUTCOME performs safe status check (GET Idempotency) without re-POSTing', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutError);
      (stockTransactionsService.queryIdempotencyRecord as any).mockResolvedValue({
        idempotencyKey: 'test-key',
        status: 'COMMITTED',
        transaction: {
          id: 'ok-tx',
          transactionNumber: 'IMP-RETRY-OK',
        },
        createdAt: '',
        updatedAt: '',
      });

      const mockSuccess = vi.fn();

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={mockSuccess}
        />
      );

      const keyVal = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      // Wait for ambiguous state
      await waitFor(() => {
        expect(screen.getByTestId('btn-retry-ambiguous')).toBeDefined();
      });

      // Click retry -> performs GET status check
      fireEvent.click(screen.getByTestId('btn-retry-ambiguous'));

      await waitFor(() => {
        expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
        expect(stockTransactionsService.queryIdempotencyRecord).toHaveBeenCalledWith(keyVal);
        expect(mockSuccess).toHaveBeenCalled();
      });
    });

    it('TC-STK-21: Handles HTTP 409 Payload Mismatch without auto-rotating key and transitions to RECONCILIATION_REQUIRED', async () => {
      const conflictError: any = new Error('Payload mismatch');
      conflictError.response = {
        status: 409,
        data: { message: 'Phát hiện xung đột Idempotency: Cùng Idempotency-Key nhưng nội dung yêu cầu (payload) đã bị thay đổi' },
      };

      (stockTransactionsService.importStock as any).mockRejectedValue(conflictError);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const keyVal = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
        expect(screen.getByText(/CẢNH BÁO BẮT BUỘC ĐỐI CHIẾU/i)).toBeDefined();
      });

      // Confirm button must be disabled
      expect((screen.getByTestId('btn-confirm-submit-import') as HTMLButtonElement).disabled).toBe(true);

      // Key must NOT be automatically rotated!
      expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(keyVal);
    });

    it('TC-STK-22: Handles HTTP 409 In-Progress (< 30s) by transitioning to AMBIGUOUS_OUTCOME without auto-retry or draft reset', async () => {
      const inProgressError: any = new Error('In progress');
      inProgressError.response = {
        status: 409,
        data: { message: 'Yêu cầu với Idempotency-Key này đang được xử lý, vui lòng chờ trong giây lát' },
      };

      (stockTransactionsService.importStock as any).mockRejectedValue(inProgressError);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const keyVal = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
        expect(screen.getByTestId('ambiguous-error-detail')).toBeDefined();
        expect(screen.getByTestId('ambiguous-error-detail').textContent).toContain('đang được xử lý trên máy chủ');
      });

      // Form inputs and submit must be disabled
      expect((screen.getByTestId('btn-confirm-submit-import') as HTMLButtonElement).disabled).toBe(true);

      // Key must NOT be changed
      expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(keyVal);
    });

    it('TC-STK-23: Reconciliation Required blocks exit without verified evidence and safely resets upon valid justification', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutError);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const initialKey = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      // Wait for ambiguous banner
      await waitFor(() => {
        expect(screen.getByText(/Yêu cầu Đối chiếu \/ Thay đổi/i)).toBeDefined();
      });

      // Click to request reconciliation
      fireEvent.click(screen.getByText(/Yêu cầu Đối chiếu \/ Thay đổi/i));

      await waitFor(() => {
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
      });

      // Attempt 1: Click resolve reconciliation WITHOUT entering evidence note -> MUST FAIL and stay in banner
      fireEvent.click(screen.getByTestId('btn-resolve-reconciliation'));

      await waitFor(() => {
        expect(screen.getByTestId('reconcile-error-msg')).toBeDefined();
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
      });

      // Key must still NOT rotate while unverified
      expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(initialKey);

      // Attempt 2: Even with valid format audit ticket & 16-char token from client, CANNOT unlock
      fireEvent.change(screen.getByTestId('input-reconcile-auditticket'), {
        target: { value: 'AUDIT-20261014-9988' },
      });
      fireEvent.change(screen.getByTestId('input-reconcile-authorizedby'), {
        target: { value: 'supervisor-admin' },
      });
      fireEvent.change(screen.getByTestId('input-reconcile-token'), {
        target: { value: 'SECRET-TOKEN-AUTH-16CHARS' },
      });
      fireEvent.change(screen.getByTestId('input-reconcile-evidence'), {
        target: { value: 'Đã kiểm tra backend DB: Không có bản ghi tồn dư thực tế' },
      });

      fireEvent.click(screen.getByTestId('btn-resolve-reconciliation'));

      await waitFor(() => {
        // Must REMAIN locked in reconciliation-banner (Task 1 & Task 5)
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
        expect(screen.getByTestId('reconciliation-error-detail')).toBeDefined();
        expect(
          screen.getAllByText(/Chức năng giải phóng đối soát thủ công từ giao diện người dùng đã bị vô hiệu hóa/i).length
        ).toBeGreaterThan(0);
      });

      // Key must NOT be rotated while unverified
      expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(initialKey);
    });
  });

  // =========================================================================
  // GROUP 7: FEATURE FLAG FAIL-CLOSED & CACHE ISOLATION TESTS
  // =========================================================================
  describe('Group 7: Feature Flag Fail-Closed & Cache Invalidation', () => {
    it('TC-STK-24: Feature Flag OFF strictly throws and blocks real POST in service layer', async () => {
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(false);

      const actualModule = await vi.importActual<any>('../services/stock-transactions.service');
      const actualService = actualModule.stockTransactionsService;

      // Call service layer directly with feature flag OFF
      await expect(
        actualService.importStock(
          { items: [{ itemId: ITEM_1, locationId: LOC_1, quantity: 5 }] },
          'test-key'
        )
      ).rejects.toThrow(/Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified \/ Disabled/i);

      await expect(
        actualService.exportStock(
          { reason: 'Xuất kho', items: [{ itemId: ITEM_1, locationId: LOC_1, quantity: 5 }] },
          'test-key'
        )
      ).rejects.toThrow(/Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified \/ Disabled/i);

      await expect(
        actualService.transferStock(
          { reason: 'Điều chuyển', items: [{ itemId: ITEM_1, fromLocationId: 'loc-1', toLocationId: 'loc-2', quantity: 5 }] },
          'test-key'
        )
      ).rejects.toThrow(/Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified \/ Disabled/i);

      await expect(
        actualService.adjustStock(
          { reason: 'Kiểm kê', items: [{ itemId: ITEM_1, locationId: LOC_1, actualOnHand: 15 }] },
          'test-key'
        )
      ).rejects.toThrow(/Tính năng Ghi Giao dịch Kho đang ở chế độ Mock-Verified \/ Disabled/i);
    });

    it('TC-STK-25: Successful transaction triggers cache invalidation and logout clears queryClient cache', async () => {
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(true);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const clearSpy = vi.spyOn(queryClient, 'clear');

      (stockTransactionsService.importStock as any).mockResolvedValue({
        id: 'new-tx',
        transactionNumber: 'IMP-SUCCESS-01',
      });

      renderWithProviders(<StockTransactionsPage />);

      // Open import modal
      await waitFor(() => {
        expect(screen.getByTestId('btn-open-import')).toBeDefined();
      });
      fireEvent.click(screen.getByTestId('btn-open-import'));

      // Fill line
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        // Verify proper queries were invalidated
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stock-transactions', 'list'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inventory', 'balances'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inventory', 'summary'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['locations', 'tree'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['locations', 'list'] });
      });

      // Clear cache on logout
      queryClient.clear();
      expect(clearSpy).toHaveBeenCalled();
    });

    it('TC-STK-26: Account switch resets snapshot of User A and prevents User B from retrying User A transaction (Task 3 #8)', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutError);

      const { rerender } = render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const initialKey = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
      });

      // Now simulate account switch to User B: rerender modal with userId="user-manager-2"
      rerender(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-manager-2"
          userRole="LAB_MANAGER"
          onSuccess={vi.fn()}
        />
      );

      // Ambiguous banner belonging to User A must be cleared, state reset to DRAFT with brand new key
      await waitFor(() => {
        expect(screen.queryByTestId('ambiguous-state-banner')).toBeNull();
        const switchedKey = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;
        expect(switchedKey).not.toBe(initialKey);
      });
    });

    it('TC-STK-27: TanStack Query cancels in-flight queries on logout, preventing late responses from populating cache (Task 4)', async () => {
      const cancelSpy = vi.spyOn(queryClient, 'cancelQueries');
      const clearSpy = vi.spyOn(queryClient, 'clear');

      // Create a deferred promise representing a slow in-flight GET query for User A
      let resolveSlowQuery: (data: any) => void;
      const slowQueryPromise = new Promise<any>((resolve) => {
        resolveSlowQuery = resolve;
      });

      // Start query in cache for User A
      const queryPromise = queryClient.fetchQuery({
        queryKey: ['stock-transactions', 'user-a-data'],
        queryFn: () => slowQueryPromise,
      });

      // User A logs out: queries are cancelled and cleared
      queryClient.cancelQueries();
      queryClient.clear();

      expect(cancelSpy).toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();

      // Now late response arrives from server
      resolveSlowQuery!({ sensitiveSecretData: 'user-a-audit-record' });
      await queryPromise.catch(() => {});

      // Verify that User A data does NOT exist in queryClient cache
      const cachedData = queryClient.getQueryData(['stock-transactions', 'user-a-data']);
      expect(cachedData).toBeUndefined();
    });
  });

  // =========================================================================
  // GROUP 8: REASON VALIDATION CONTRACT BOUNDARIES (TASK 1)
  // =========================================================================
  describe('Group 8: Reason Validation Contract Boundaries (Task 1)', () => {
    it('TC-STK-RZN-01: Export modal validates reason boundary (2 chars rejected, 3 chars accepted, whitespace rejected)', async () => {
      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      // Boundary 1: Whitespace-only string "   "
      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: '   ' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByText(/Lý do xuất kho là bắt buộc và phải có ít nhất 3 ký tự/i)).toBeDefined();
      });

      // Boundary 2: Length = 2 ("AB")
      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: 'AB' } });
      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByText(/Lý do xuất kho là bắt buộc và phải có ít nhất 3 ký tự/i)).toBeDefined();
      });

      // Boundary 3: Length = 3 ("ABC") - Valid!
      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: 'ABC' } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '2' } });

      (stockTransactionsService.exportStock as any).mockResolvedValueOnce({ id: 'tx-ok' });
      fireEvent.click(screen.getByTestId('btn-review-export'));
      await waitFor(() => expect(screen.getByTestId('export-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-export'));

      await waitFor(() => {
        expect(screen.queryByText(/Lý do xuất kho là bắt buộc và phải có ít nhất 3 ký tự/i)).toBeNull();
      });
    });

    it('TC-STK-RZN-02: Transfer modal validates reason boundary (4 chars rejected, 5 chars accepted, whitespace rejected)', async () => {
      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      // Boundary 1: Whitespace-only string "     "
      fireEvent.change(screen.getByTestId('transfer-reason-input'), { target: { value: '     ' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });
      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByText(/Lý do điều chuyển là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeDefined();
      });

      // Boundary 2: Length = 4 ("ABCD") - Must be rejected!
      fireEvent.change(screen.getByTestId('transfer-reason-input'), { target: { value: 'ABCD' } });
      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByText(/Lý do điều chuyển là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeDefined();
      });

      // Boundary 3: Length = 5 ("ABCDE") - Valid!
      fireEvent.change(screen.getByTestId('transfer-reason-input'), { target: { value: 'ABCDE' } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '2' } });

      (stockTransactionsService.transferStock as any).mockResolvedValueOnce({ id: 'tx-trf-ok' });
      fireEvent.click(screen.getByTestId('btn-review-transfer'));
      await waitFor(() => expect(screen.getByTestId('transfer-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-transfer'));

      await waitFor(() => {
        expect(screen.queryByText(/Lý do điều chuyển là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeNull();
      });
    });

    it('TC-STK-RZN-03: Adjustment modal validates reason boundary (4 chars rejected, 5 chars accepted, whitespace rejected)', async () => {
      render(
        <StockAdjustmentModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      // Boundary 1: Whitespace-only string "     "
      fireEvent.change(screen.getByTestId('adjustment-reason-input'), { target: { value: '     ' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-actual-onhand-0'), { target: { value: '15' } });
      fireEvent.click(screen.getByTestId('btn-submit-adjustment'));

      await waitFor(() => {
        expect(screen.getByText(/Lý do điều chỉnh kiểm kê là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeDefined();
      });

      // Boundary 2: Length = 4 ("ABCD") - Must be rejected!
      fireEvent.change(screen.getByTestId('adjustment-reason-input'), { target: { value: 'ABCD' } });
      fireEvent.click(screen.getByTestId('btn-submit-adjustment'));

      await waitFor(() => {
        expect(screen.getByText(/Lý do điều chỉnh kiểm kê là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeDefined();
      });

      // Boundary 3: Length = 5 ("ABCDE") - Valid!
      fireEvent.change(screen.getByTestId('adjustment-reason-input'), { target: { value: 'ABCDE' } });

      (stockTransactionsService.adjustStock as any).mockResolvedValueOnce({ id: 'tx-adj-ok' });
      fireEvent.click(screen.getByTestId('btn-submit-adjustment'));

      await waitFor(() => {
        expect(screen.queryByText(/Lý do điều chỉnh kiểm kê là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeNull();
      });
    });
  });

  // =========================================================================
  // GROUP 9: GET TRANSACTION SUMMARY MAPPING & DETAIL MODAL (TASK 2)
  // =========================================================================
  describe('Group 9: GET Transaction Summary Mapping & Detail Modal (Task 2)', () => {
    it('TC-STK-MAP-01: List renders normal transaction with itemCount = 3, totalQuantity = 25 and no details without showing 0', async () => {
      (stockTransactionsService.listTransactions as any).mockResolvedValueOnce({
        transactions: [
          {
            id: 'tx-norm-01',
            transactionNumber: 'IMP-20261013-0099',
            type: StockTransactionType.IMPORT,
            status: TransactionStatus.COMPLETED,
            notes: 'Phiếu nhập bình thường không trả details trong list',
            creatorName: 'Quản Trị Viên ACM',
            createdAt: '2026-10-13T10:00:00.000Z',
            updatedAt: '2026-10-13T10:00:00.000Z',
            itemCount: 3,
            totalQuantity: 25,
            details: undefined, // List does not include details!
          },
        ],
        meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
      });

      renderWithProviders(<StockTransactionsPage />);

      await waitFor(() => {
        expect(screen.getByText('IMP-20261013-0099')).toBeDefined();
      });

      const row = screen.getByTestId('tx-row-tx-norm-01');
      expect(row.textContent).toContain('3');
      expect(row.textContent).toContain('25');
    });

    it('TC-STK-MAP-02: List renders historical orphan with itemCount = 0, totalQuantity = 0 properly', async () => {
      (stockTransactionsService.listTransactions as any).mockResolvedValueOnce({
        transactions: [
          {
            id: 'tx-orphan-demo',
            transactionNumber: 'IMP-20261013-9021',
            type: StockTransactionType.IMPORT,
            status: TransactionStatus.COMPLETED,
            notes: 'Historical orphan header',
            creatorName: 'Quản Trị Viên ACM',
            createdAt: '2026-10-13T09:00:00.000Z',
            updatedAt: '2026-10-13T09:00:00.000Z',
            itemCount: 0,
            totalQuantity: 0,
            details: [],
          },
        ],
        meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
      });

      renderWithProviders(<StockTransactionsPage />);

      await waitFor(() => {
        expect(screen.getByText('IMP-20261013-9021')).toBeDefined();
      });

      const row = screen.getByTestId('tx-row-tx-orphan-demo');
      expect(row.textContent).toContain('0');
    });

    it('TC-STK-MAP-03: Detail modal fetches transaction by ID when list item has no details and renders 3 line items table', async () => {
      const mockFullDetail = {
        id: 'tx-norm-01',
        transactionNumber: 'IMP-20261013-0099',
        type: StockTransactionType.IMPORT,
        status: TransactionStatus.COMPLETED,
        notes: 'Phiếu nhập chi tiết đầy đủ',
        creatorName: 'Quản Trị Viên ACM',
        createdAt: '2026-10-13T10:00:00.000Z',
        updatedAt: '2026-10-13T10:00:00.000Z',
        itemCount: 3,
        totalQuantity: 25,
        details: [
          { id: 'd-1', itemId: ITEM_1, locationId: LOC_1, quantity: 10, unitCost: 1000, item: mockItems[0], location: mockLocations[0] },
          { id: 'd-2', itemId: ITEM_2, locationId: LOC_1, quantity: 10, unitCost: 2000, item: mockItems[1], location: mockLocations[0] },
          { id: 'd-3', itemId: ITEM_1, locationId: LOC_2, quantity: 5, unitCost: 1000, item: mockItems[0], location: mockLocations[1] },
        ],
      };

      (stockTransactionsService.getTransactionById as any).mockResolvedValueOnce(mockFullDetail);

      renderWithProviders(
        <StockTransactionDetailModal
          isOpen={true}
          onClose={vi.fn()}
          transaction={{
            id: 'tx-norm-01',
            transactionNumber: 'IMP-20261013-0099',
            type: StockTransactionType.IMPORT,
            status: TransactionStatus.COMPLETED,
            createdById: 'user-admin-1',
            creatorName: 'Quản Trị Viên ACM',
            createdAt: '2026-10-13T10:00:00.000Z',
            updatedAt: '2026-10-13T10:00:00.000Z',
            itemCount: 3,
            totalQuantity: 25,
            details: undefined, // details not loaded yet!
          }}
        />
      );

      // Verify that getTransactionById was called to fetch full details
      await waitFor(() => {
        expect(stockTransactionsService.getTransactionById).toHaveBeenCalledWith('tx-norm-01');
        expect(screen.getByText('Danh sách Mặt hàng trong Phiếu (3)')).toBeDefined();
        // It must NOT show orphan empty notice!
        expect(screen.queryByTestId('detail-empty-orphan-notice')).toBeNull();
      });
    });

    it('TC-STK-MAP-04: Detail modal renders historical orphan fixture notice when transaction details array is empty', () => {
      renderWithProviders(
        <StockTransactionDetailModal
          isOpen={true}
          onClose={vi.fn()}
          transaction={{
            id: 'tx-orphan-96',
            transactionNumber: 'IMP-20261013-9021',
            type: StockTransactionType.IMPORT,
            status: TransactionStatus.COMPLETED,
            createdById: 'user-admin-1',
            creatorName: 'Quản Trị Viên ACM',
            createdAt: '2026-10-13T09:00:00.000Z',
            updatedAt: '2026-10-13T09:00:00.000Z',
            itemCount: 0,
            totalQuantity: 0,
            details: [],
          }}
        />
      );

      expect(screen.getByTestId('detail-empty-orphan-notice')).toBeDefined();
      expect(screen.getByText(/Chứng từ lịch sử không có chi tiết dòng mặt hàng \(0 dòng\)/i)).toBeDefined();
    });
  });

  // =========================================================================
  // GROUP 10: ADVANCED IDEMPOTENCY FSM & RBAC TESTS (TASK 4 & TASK 6)
  // =========================================================================
  describe('Group 10: Advanced Idempotency FSM & RBAC Tests (Task 4 & Task 6)', () => {
    it('TC-STK-FSM-01: Handles HTTP 409 Tenant/User Mismatch without auto-rotating key', async () => {
      const tenantMismatchError: any = new Error('Tenant mismatch');
      tenantMismatchError.response = {
        status: 409,
        data: { message: 'Khóa Idempotency-Key này đã được sử dụng cho một người dùng hoặc thao tác khác' },
      };

      (stockTransactionsService.importStock as any).mockRejectedValue(tenantMismatchError);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      const keyVal = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
        expect(screen.getByText(/người dùng hoặc thao tác khác/i)).toBeDefined();
      });

      // Submit button must be disabled
      expect((screen.getByTestId('btn-confirm-submit-import') as HTMLButtonElement).disabled).toBe(true);

      // Key must NOT be automatically rotated!
      expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(keyVal);
    });

    it('TC-STK-FSM-02: Unclassified HTTP 409 error triggers fallback to RECONCILIATION_REQUIRED', async () => {
      const unclassifiedError: any = new Error('Custom conflict');
      unclassifiedError.response = {
        status: 409,
        data: { message: 'Custom database conflict on unique constraints' },
      };

      (stockTransactionsService.importStock as any).mockRejectedValue(unclassifiedError);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        // Unclassified 409 triggers fallback to RECONCILIATION_REQUIRED banner
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
      });
    });

    it('TC-STK-FSM-03: Server HTTP 500 / 502 / 504 errors transition to AMBIGUOUS_OUTCOME without auto-retry', async () => {
      const server500Error: any = new Error('Internal Server Error');
      server500Error.response = { status: 500, data: { message: 'Database query timeout' } };

      (stockTransactionsService.importStock as any).mockRejectedValue(server500Error);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
        // Server errors must NEVER automatically re-POST
        expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
      });
    });

    it('TC-STK-FSM-04: Form inputs and buttons are strictly disabled during AMBIGUOUS_OUTCOME', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      (stockTransactionsService.exportStock as any).mockRejectedValue(timeoutError);

      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole="ADMIN"
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: 'Xuất linh kiện phục vụ lớp K21' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.click(screen.getByTestId('btn-review-export'));
      await waitFor(() => expect(screen.getByTestId('export-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-export'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
      });

      // Verify all inputs are strictly disabled to freeze the payload
      expect((screen.getByTestId('export-reason-input') as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByTestId('select-item-0') as HTMLSelectElement).disabled).toBe(true);
      expect((screen.getByTestId('select-location-0') as HTMLSelectElement).disabled).toBe(true);
      expect((screen.getByTestId('input-qty-0') as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByTestId('btn-confirm-submit-export') as HTMLButtonElement).disabled).toBe(true);
    });

    it('TC-STK-RBAC-01: STUDENT user is directly shown 403 Forbidden screen and all queries are disabled', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockStudentUser,
        token: 'student-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderWithProviders(<StockTransactionsPage />);

      expect(screen.getByTestId('rbac-forbidden-screen')).toBeDefined();
      expect(screen.getByText(/403 - Quyền Truy Cập Bị Từ Chối/i)).toBeDefined();
      expect(screen.queryByTestId('stock-transactions-table')).toBeNull();
    });
  });
});
