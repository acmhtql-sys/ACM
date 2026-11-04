// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuditLogsPage } from './AuditLogsPage';
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

describe('ACM MVP – AuditLogsPage DOM Test Suite', () => {
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

  const mockLogs = [
    {
      id: 'log-1',
      action: 'CREATE_ITEM',
      entity: 'Item',
      entityId: 'item-uuid-1',
      userName: 'Admin User',
      createdAt: '2026-11-04T08:00:00Z',
      details: JSON.stringify({ code: 'ESP32-WROOM', name: 'ESP32 Microcontroller', quantity: 20 }),
    },
    {
      id: 'log-2',
      action: 'APPROVE_BORROW',
      entity: 'BorrowRequest',
      entityId: 'BR-20261104-001',
      userName: 'Admin User',
      createdAt: '2026-11-04T09:30:00Z',
      details: JSON.stringify({ borrowerId: 'std-1', status: 'APPROVED' }),
    },
    {
      id: 'log-3',
      action: 'UPDATE_PASSWORD',
      entity: 'User',
      entityId: 'user-uuid-9',
      userName: 'System',
      createdAt: '2026-11-04T10:00:00Z',
      details: JSON.stringify({ passwordHash: '[REDACTED]', isLocked: false }),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderAuditPage = () => {
    return render(
      <BrowserRouter>
        <AuditLogsPage />
      </BrowserRouter>
    );
  };

  describe('RBAC & Authorization Guard', () => {
    it('blocks non-ADMIN user (LAB_MANAGER) from viewing audit logs and does not fetch API', () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockManagerUser,
        token: 'mgr-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      } as any);

      renderAuditPage();

      expect(screen.getByText(/Giới hạn Quyền Truy Cập \(Access Denied\)/i)).toBeDefined();
      expect(screen.getByText(/Phân hệ Nhật ký Kiểm toán chỉ dành riêng cho Quản trị viên \(ADMIN\)/i)).toBeDefined();
      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('ADMIN Audit Logs Inspection & Filtering', () => {
    beforeEach(() => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockAdminUser,
        token: 'admin-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      } as any);
    });

    it('loads and renders 50-limit array response with scope notice and action badges', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: mockLogs,
        },
      });

      renderAuditPage();

      expect(apiClient.get).toHaveBeenCalledWith('/audit-logs');

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeDefined();
      });

      const table = screen.getByRole('table');
      expect(within(table).getByText('CREATE_ITEM')).toBeDefined();
      expect(within(table).getByText('APPROVE_BORROW')).toBeDefined();
      expect(within(table).getByText('UPDATE_PASSWORD')).toBeDefined();

      // Check scope banner
      expect(screen.getByText(/Đang hiển thị tối đa 50 bản ghi kiểm toán mới nhất/i)).toBeDefined();
      expect(screen.getByText('3 / 3 bản ghi')).toBeDefined();

      // Check users
      expect(within(table).getAllByText('Admin User').length).toBe(2);
      expect(within(table).getByText('System')).toBeDefined();
    });

    it('filters logs by search input in real time within the loaded 50 records', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: mockLogs,
        },
      });

      renderAuditPage();

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeDefined();
      });

      const searchInput = screen.getByPlaceholderText(/Tìm theo hành động, đối tượng/i);
      fireEvent.change(searchInput, { target: { value: 'BR-20261104-001' } });

      const table = screen.getByRole('table');
      expect(within(table).getByText('APPROVE_BORROW')).toBeDefined();
      expect(within(table).queryByText('CREATE_ITEM')).toBeNull();
      expect(within(table).queryByText('UPDATE_PASSWORD')).toBeNull();
      expect(screen.getByText('1 / 3 bản ghi')).toBeDefined();
    });

    it('filters logs by action dropdown', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: mockLogs,
        },
      });

      renderAuditPage();

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeDefined();
      });

      const actionSelect = screen.getByDisplayValue(/Tất cả hành động/i);
      fireEvent.change(actionSelect, { target: { value: 'UPDATE_PASSWORD' } });

      const table = screen.getByRole('table');
      expect(within(table).getByText('UPDATE_PASSWORD')).toBeDefined();
      expect(within(table).queryByText('CREATE_ITEM')).toBeNull();
      expect(within(table).queryByText('APPROVE_BORROW')).toBeNull();
    });

    it('opens detail modal and displays sanitized JSON payload without secrets', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: mockLogs,
        },
      });

      renderAuditPage();

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeDefined();
      });

      // Find all "Xem chi tiết" buttons
      const detailButtons = screen.getAllByRole('button', { name: /Xem chi tiết/i });
      fireEvent.click(detailButtons[2]); // click 3rd item (UPDATE_PASSWORD)

      // Modal appears
      await waitFor(() => {
        expect(screen.getByText(/Chi tiết Bản ghi Kiểm toán/i)).toBeDefined();
      });

      // Security notice inside modal
      expect(
        screen.getByText(/Các trường nhạy cảm \(mật khẩu, hash, token xác thực, JWT, API keys\) đã được hệ thống tự động khử ẩn danh/i)
      ).toBeDefined();

      // Confirms [REDACTED] is displayed in modal payload
      expect(screen.getAllByText(/\[REDACTED\]/).length).toBeGreaterThan(0);

      // Close modal
      const closeButton = screen.getByRole('button', { name: 'Đóng' });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText(/Chi tiết Bản ghi Kiểm toán/i)).toBeNull();
      });
    });

    it('handles empty audit logs state gracefully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          success: true,
          data: [],
        },
      });

      renderAuditPage();

      await waitFor(() => {
        expect(screen.getByText(/Chưa có bản ghi nhật ký kiểm toán nào/i)).toBeDefined();
      });
    });

    it('handles 403 Forbidden response from API', async () => {
      vi.mocked(apiClient.get).mockRejectedValue({
        response: { status: 403 },
      });

      renderAuditPage();

      await waitFor(() => {
        expect(
          screen.getByText(/Truy cập bị từ chối: Chỉ Quản trị viên \(ADMIN\) mới có quyền/i)
        ).toBeDefined();
      });
    });

    it('handles network error and provides retry button', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Kết nối thất bại'));

      renderAuditPage();

      await waitFor(() => {
        expect(screen.getByText(/Không thể tải nhật ký kiểm toán/i)).toBeDefined();
      });

      expect(screen.getByText(/Kết nối thất bại/i)).toBeDefined();

      const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
      expect(retryBtn).toBeDefined();
    });
  });
});
