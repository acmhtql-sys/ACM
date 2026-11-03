// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StockImportModal } from '../components/stock-transactions/StockImportModal';
import { StockExportModal } from '../components/stock-transactions/StockExportModal';
import { StockTransferModal } from '../components/stock-transactions/StockTransferModal';
import { StockAdjustmentModal } from '../components/stock-transactions/StockAdjustmentModal';
import { StockTransactionsPage } from './StockTransactionsPage';
import { stockTransactionsService } from '../services/stock-transactions.service';
import { clearAllPendingAmbiguousSessions, getSessionStorageKey } from '../hooks/useIdempotentTransaction';
import * as features from '../config/features';
import * as authHook from '../hooks/useAuth';
import { UserRole, ItemResponse, LocationResponse, StockBalanceResponse } from '@acm/shared';

// Mock dependencies
vi.mock('../services/stock-transactions.service', () => ({
  stockTransactionsService: {
    listTransactions: vi.fn(),
    importStock: vi.fn(),
    exportStock: vi.fn(),
    transferStock: vi.fn(),
    adjustStock: vi.fn(),
    queryIdempotencyRecord: vi.fn(),
  },
}));

vi.mock('../services/stock-movements.service', () => ({
  stockMovementsService: {
    listMovements: vi.fn(),
  },
}));

vi.mock('../services/inventory.service', () => ({
  inventoryService: {
    getItems: vi.fn(),
    getBalances: vi.fn(),
  },
}));

vi.mock('../services/locations.service', () => ({
  locationsService: {
    getLocations: vi.fn(),
  },
}));

