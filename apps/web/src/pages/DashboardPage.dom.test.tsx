// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
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

// Mock recharts ResponsiveContainer to render children reliably in JSDOM
vi.mock('recharts', async () => {
  const actual: any = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  };
});

describe('ACM MVP – DashboardPage DOM Test Suite', () => {
  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@acm.local',
    fullName: 'Admin User',
    role: 'ADMIN' as const,
  };

  const mockStudentUser = {
    id: 'student-1',
    email: 'student@acm.local',
    fullName: 'Student User',
    role: 'STUDENT' as const,
  };

  const mockSummaryData = {
    kpis: {
      totalItems: 12,
      totalOnHand: 350,
      totalAvailable: 290,
      totalReserved: 30,
      totalBorrowed: 45,
      totalQuarantined: 15,
      totalKitAllocated: 15,
      activeBorrows: 5,
      pendingApprovalBorrows: 2,
      lowStockCount: 3,
    },
    distribution: [
      { name: 'Khả dụng (Available)', value: 290 },
      { name: 'Đang mượn (Borrowed)', value: 45 },
      { name: 'Giữ chỗ (Reserved)', value: 30 },
      { name: 'Gán Kit (KitAllocated)', value: 15 },
      { name: 'Cách ly lỗi (Quarantined)', value: 15 },
    ],
    monthlyTrends: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderDashboard = () => {
    return render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );
  };

  describe('RBAC & Role-Aware Visibility', () => {
    it('restricts non-ADMIN user (STUDENT) from calling summary API and shows RBAC notice', () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockStudentUser,
        token: 'student-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      } as any);

      renderDashboard();

      expect(screen.getByText(/Bảng điều khiển Báo cáo & Thống kê Chuyên sâu \(ADMIN Only\)/i)).toBeDefined();
      expect(screen.getByText(/Bạn hiện đang đăng nhập với vai trò/i)).toBeDefined();
      expect(screen.getByText('STUDENT')).toBeDefined();

      // Must NOT call /reports/summary
      expect(apiClient.get).not.toHaveBeenCalled();

      // Provides navigation links to accessible areas
      expect(screen.getByText(/Tra cứu Linh kiện & Thiết bị/i)).toBeDefined();
      expect(screen.getByText(/Phiếu Mượn & Trả/i)).toBeDefined();
    });
  });

  describe('ADMIN Dashboard Rendering & KPI Accuracy', () => {
    beforeEach(() => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockAdminUser,
        token: 'admin-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      } as any);
    });

    it('fetches /reports/summary and displays real KPI numbers without fake trends', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: mockSummaryData,
        },
      });

      renderDashboard();

      expect(apiClient.get).toHaveBeenCalledWith('/reports/summary');

      // Wait for data to render
      await waitFor(() => {
        expect(screen.getByText('12')).toBeDefined(); // totalItems
      });

      expect(screen.getByText('290')).toBeDefined(); // totalAvailable
      expect(screen.getByText('5')).toBeDefined(); // activeBorrows
      expect(screen.getByText('3')).toBeDefined(); // lowStockCount

      // Verified invariant note exists
      expect(screen.getByText(/Nguyên tắc bất biến:/i)).toBeDefined();

      // No fake demo notice or fake trends
      expect(screen.queryByText(/DemoDataNotice/i)).toBeNull();
      expect(screen.queryByText(/7 linh kiện cốt lõi đã nạp seed/i)).toBeNull();
    });

    it('displays empty state for monthly trends when no historical data exists', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: {
            ...mockSummaryData,
            monthlyTrends: [],
          },
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Chưa có đủ dữ liệu lịch sử lưu chuyển kho/i)).toBeDefined();
      });
      expect(
        screen.getByText(/Biểu đồ xu hướng sẽ tự động kích hoạt khi hệ thống phát sinh các giao dịch/i)
      ).toBeDefined();
    });

    it('renders BarChart when real monthly trends data is present', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: {
            ...mockSummaryData,
            monthlyTrends: [
              { month: 'T10', imports: 50, exports: 20, borrows: 5 },
              { month: 'T11', imports: 30, exports: 10, borrows: 3 },
            ],
          },
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Lưu chuyển Kho theo Tháng')).toBeDefined();
      });
      expect(screen.queryByText(/Chưa có đủ dữ liệu lịch sử lưu chuyển kho/i)).toBeNull();
    });

    it('displays explicit error state when API fails and does not fallback to demo data', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Mạng không ổn định'));

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Lỗi tải dữ liệu Bảng điều khiển/i)).toBeDefined();
      });

      expect(screen.getByText(/Mạng không ổn định/i)).toBeDefined();

      // No demo numbers displayed
      expect(screen.queryByText('570')).toBeNull();
      expect(screen.queryByText('438')).toBeNull();

      // Can retry
      const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
      expect(retryBtn).toBeDefined();
    });

    it('displays empty system state when zero items and stock exist', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: {
            kpis: {
              totalItems: 0,
              totalOnHand: 0,
              totalAvailable: 0,
              totalReserved: 0,
              totalBorrowed: 0,
              totalQuarantined: 0,
              totalKitAllocated: 0,
              activeBorrows: 0,
              pendingApprovalBorrows: 0,
              lowStockCount: 0,
            },
            distribution: [],
            monthlyTrends: [],
          },
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Chưa có dữ liệu vận hành trong hệ thống/i)).toBeDefined();
      });
    });
  });
});
