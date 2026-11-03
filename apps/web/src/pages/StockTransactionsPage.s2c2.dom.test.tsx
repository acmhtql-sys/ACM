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
  UserRole,
} from '@acm/shared';
import { StockTransactionsPage } from './StockTransactionsPage';
import { stockTransactionsService } from '../services/stock-transactions.service';
import { stockMovementsService } from '../services/stock-movements.service';
import { apiClient } from '../services/api';
import * as authHook from '../hooks/useAuth';
import * as features from '../config/features';

// Mock services
vi.mock('../services/stock-transactions.service', () => ({
  stockTransactionsService: {
    listTransactions: vi.fn(),
    getTransactionById: vi.fn(),
    importStock: vi.fn(),
    exportStock: vi.fn(),
    transferStock: vi.fn(),
    adjustStock: vi.fn(),
  },
}));

vi.mock('../services/stock-movements.service', () => ({
  stockMovementsService: {
    listMovements: vi.fn(),
  },
}));

vi.mock('../services/inventory.service', () => ({
  inventoryService: {
    getLocations: vi.fn().mockResolvedValue([]),
    getBalances: vi.fn().mockResolvedValue({ balances: [], meta: {} }),
  },
}));

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn(),
  },
}));

describe('ACM Step S2C-2: Read-Only Frontend Integration DOM Test Suite', () => {
  let queryClient: QueryClient;

  const mockAdminUser = {
    id: 'user-admin-1',
    email: 'admin@acm.test',
    fullName: 'Quản Trị Viên ACM',
    role: UserRole.ADMIN,
  };

  const mockLabManagerUser = {
    id: 'user-labmgr-1',
    email: 'labmgr@acm.test',
    fullName: 'Quản Lý Lab ACM',
    role: UserRole.LAB_MANAGER,
  };

  const mockTechUser = {
    id: 'user-tech-1',
    email: 'tech@acm.test',
    fullName: 'Kỹ Thuật Viên ACM',
    role: UserRole.TECHNICIAN,
  };

  const mockStudentUser = {
    id: 'user-student-1',
    email: 'student@acm.test',
    fullName: 'Sinh Viên ACM',
    role: UserRole.STUDENT,
  };

  const mockTransactionsPage1 = [
    {
      id: 'tx-001',
      transactionNumber: 'EXP-20261014-4705',
      type: StockTransactionType.EXPORT,
      status: TransactionStatus.COMPLETED,
      notes: 'Xuất kho linh kiện nghiên cứu',
      createdById: 'user-admin-1',
      creatorName: 'Quản Trị Viên ACM',
      createdAt: '2026-10-14T08:30:00.000Z',
      updatedAt: '2026-10-14T08:30:00.000Z',
      itemCount: 1,
      totalQuantity: 50,
      details: [
        {
          id: 'det-1',
          stockTransactionId: 'tx-001',
          itemId: 'item-1',
          locationId: 'loc-1',
          quantity: 50,
          item: { id: 'item-1', code: 'RES-10K', name: 'Điện trở 10k', unit: 'Cái' },
          location: { id: 'loc-1', code: 'BIN-01', name: 'Ngăn 01', type: LocationType.BIN },
        },
      ],
    },
  ];

  const mockMovementsPage1 = [
    {
      id: 'mov-pos-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      type: StockTransactionType.IMPORT,
      quantityDelta: 80,
      onHandBefore: 20,
      onHandAfter: 100,
      referenceType: 'STOCK_TRANSACTION',
      referenceId: 'tx-001',
      reason: 'Nhập bổ sung kho',
      createdById: 'user-admin-1',
      creatorName: 'Quản Trị Viên ACM',
      createdAt: '2026-10-14T09:00:00.000Z',
      item: { id: 'item-1', code: 'RES-10K', name: 'Điện trở 10k', unit: 'Cái' },
      location: { id: 'loc-1', code: 'BIN-01', name: 'Ngăn 01', type: LocationType.BIN },
    },
    {
      id: 'mov-neg-2',
      itemId: 'item-2',
      locationId: 'loc-2',
      type: StockTransactionType.EXPORT,
      quantityDelta: -30,
      onHandBefore: 50,
      onHandAfter: 20,
      referenceType: 'STOCK_TRANSACTION',
      referenceId: 'tx-001',
      reason: 'Xuất cấp cho phòng thực hành',
      createdById: 'user-tech-1',
      creatorName: 'Kỹ Thuật Viên ACM',
      createdAt: '2026-10-14T09:15:00.000Z',
      item: { id: 'item-2', code: 'CAP-100U', name: 'Tụ điện 100uF', unit: 'Cái' },
      location: { id: 'loc-2', code: 'BIN-02', name: 'Ngăn 02', type: LocationType.BIN },
    },
    {
      id: 'mov-zero-3',
      itemId: 'item-3',
      locationId: 'loc-1',
      type: StockTransactionType.ADJUSTMENT,
      quantityDelta: 0,
      onHandBefore: 15,
      onHandAfter: 15,
      referenceType: 'STOCK_TRANSACTION',
      referenceId: 'tx-001',
      reason: 'Kiểm kê khớp sổ',
      createdById: 'user-admin-1',
      creatorName: 'Quản Trị Viên ACM',
      createdAt: '2026-10-14T09:30:00.000Z',
      item: { id: 'item-3', code: 'LED-RED', name: 'LED đỏ 5mm', unit: 'Cái' },
      location: { id: 'loc-1', code: 'BIN-01', name: 'Ngăn 01', type: LocationType.BIN },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      token: 'admin-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    // Default: write flag is OFF (fail-closed S2C-2 default)
    vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(false);

    (stockTransactionsService.listTransactions as any).mockResolvedValue({
      transactions: mockTransactionsPage1,
      meta: { page: 1, limit: 20, totalItems: 45, totalPages: 3, hasNextPage: true, hasPrevPage: false },
    });

    (stockMovementsService.listMovements as any).mockResolvedValue({
      movements: mockMovementsPage1,
      meta: { page: 1, limit: 20, totalItems: 50, totalPages: 3, hasNextPage: true, hasPrevPage: false },
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderPage = (initialEntries = ['/inventory/transactions']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <StockTransactionsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  // =========================================================================
  // GROUP 1: TWO-TAB NAVIGATION & TRANSACTION HISTORY (TASK 2)
  // =========================================================================
  describe('Group 1: Tab Navigation & Stock Transaction History', () => {
    it('TC-S2C2-01: Renders page with two tabs and displays Transactions table by default', async () => {
      renderPage();

      expect(screen.getByTestId('tab-transactions')).toBeDefined();
      expect(screen.getByTestId('tab-movements')).toBeDefined();

      await waitFor(() => {
        expect(screen.getByTestId('stock-transactions-table')).toBeDefined();
        expect(screen.getByText('EXP-20261014-4705')).toBeDefined();
        expect(screen.getByText('Quản Trị Viên ACM')).toBeDefined();
        expect(screen.getByText('50')).toBeDefined();
      });
    });

    it('TC-S2C2-02: Clicking row or eye icon opens transaction detail modal', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('btn-view-detail-tx-001')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-view-detail-tx-001'));

      await waitFor(() => {
        expect(screen.getByTestId('transaction-detail-modal')).toBeDefined();
        expect(screen.getByTestId('detail-tx-number').textContent).toBe('EXP-20261014-4705');
      });
    });
  });

  // =========================================================================
  // GROUP 2: STOCK MOVEMENT LEDGER & DELTA FORMATTING (TASK 3)
  // =========================================================================
  describe('Group 2: Stock Movement Ledger & Quantity Delta Styling', () => {
    it('TC-S2C2-03: Switching to Movements tab renders ledger with items, locations and deltas', async () => {
      renderPage(['/inventory/transactions?tab=movements']);

      await waitFor(() => {
        expect(screen.getByTestId('stock-movements-table')).toBeDefined();
        expect(screen.getByText('Điện trở 10k')).toBeDefined();
        expect(screen.getByText('Tụ điện 100uF')).toBeDefined();
        expect(screen.getByText('LED đỏ 5mm')).toBeDefined();
      });

      // Positive delta: +80 in emerald/green
      const posDelta = screen.getByTestId('delta-mov-pos-1');
      expect(posDelta.textContent).toBe('+80');
      expect(posDelta.className).toContain('text-emerald-600');

      // Negative delta: -30 in rose/red
      const negDelta = screen.getByTestId('delta-mov-neg-2');
      expect(negDelta.textContent).toBe('-30');
      expect(negDelta.className).toContain('text-rose-600');

      // Zero delta: 0 in slate
      const zeroDelta = screen.getByTestId('delta-mov-zero-3');
      expect(zeroDelta.textContent).toBe('0');
      expect(zeroDelta.className).toContain('text-slate-500');
    });

    it('TC-S2C2-04: Clicking reference link in movement row opens detail modal for transaction', async () => {
      (stockTransactionsService.getTransactionById as any).mockResolvedValueOnce(mockTransactionsPage1[0]);

      renderPage(['/inventory/transactions?tab=movements']);

      await waitFor(() => {
        expect(screen.getByTestId('btn-movement-ref-mov-pos-1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-movement-ref-mov-pos-1'));

      await waitFor(() => {
        expect(screen.getByTestId('transaction-detail-modal')).toBeDefined();
        expect(screen.getByTestId('detail-tx-number').textContent).toBe('EXP-20261014-4705');
      });
    });
  });

  // =========================================================================
  // GROUP 3: PAGINATION REGRESSION TESTS (TASK 1)
  // =========================================================================
  describe('Group 3: Pagination Regression Tests (Task 1)', () => {
    it('TC-S2C2-PAG-01: Transactions pagination navigates to page 2 and passes page=2 to API', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('btn-next-page')).toBeDefined();
      });

      // Click "Sau" (Next page)
      fireEvent.click(screen.getByTestId('btn-next-page'));

      await waitFor(() => {
        expect(stockTransactionsService.listTransactions).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2 })
        );
      });
    });

    it('TC-S2C2-PAG-02: Movements pagination navigates to page 2 and passes page=2 to API', async () => {
      renderPage(['/inventory/transactions?tab=movements']);

      await waitFor(() => {
        expect(screen.getByTestId('btn-movement-next-page')).toBeDefined();
      });

      // Click "Sau" on movements table
      fireEvent.click(screen.getByTestId('btn-movement-next-page'));

      await waitFor(() => {
        expect(stockMovementsService.listMovements).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2 })
        );
      });
    });

    it('TC-S2C2-PAG-03: Filter change properly resets page parameter back to 1', async () => {
      renderPage(['/inventory/transactions?page=3']);

      await waitFor(() => {
        expect(stockTransactionsService.listTransactions).toHaveBeenCalledWith(
          expect.objectContaining({ page: 3 })
        );
      });

      // Change type filter
      fireEvent.change(screen.getByTestId('filter-type-select'), { target: { value: 'IMPORT' } });

      await waitFor(() => {
        expect(stockTransactionsService.listTransactions).toHaveBeenCalledWith(
          expect.objectContaining({ page: 1, type: 'IMPORT' })
        );
      });
    });
  });

  // =========================================================================
  // GROUP 4: LOADING, EMPTY & ERROR STATES (TASK 2, 3, 4)
  // =========================================================================
  describe('Group 4: Loading, Empty, and Error States', () => {
    it('TC-S2C2-05: Displays EmptyState when movement query returns 0 items', async () => {
      (stockMovementsService.listMovements as any).mockResolvedValueOnce({
        movements: [],
        meta: { page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      renderPage(['/inventory/transactions?tab=movements']);

      await waitFor(() => {
        expect(screen.getByText('Không có biến động kho nào')).toBeDefined();
        expect(screen.queryByTestId('stock-movements-table')).toBeNull();
      });
    });

    it('TC-S2C2-06: Displays ErrorAlert when movement query encounters network failure', async () => {
      (stockMovementsService.listMovements as any).mockRejectedValueOnce(
        new Error('Network connection timeout')
      );

      renderPage(['/inventory/transactions?tab=movements']);

      await waitFor(() => {
        expect(screen.getByText('Không thể nạp nhật ký biến động kho')).toBeDefined();
        expect(screen.getByText(/Network connection timeout/i)).toBeDefined();
      });
    });

    it('TC-S2C2-ERR-01: Detail modal displays error state and retry button when getTransactionById fails without creating mutations', async () => {
      (stockTransactionsService.getTransactionById as any).mockRejectedValueOnce(
        new Error('Mất kết nối máy chủ khi nạp chứng từ')
      );

      renderPage(['/inventory/transactions?tab=movements']);

      await waitFor(() => {
        expect(screen.getByTestId('btn-movement-ref-mov-pos-1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('btn-movement-ref-mov-pos-1'));

      await waitFor(() => {
        expect(screen.getByTestId('transaction-detail-modal-error')).toBeDefined();
        expect(screen.getByText('Không thể tải chi tiết chứng từ')).toBeDefined();
        expect(screen.getByText('Mất kết nối máy chủ khi nạp chứng từ')).toBeDefined();
        expect(screen.getByTestId('btn-retry-detail-fetch')).toBeDefined();
      });

      // Confirm no mutations were triggered
      expect(apiClient.post).not.toHaveBeenCalled();

      // Click Close button
      fireEvent.click(screen.getByTestId('btn-close-detail-error'));

      await waitFor(() => {
        expect(screen.queryByTestId('transaction-detail-modal-error')).toBeNull();
      });
    });
  });

  // =========================================================================
  // GROUP 5: RBAC & STRICT READ-ONLY UI SAFETY (TASK 2 & TASK 4)
  // =========================================================================
  describe('Group 5: RBAC & Strict Read-Only UI Safety (Task 2 & Task 4)', () => {
    it('TC-S2C2-07: STUDENT role is blocked by 403 Forbidden screen, no tables rendered', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockStudentUser,
        token: 'student-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderPage();

      expect(screen.getByTestId('rbac-forbidden-screen')).toBeDefined();
      expect(screen.getByText(/403 - Quyền Truy Cập Bị Từ Chối/i)).toBeDefined();
      expect(screen.queryByTestId('stock-transactions-table')).toBeNull();
      expect(screen.queryByTestId('stock-movements-table')).toBeNull();
      expect(stockTransactionsService.listTransactions).not.toHaveBeenCalled();
      expect(stockMovementsService.listMovements).not.toHaveBeenCalled();
    });

    it('TC-S2C2-08: TECHNICIAN role has read-only access and write-actions-toolbar is NOT rendered', async () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockTechUser,
        token: 'tech-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderPage();

      expect(screen.queryByTestId('rbac-forbidden-screen')).toBeNull();
      await waitFor(() => {
        expect(screen.getByTestId('stock-transactions-table')).toBeDefined();
      });

      // Mutation write actions toolbar is strictly hidden for TECHNICIAN
      expect(screen.queryByTestId('write-actions-toolbar')).toBeNull();
      expect(screen.queryByTestId('btn-open-import')).toBeNull();
      expect(screen.queryByTestId('btn-open-export')).toBeNull();
    });

    it('TC-S2C2-SAFE-01: ADMIN user cannot open any mutation modals when flag=false and ZERO Stock POST is called', async () => {
      // Flag is strictly false
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(false);

      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        token: 'admin-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('read-only-safety-badge')).toBeDefined();
        expect(screen.getByText('Chế độ Giám sát Read-Only (S2C-2)')).toBeDefined();
      });

      const importBtn = screen.getByTestId('btn-open-import') as HTMLButtonElement;
      expect(importBtn.disabled).toBe(true);

      // Attempt click on disabled Import button
      fireEvent.click(importBtn);

      // Modals must NOT open in DOM
      expect(screen.queryByTestId('stock-import-modal')).toBeNull();
      expect(screen.queryByTestId('stock-export-modal')).toBeNull();
      expect(screen.queryByTestId('stock-transfer-modal')).toBeNull();
      expect(screen.queryByTestId('stock-adjustment-modal')).toBeNull();

      // STRICT GUARANTEE: ZERO Stock POST called
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(stockTransactionsService.importStock).not.toHaveBeenCalled();
    });

    it('TC-S2C2-SAFE-02: LAB_MANAGER user cannot open any mutation modals when flag=false and ZERO Stock POST is called', async () => {
      // Flag is strictly false
      vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(false);

      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: mockLabManagerUser,
        token: 'labmgr-token',
        login: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: true,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('read-only-safety-badge')).toBeDefined();
      });

      const exportBtn = screen.getByTestId('btn-open-export') as HTMLButtonElement;
      const transferBtn = screen.getByTestId('btn-open-transfer') as HTMLButtonElement;
      const adjustmentBtn = screen.getByTestId('btn-open-adjustment') as HTMLButtonElement;

      expect(exportBtn.disabled).toBe(true);
      expect(transferBtn.disabled).toBe(true);
      expect(adjustmentBtn.disabled).toBe(true);

      // Attempt clicks on all buttons
      fireEvent.click(exportBtn);
      fireEvent.click(transferBtn);
      fireEvent.click(adjustmentBtn);

      // Modals must NOT open in DOM
      expect(screen.queryByTestId('stock-export-modal')).toBeNull();
      expect(screen.queryByTestId('stock-transfer-modal')).toBeNull();
      expect(screen.queryByTestId('stock-adjustment-modal')).toBeNull();

      // STRICT GUARANTEE: ZERO Stock POST called
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(stockTransactionsService.exportStock).not.toHaveBeenCalled();
      expect(stockTransactionsService.transferStock).not.toHaveBeenCalled();
      expect(stockTransactionsService.adjustStock).not.toHaveBeenCalled();
    });
  });
});