describe('ACM Step S2C-3A: Frontend Stock Mutation UI (Mock-Only Implementation Test Suite)', () => {
  let queryClient: QueryClient;

  const mockAdminUser = {
    id: 'user-admin-1',
    name: 'Quản Trị Viên ACM',
    fullName: 'Quản Trị Viên ACM',
    email: 'admin@acm.local',
    role: UserRole.ADMIN,
  };

  const mockLabManagerUser = {
    id: 'user-manager-1',
    name: 'Lab Manager ACM',
    fullName: 'Lab Manager ACM',
    email: 'manager@acm.local',
    role: UserRole.LAB_MANAGER,
  };

  const mockTechnicianUser = {
    id: 'user-tech-1',
    name: 'Kỹ Thuật Viên ACM',
    fullName: 'Kỹ Thuật Viên ACM',
    email: 'tech@acm.local',
    role: UserRole.TECHNICIAN,
  };

  const ITEM_1 = 'a1010000-0000-4000-8000-000000000101';
  const ITEM_2 = 'a1020000-0000-4000-8000-000000000102';
  const LOC_1 = 'b2010000-0000-4000-8000-000000000201';
  const LOC_2 = 'b2020000-0000-4000-8000-000000000202';
  const LOC_3 = 'b2030000-0000-4000-8000-000000000203';
  const BAL_1 = 'd3010000-0000-4000-8000-000000000301';
  const BAL_2 = 'd3020000-0000-4000-8000-000000000302';

  const mockItems = [
    {
      id: ITEM_1,
      code: 'RES-10K',
      name: 'Điện trở 10k Ohm',
      unit: 'Cái',
      categoryId: 'c1010000-0000-4000-8000-000000000001',
      minimumStock: 10,
      currentStock: 50,
      imageUrl: null,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: ITEM_2,
      code: 'CAP-100UF',
      name: 'Tụ điện 100uF',
      unit: 'Cái',
      categoryId: 'c1010000-0000-4000-8000-000000000001',
      minimumStock: 5,
      currentStock: 20,
      imageUrl: null,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
  ] as unknown as ItemResponse[];

  const mockLocations = [
    {
      id: LOC_1,
      code: 'BIN-A1',
      name: 'Ngăn linh kiện A1',
      type: 'STORAGE',
      area: 'Khu vực A',
      shelf: '1',
      bin: 'A1',
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: LOC_2,
      code: 'BIN-B2',
      name: 'Ngăn linh kiện B2',
      type: 'STORAGE',
      area: 'Khu vực B',
      shelf: '2',
      bin: 'B2',
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: LOC_3,
      code: 'BIN-C3',
      name: 'Ngăn linh kiện C3',
      type: 'STORAGE',
      area: 'Khu vực C',
      shelf: '3',
      bin: 'C3',
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
  ] as unknown as LocationResponse[];

  // Available stock calculation rule: OnHand - Reserved - Quarantined - KitAllocated
  // For LOC_1: 25 - 5 - 2 - 3 = 15 Available (Borrowed 4 is NOT subtracted)
  const mockBalances = [
    {
      id: BAL_1,
      itemId: ITEM_1,
      locationId: LOC_1,
      onHand: 25,
      reserved: 5,
      quarantined: 2,
      kitAllocated: 3,
      borrowed: 4,
      item: mockItems[0],
      location: mockLocations[0],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: BAL_2,
      itemId: ITEM_1,
      locationId: LOC_2,
      onHand: 10,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0, // Available = 10
      item: mockItems[0],
      location: mockLocations[1],
      createdAt: '',
      updatedAt: '',
    },
  ] as unknown as StockBalanceResponse[];

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
      transactions: [],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0,
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
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  // =========================================================================
  // GROUP 1: STOCK IMPORT MODAL VALIDATION & CONFIRMATION
  // =========================================================================
  describe('Group 1: Stock Import Modal (Phase 2)', () => {
    it('TC-S2C3A-IMP-01: Happy Path via Review Step -> Confirmation Screen -> Submit', async () => {
      const onSuccessMock = vi.fn();
      const mockResult = { id: 'tx-imp-001', transactionNumber: 'IMP-20261014-0001' };
      (stockTransactionsService.importStock as any).mockResolvedValue(mockResult);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={onSuccessMock}
        />
      );

      // Fill in details
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '20' } });
      fireEvent.change(screen.getByTestId('input-cost-0'), { target: { value: '5000' } });

      // Click review
      fireEvent.click(screen.getByTestId('btn-review-import'));

      // Confirmation step displayed
      await waitFor(() => {
        expect(screen.getByTestId('import-confirmation-step')).toBeDefined();
        expect(screen.getByText('Xác Nhận Danh Mục Nhập Kho Trước Khi Ghi Sổ')).toBeDefined();
        expect(screen.getByTestId('confirm-line-0')).toBeDefined();
      });

      // Submit from confirmation step
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => {
        expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
        expect(onSuccessMock).toHaveBeenCalledWith(mockResult);
      });
    });

    it('TC-S2C3A-IMP-02: Review Step allows going back to edit form without resetting data', async () => {
      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '15' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));

      await waitFor(() => {
        expect(screen.getByTestId('import-confirmation-step')).toBeDefined();
      });

      // Click back
      fireEvent.click(screen.getByTestId('btn-back-edit-import'));

      // Check values retained
      expect((screen.getByTestId('select-item-0') as HTMLSelectElement).value).toBe(ITEM_1);
      expect((screen.getByTestId('select-location-0') as HTMLSelectElement).value).toBe(LOC_1);
      expect((screen.getByTestId('input-qty-0') as HTMLInputElement).value).toBe('15');
    });

    it('TC-S2C3A-IMP-03: Validation blocks submit if quantity is zero, negative or non-integer', async () => {
      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '0' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Số lượng phải là số nguyên dương lớn hơn 0/i)).toBeDefined();
      });

      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GROUP 2: STOCK EXPORT MODAL VALIDATION & AVAILABLE STOCK GUARD
  // =========================================================================
  describe('Group 2: Stock Export Modal (Phase 3)', () => {
    it('TC-S2C3A-EXP-01: Happy Path via Review Step -> Confirmation Screen -> Submit', async () => {
      const onSuccessMock = vi.fn();
      const mockResult = { id: 'tx-exp-001', transactionNumber: 'EXP-20261014-0001' };
      (stockTransactionsService.exportStock as any).mockResolvedValue(mockResult);

      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // Available at LOC_1 is 15
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={onSuccessMock}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), {
        target: { value: 'Xuất linh kiện phục vụ thực hành môn Lập trình nhúng' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      // Click review
      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByTestId('export-confirmation-step')).toBeDefined();
        expect(screen.getByText('Xem Lại Danh Mục Mặt Hàng Xuất Kho')).toBeDefined();
        expect(screen.getByText(/Máy chủ sẽ thực hiện kiểm tra đối chiếu nguyên tử khi ghi sổ/i)).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-confirm-submit-export'));

      await waitFor(() => {
        expect(stockTransactionsService.exportStock).toHaveBeenCalledTimes(1);
        expect(onSuccessMock).toHaveBeenCalledWith(mockResult);
      });
    });

    it('TC-S2C3A-EXP-02: Over-stock quantity displays warning and blocks submit', async () => {
      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // Available at LOC_1 is 15
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), {
        target: { value: 'Xuất linh kiện' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      // Enter 20 > available 15
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '20' } });

      expect(screen.getByTestId('over-stock-error-0')).toBeDefined();

      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Số lượng xuất \(20\) vượt quá tồn kho khả dụng \(15\)/i)).toBeDefined();
      });

      expect(stockTransactionsService.exportStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-EXP-03: Reason requires minimum 3 characters', async () => {
      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: 'XK' } }); // only 2 chars
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '2' } });

      fireEvent.click(screen.getByTestId('btn-review-export'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Lý do xuất kho là bắt buộc và phải có ít nhất 3 ký tự/i)).toBeDefined();
      });

      expect(stockTransactionsService.exportStock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GROUP 3: STOCK TRANSFER MODAL VALIDATION & SAFETY GUARDS
  // =========================================================================
  describe('Group 3: Stock Transfer Modal (Phase 4)', () => {
    it('TC-S2C3A-TRF-01: Happy Path via Review Step -> Confirmation Screen -> Submit', async () => {
      const onSuccessMock = vi.fn();
      const mockResult = { id: 'tx-trf-001', transactionNumber: 'TRF-20261014-0001' };
      (stockTransactionsService.transferStock as any).mockResolvedValue(mockResult);

      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // Available at LOC_1 is 15
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={onSuccessMock}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), {
        target: { value: 'Điều chuyển linh kiện sang ngăn BIN-B2' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '8' } });

      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('transfer-confirmation-step')).toBeDefined();
        expect(screen.getByText('Xem Lại Danh Mục Mặt Hàng Điều Chuyển')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-confirm-submit-transfer'));

      await waitFor(() => {
        expect(stockTransactionsService.transferStock).toHaveBeenCalledTimes(1);
        expect(onSuccessMock).toHaveBeenCalledWith(mockResult);
      });
    });

    it('TC-S2C3A-TRF-02: Identical source and destination location is blocked', async () => {
      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), {
        target: { value: 'Điều chuyển cùng ngăn' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_1 } }); // Identical

      expect(screen.getByTestId('same-location-error-0')).toBeDefined();

      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Vị trí nguồn và vị trí đích không được trùng nhau/i)).toBeDefined();
      });

      expect(stockTransactionsService.transferStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-TRF-03: Aggregate Over-Allocation Guard blocks total requested > source available', async () => {
      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances} // Available at LOC_1 is 15
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), {
        target: { value: 'Điều chuyển chia nhỏ sang 2 ngăn' },
      });

      // Line 0: qty = 10 (10 <= 15)
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '10' } });

      // Line 1: qty = 10 (10 <= 15), total = 20 > 15
      fireEvent.click(screen.getByTestId('btn-add-line'));
      fireEvent.change(screen.getByTestId('select-item-1'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-1'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-1'), { target: { value: LOC_3 } });
      fireEvent.change(screen.getByTestId('input-qty-1'), { target: { value: '10' } });

      await waitFor(() => {
        expect(screen.getByTestId('aggregate-over-error-0')).toBeDefined();
        expect(screen.getByTestId('aggregate-over-error-1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(
          screen.getByText(/Tổng số lượng điều chuyển của linh kiện 'RES-10K' từ vị trí nguồn 'BIN-A1' \(20\) vượt quá tồn khả dụng \(15\)/i)
        ).toBeDefined();
      });

      expect(stockTransactionsService.transferStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-TRF-04: Reason requires minimum 5 characters', async () => {
      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), { target: { value: 'Chuy' } }); // 4 chars
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '2' } });

      fireEvent.click(screen.getByTestId('btn-review-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Lý do điều chuyển là bắt buộc và phải có ít nhất 5 ký tự/i)).toBeDefined();
      });

      expect(stockTransactionsService.transferStock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GROUP 4: SAFETY, FSM TRANSITIONS & CONCURRENCY
  // =========================================================================
  describe('Group 4: Idempotency FSM & Safety Controls (Phase 5)', () => {
    it('TC-S2C3A-SAFE-01: Double submit prevention freezes button while request is in flight', async () => {
      let resolveRequest: any;
      (stockTransactionsService.importStock as any).mockImplementation(
        () => new Promise((resolve) => { resolveRequest = resolve; })
      );

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));

      await waitFor(() => {
        expect(screen.getByTestId('import-confirmation-step')).toBeDefined();
      });

      const confirmBtn = screen.getByTestId('btn-confirm-submit-import');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('Đang xử lý giao dịch...')).toBeDefined();
      });

      // Second click does nothing
      fireEvent.click(confirmBtn);
      expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);

      resolveRequest({ id: 'done', transactionNumber: 'IMP-OK' });
    });

    it('TC-S2C3A-SAFE-02: Network Timeout transitions to AMBIGUOUS_OUTCOME with frozen snapshot', async () => {
      const timeoutErr = new Error('timeout of 10000ms exceeded');
      (timeoutErr as any).code = 'ECONNABORTED';
      (stockTransactionsService.exportStock as any).mockRejectedValue(timeoutErr);

      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      const initialKey = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('export-reason-input'), {
        target: { value: 'Xuất linh kiện phòng thí nghiệm điện tử' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '3' } });

      fireEvent.click(screen.getByTestId('btn-review-export'));
      await waitFor(() => expect(screen.getByTestId('export-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-export'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
      });

      // Key is preserved
      expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(initialKey);
      // All inputs are disabled
      expect((screen.getByTestId('export-reason-input') as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByTestId('select-item-0') as HTMLSelectElement).disabled).toBe(true);
    });

    it('TC-S2C3A-SAFE-03: HTTP 409 In-Progress transitions to AMBIGUOUS_OUTCOME without auto-retry', async () => {
      const inProgressErr: any = new Error('In progress');
      inProgressErr.response = {
        status: 409,
        data: { message: 'Yêu cầu với Idempotency-Key này đang được xử lý, vui lòng chờ trong giây lát' },
      };
      (stockTransactionsService.transferStock as any).mockRejectedValue(inProgressErr);

      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), {
        target: { value: 'Điều chuyển sang kệ mới' },
      });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });

      fireEvent.click(screen.getByTestId('btn-review-transfer'));
      await waitFor(() => expect(screen.getByTestId('transfer-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-transfer'));

      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
        expect(screen.getByTestId('ambiguous-error-detail').textContent).toContain('đang được xử lý trên máy chủ');
      });

      expect(stockTransactionsService.transferStock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // GROUP 5: FEATURE FLAG & RBAC STRICT FAIL-CLOSED INTEGRATION
  // =========================================================================
  describe('Group 5: Feature Flag & RBAC Strict Fail-Closed Controls (Phase 6)', () => {
    it('TC-S2C3A-FLAG-01: When feature flag is FALSE, action buttons are disabled and modals cannot be opened', () => {
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(false);

      renderWithProviders(<StockTransactionsPage />);

      // Create buttons must be disabled
      const importBtn = screen.getByTestId('btn-open-import') as HTMLButtonElement;
      const exportBtn = screen.getByTestId('btn-open-export') as HTMLButtonElement;
      const transferBtn = screen.getByTestId('btn-open-transfer') as HTMLButtonElement;
      const adjustBtn = screen.getByTestId('btn-open-adjustment') as HTMLButtonElement;

      expect(importBtn.disabled).toBe(true);
      expect(exportBtn.disabled).toBe(true);
      expect(transferBtn.disabled).toBe(true);
      expect(adjustBtn.disabled).toBe(true);

      // Attempt clicking
      fireEvent.click(importBtn);
      fireEvent.click(exportBtn);
      fireEvent.click(transferBtn);
      fireEvent.click(adjustBtn);

      // Modals must NOT appear
      expect(screen.queryByTestId('stock-import-modal')).toBeNull();
      expect(screen.queryByTestId('stock-export-modal')).toBeNull();
      expect(screen.queryByTestId('stock-transfer-modal')).toBeNull();
      expect(screen.queryByTestId('stock-adjustment-modal')).toBeNull();
    });

    it('TC-S2C3A-FLAG-02: TECHNICIAN cannot perform writes even if feature flag were true', () => {
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(true);
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockTechnicianUser,
        token: 'tech-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderWithProviders(<StockTransactionsPage />);

      // Create buttons are not visible or disabled for TECHNICIAN
      expect(screen.queryByTestId('btn-open-import')).toBeNull();
      expect(screen.queryByTestId('btn-open-export')).toBeNull();
      expect(screen.queryByTestId('btn-open-transfer')).toBeNull();
      expect(screen.queryByTestId('btn-open-adjustment')).toBeNull();
    });
  });

  // =========================================================================
  // GROUP 6: SAFETY HARDENING REGRESSION TEST SUITE (TASK 7)
  // =========================================================================
  describe('Group 6: Safety Hardening Regression Test Suite (Task 7)', () => {
    it('TC-S2C3A-REG-01: evidenceNote = "abcde" cannot release reconciliation lock', async () => {
      const conflictErr: any = new Error('Conflict');
      conflictErr.response = { status: 409, data: { message: 'Conflict occurred' } };
      (stockTransactionsService.importStock as any).mockRejectedValue(conflictErr);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => expect(screen.getByTestId('reconciliation-banner')).toBeDefined());

      // Attempt resolving with simple text "abcde" without authoritative fields
      fireEvent.change(screen.getByTestId('input-reconcile-evidence'), { target: { value: 'abcde' } });
      fireEvent.click(screen.getByTestId('btn-resolve-reconciliation'));

      await waitFor(() => {
        expect(screen.getByTestId('reconcile-error-msg')).toBeDefined();
        expect(screen.getByTestId('reconciliation-banner')).toBeDefined();
      });
    });

    it('TC-S2C3A-REG-02: HTTP 404 from GET Idempotency cannot release ambiguous status', async () => {
      const timeoutErr: any = new Error('timeout');
      timeoutErr.code = 'ECONNABORTED';
      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutErr);

      const notFoundErr: any = new Error('Not found');
      notFoundErr.response = { status: 404, data: { message: 'Idempotency record not found' } };
      (stockTransactionsService.queryIdempotencyRecord as any).mockRejectedValue(notFoundErr);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined());

      // Click check status
      fireEvent.click(screen.getByTestId('btn-retry-ambiguous'));

      await waitFor(() => {
        expect(stockTransactionsService.queryIdempotencyRecord).toHaveBeenCalledTimes(1);
        // Modal must remain strictly locked in AMBIGUOUS_OUTCOME!
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
      });

      // importStock was NOT called again!
      expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
    });

    it('TC-S2C3A-REG-03: Timeout has no POST retry path before verifying result', async () => {
      const timeoutErr: any = new Error('timeout');
      timeoutErr.code = 'ECONNABORTED';
      (stockTransactionsService.exportStock as any).mockRejectedValue(timeoutErr);

      render(
        <StockExportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('export-reason-input'), { target: { value: 'Xuất kho kiểm tra an toàn timeout' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '2' } });

      fireEvent.click(screen.getByTestId('btn-review-export'));
      await waitFor(() => expect(screen.getByTestId('export-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-export'));

      await waitFor(() => expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined());

      // Button for direct re-POST does not exist or is strictly disabled
      expect(screen.queryByTestId('btn-submit-export')).toBeNull();
      const confirmBtn = screen.getByTestId('btn-confirm-submit-export') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
      fireEvent.click(confirmBtn);
      expect(stockTransactionsService.exportStock).toHaveBeenCalledTimes(1);
      // Only GET probe button is available
      expect(screen.getByTestId('btn-retry-ambiguous')).toBeDefined();
      expect(screen.getByText('Tra cứu trạng thái máy chủ (GET Idempotency)')).toBeDefined();
    });

    it('TC-S2C3A-REG-04: IN_PROGRESS 409 has no POST retry path before verifying result', async () => {
      const inProgressErr: any = new Error('In progress');
      inProgressErr.response = { status: 409, data: { message: 'Yêu cầu đang được xử lý' } };
      (stockTransactionsService.transferStock as any).mockRejectedValue(inProgressErr);

      render(
        <StockTransferModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={mockBalances}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('transfer-reason-input'), { target: { value: 'Điều chuyển kiểm tra IN_PROGRESS' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-from-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('select-to-location-0'), { target: { value: LOC_2 } });

      fireEvent.click(screen.getByTestId('btn-review-transfer'));
      await waitFor(() => expect(screen.getByTestId('transfer-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-transfer'));

      await waitFor(() => expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined());

      // No re-POST button or is strictly disabled
      expect(screen.queryByTestId('btn-submit-transfer')).toBeNull();
      const confirmBtn = screen.getByTestId('btn-confirm-submit-transfer') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
      fireEvent.click(confirmBtn);
      expect(stockTransactionsService.transferStock).toHaveBeenCalledTimes(1);
      // Only GET probe
      expect(screen.getByTestId('btn-retry-ambiguous')).toBeDefined();
    });

    it('TC-S2C3A-REG-05: Calling submit from AMBIGUOUS_OUTCOME is strictly rejected', async () => {
      const timeoutErr: any = new Error('timeout');
      timeoutErr.code = 'ECONNABORTED';
      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutErr);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined());

      // Any attempt to submit form directly while in AMBIGUOUS_OUTCOME is rejected
      const form = document.querySelector('form');
      if (form) {
        fireEvent.submit(form);
      }

      // Must NOT issue second call
      expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
    });

    it('TC-S2C3A-REG-06: Calling submit from RECONCILIATION_REQUIRED is strictly rejected', async () => {
      const conflictErr: any = new Error('Conflict');
      conflictErr.response = { status: 409, data: { message: 'Conflict occurred' } };
      (stockTransactionsService.importStock as any).mockRejectedValue(conflictErr);

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => expect(screen.getByTestId('reconciliation-banner')).toBeDefined());

      const form = document.querySelector('form');
      if (form) {
        fireEvent.submit(form);
      }

      expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
    });

    it('TC-S2C3A-REG-07: Bypassing Confirmation Step is strictly rejected (!isConfirming fails)', async () => {
      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      // Directly trigger form submit without clicking btn-review-import
      const form = document.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText('Bắt buộc phải xem lại và xác nhận thông tin phiếu trước khi phát lệnh ghi sổ.')).toBeDefined();
      });

      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-REG-08: Client validation blocks non-UUID IDs', async () => {
      const nonUuidItems = [
        {
          id: 'non-uuid-item-123',
          code: 'RES-10K',
          name: 'Điện trở',
          unit: 'Cái',
          isActive: true,
        },
      ] as any;
      const nonUuidLocations = [
        {
          id: 'non-uuid-loc-456',
          code: 'LOC-1',
          name: 'Vị trí 1',
          type: 'STORAGE',
          isActive: true,
        },
      ] as any;

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={nonUuidItems}
          locations={nonUuidLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: 'non-uuid-item-123' } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: 'non-uuid-loc-456' } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getAllByText(/Vui lòng chọn linh kiện hợp lệ \(UUID\)/i).length).toBeGreaterThan(0);
      });

      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-REG-09: Missing userRole rejects submit (fail-closed RBAC)', async () => {
      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={undefined} // Missing role
          onSuccess={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      // Review button is disabled
      const reviewBtn = screen.getByTestId('btn-review-import') as HTMLButtonElement;
      expect(reviewBtn.disabled).toBe(true);

      // Attempt submit via form event
      const form = document.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByTestId('client-validation-errors')).toBeDefined();
        expect(screen.getByText(/Bạn không có quyền thực hiện nghiệp vụ Nhập kho/i)).toBeDefined();
      });

      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-REG-10: Closing and reopening modal preserves ambiguous/reconciliation lock', async () => {
      const timeoutErr: any = new Error('timeout');
      timeoutErr.code = 'ECONNABORTED';
      (stockTransactionsService.importStock as any).mockRejectedValue(timeoutErr);

      const { rerender } = render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      const initialKey = (screen.getByTestId('idempotency-key-display') as HTMLInputElement).value;

      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-qty-0'), { target: { value: '5' } });

      fireEvent.click(screen.getByTestId('btn-review-import'));
      await waitFor(() => expect(screen.getByTestId('import-confirmation-step')).toBeDefined());
      fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));

      await waitFor(() => expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined());

      // Simulate closing the modal
      rerender(
        <StockImportModal
          isOpen={false}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      // Reopen the modal
      rerender(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      // Lock and Idempotency-Key are preserved from session!
      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
        expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(initialKey);
      });
    });

    it('TC-S2C3A-REG-11: When general write flag is enabled, Import/Export/Transfer are active, but Adjustment remains strictly disabled under independent feature gate', async () => {
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(true);
      vi.spyOn(features, 'isStockAdjustmentEnabled').mockReturnValue(false);
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      } as any);

      (stockTransactionsService.listTransactions as any).mockResolvedValue({
        transactions: [],
        meta: { totalItems: 0, totalPages: 1, currentPage: 1, itemsPerPage: 10 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <StockTransactionsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify that general write buttons are ENABLED
      const importBtn = screen.getByTestId('btn-open-import') as HTMLButtonElement;
      const exportBtn = screen.getByTestId('btn-open-export') as HTMLButtonElement;
      const transferBtn = screen.getByTestId('btn-open-transfer') as HTMLButtonElement;
      expect(importBtn.disabled).toBe(false);
      expect(exportBtn.disabled).toBe(false);
      expect(transferBtn.disabled).toBe(false);

      // Verify that Adjustment button is strictly DISABLED under independent feature gate
      const adjBtn = screen.getByTestId('btn-open-adjustment') as HTMLButtonElement;
      expect(adjBtn.disabled).toBe(true);
      expect(adjBtn.getAttribute('title')).toContain('bị khóa độc lập');

      // Now directly render StockAdjustmentModal to verify internal circuit-breaker
      cleanup();
      render(
        <StockAdjustmentModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          balances={[]}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={vi.fn()}
        />
      );

      // Verify independent gate banner is rendered
      expect(screen.getByTestId('adjustment-feature-gate-banner')).toBeDefined();

      // Fill valid form to pass client field validation
      fireEvent.change(screen.getByTestId('adjustment-reason-input'), { target: { value: 'Kiểm kê kho hợp lệ' } });
      fireEvent.change(screen.getByTestId('select-item-0'), { target: { value: ITEM_1 } });
      fireEvent.change(screen.getByTestId('select-location-0'), { target: { value: LOC_1 } });
      fireEvent.change(screen.getByTestId('input-actual-onhand-0'), { target: { value: '15' } });

      // Click submit
      fireEvent.click(screen.getByTestId('btn-submit-adjustment'));

      await waitFor(() => {
        expect(screen.getByText(/Nghiệp vụ Điều chỉnh kho \(ADJUSTMENT\) đang bị khóa độc lập do chưa có phê duyệt riêng/i)).toBeDefined();
      });

      expect(stockTransactionsService.adjustStock).not.toHaveBeenCalled();
    });

    it('TC-S2C3A-REG-12: In-flight reload recovery via GET Idempotency COMMITTED on StockImportModal (zero POST)', async () => {
      clearAllPendingAmbiguousSessions();
      const testKey = '77777777-7777-4777-8777-777777777777';
      const storageKey = getSessionStorageKey('user-admin-1', '/api/v1/stock-transactions/import');

      // Pre-populate sessionStorage simulating interrupted in-flight request during reload
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          endpoint: '/api/v1/stock-transactions/import',
          userId: 'user-admin-1',
          idempotencyKey: testKey,
          state: 'SUBMITTING',
          isPreDispatchPending: true,
          errorMessage: 'Giao dịch đã được phát đi nhưng phiên làm việc bị gián đoạn',
          errorCategory: 'NETWORK_TIMEOUT',
          timestamp: Date.now(),
        })
      );

      const onSuccessMock = vi.fn();

      render(
        <StockImportModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          locations={mockLocations}
          userId="user-admin-1"
          userRole={UserRole.ADMIN}
          onSuccess={onSuccessMock}
        />
      );

      // Restored into ambiguous state
      await waitFor(() => {
        expect(screen.getByTestId('ambiguous-state-banner')).toBeDefined();
        expect((screen.getByTestId('idempotency-key-display') as HTMLInputElement).value).toBe(testKey);
      });

      // Mock backend reporting COMMITTED
      (stockTransactionsService.queryIdempotencyRecord as any).mockResolvedValue({
        status: 'COMMITTED',
        transaction: {
          id: 'tx-recovered-999',
          transactionNumber: 'IMP-20261014-9999',
          status: 'COMPLETED',
        },
      });

      // Click "Tra cứu trạng thái máy chủ (GET Idempotency)"
      fireEvent.click(screen.getByTestId('btn-retry-ambiguous'));

      await waitFor(() => {
        expect(stockTransactionsService.queryIdempotencyRecord).toHaveBeenCalledWith(testKey);
        expect(onSuccessMock).toHaveBeenCalledWith(expect.objectContaining({
          id: 'tx-recovered-999',
          transactionNumber: 'IMP-20261014-9999',
        }));
      });

      // Zero POST dispatch!
      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
      // Storage cleared
      expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    });
  });
});
