// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReportsPage } from './ReportsPage';
import { apiClient } from '../services/api';
import * as authHooks from '../hooks/useAuth';

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('ReportsPage DOM Test Suite', () => {
  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@acm.local',
    fullName: 'Admin User',
    role: 'ADMIN' as const,
  };

  const mockManagerUser = {
    id: 'mgr-1',
    email: 'manager@acm.local',
    fullName: 'Lab Manager',
    role: 'LAB_MANAGER' as const,
  };

  const mockInventoryReport = [
    {
      id: 'item-1',
      code: 'ESP32-DEVKIT',
      name: 'ESP32 DevKit V1',
      unit: 'cái',
      type: 'TRACKED_ASSET',
      categoryName: 'Vi điều khiển',
      onHand: 30,
      reserved: 5,
      quarantined: 2,
      kitAllocated: 3,
      borrowed: 4,
      available: 20,
      minStockAlert: 10,
      stockStatus: 'IN_STOCK',
    },
    {
      id: 'item-2',
      code: 'DHT22-SEN',
      name: 'Cảm biến DHT22',
      unit: 'cái',
      type: 'CONSUMABLE',
      categoryName: 'Cảm biến',
      onHand: 2,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
      available: 2,
      minStockAlert: 5,
      stockStatus: 'LOW_STOCK',
    },
  ];

  const mockBorrowReport = {
    summary: {
      totalRequests: 25,
      approvedCount: 5,
      handedOverCount: 8,
      returnedCount: 10,
      partiallyReturnedCount: 2,
      rejectedCount: 0,
      cancelledCount: 0,
      overdueCount: 1,
      returnRatePercent: 50,
      damagedOrLostCount: 1,
    },
    overdueList: [
      {
        id: 'req-overdue-1',
        requestNumber: 'REQ-2026-001',
        borrowerName: 'Nguyễn Văn A',
        borrowerEmail: 'nva@student.local',
        borrowerPhone: '0912345678',
        purpose: 'Bài tập lớn IoT',
        expectedBorrowDate: '2026-02-01',
        expectedReturnDate: '2026-02-10',
        daysOverdue: 5,
        items: [
          { code: 'ESP32-DEVKIT', name: 'ESP32 DevKit V1', quantity: 2, returnedQuantity: 1 },
        ],
      },
    ],
  };

  const mockLowStockAlerts = [
    {
      id: 'item-2',
      code: 'DHT22-SEN',
      name: 'Cảm biến DHT22',
      categoryName: 'Cảm biến',
      unit: 'cái',
      onHand: 2,
      available: 2,
      minStockAlert: 5,
      urgencyRatio: 0.4,
      stockStatus: 'LOW_STOCK',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockAdminUser as any,
      token: 'admin-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/reports/inventory') {
        return Promise.resolve({ data: { success: true, data: mockInventoryReport } } as any);
      }
      if (url === '/reports/borrow-return') {
        return Promise.resolve({ data: { success: true, data: mockBorrowReport } } as any);
      }
      if (url === '/reports/low-stock') {
        return Promise.resolve({ data: { success: true, data: mockLowStockAlerts } } as any);
      }
      return Promise.resolve({ data: { success: true, data: [] } } as any);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('blocks non-ADMIN user (LAB_MANAGER) with 403 restriction notice and prevents API calls', () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockManagerUser as any,
      token: 'manager-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Truy cập bị từ chối (403 Forbidden)')).toBeDefined();
    expect(
      screen.getByText('Chỉ Quản trị viên (ADMIN) mới có quyền truy cập Báo cáo & Thống kê theo phân quyền hệ thống.')
    ).toBeDefined();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('renders Inventory report table for ADMIN by default', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Báo cáo & Thống kê (Reports & Analytics)')).toBeDefined();
    expect(screen.getByText('Kiểm kê tồn kho')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('ESP32-DEVKIT')).toBeDefined();
      expect(screen.getByText('DHT22-SEN')).toBeDefined();
      expect(screen.getByText('20')).toBeDefined(); // available stock
    });
  });

  it('filters inventory items when typing in search input', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ESP32-DEVKIT')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Tìm mã, tên, danh mục...');
    fireEvent.change(searchInput, { target: { value: 'DHT22' } });

    await waitFor(() => {
      expect(screen.queryByText('ESP32-DEVKIT')).toBeNull();
      expect(screen.getByText('DHT22-SEN')).toBeDefined();
    });
  });

  it('switches to Borrow-Return tab and displays summary cards and overdue loans', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    const borrowTab = screen.getByText('Mượn - Trả & Quá hạn');
    fireEvent.click(borrowTab);

    await waitFor(() => {
      expect(screen.getByText('Tổng phiếu')).toBeDefined();
      expect(screen.getByText('25')).toBeDefined(); // totalRequests
      expect(screen.getByText('Tỷ lệ trả')).toBeDefined();
      expect(screen.getByText('50%')).toBeDefined();
      expect(screen.getByText('REQ-2026-001')).toBeDefined();
      expect(screen.getByText('Nguyễn Văn A')).toBeDefined();
      expect(screen.getByText('5 ngày')).toBeDefined();
    });
  });

  it('switches to Low Stock tab and displays critical alerts', async () => {
    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    const lowStockTab = screen.getByText('Cảnh báo tồn tối thiểu');
    fireEvent.click(lowStockTab);

    await waitFor(() => {
      expect(screen.getByText('DHT22-SEN')).toBeDefined();
      expect(screen.getByText('40%')).toBeDefined(); // urgencyRatio = 0.4
    });
  });

  it('triggers CSV download without error when clicking export buttons', async () => {
    // Mock URL.createObjectURL and link.click
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.createObjectURL = createObjectURLMock;

    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Xuất CSV Kiểm kê')).toBeDefined();
    });

    const exportBtn = screen.getByText('Xuất CSV Kiểm kê');
    fireEvent.click(exportBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it('renders graceful empty state when inventory data is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [] },
    } as any);

    render(
      <BrowserRouter>
        <ReportsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Không có linh kiện nào khớp với tiêu chí tìm kiếm.')).toBeDefined();
    });
  });
});
