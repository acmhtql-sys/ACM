// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { KitsPage } from './KitsPage';
import { apiClient } from '../services/api';
import * as authHooks from '../hooks/useAuth';

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('KitsPage Student Borrow & Return Inspection Test Suite', () => {
  const mockStudentUser = {
    id: 'student-1',
    email: 'student@acm.local',
    fullName: 'Nguyễn Văn Sinh Viên',
    role: 'STUDENT' as const,
  };

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@acm.local',
    fullName: 'Quản Trị Viên',
    role: 'ADMIN' as const,
  };

  const mockKitsList = [
    {
      id: 'kit-available-1',
      code: 'KIT-CE-01',
      name: 'Cat Eyes Robot Kit',
      description: 'Lắp ráp mô hình mắt mèo',
      status: 'AVAILABLE',
      locationId: 'loc-1',
      location: { id: 'loc-1', code: 'FZ-1', name: 'Al Fantasy Zoo 1' },
      items: [
        {
          id: 'ki-1',
          itemId: 'item-1',
          item: { id: 'item-1', code: 'SW-MAIN-02', name: 'Switch main 2', unit: 'Cái', type: 'COMPONENT' },
          quantity: 2,
        },
        {
          id: 'ki-2',
          itemId: 'item-2',
          item: { id: 'item-2', code: 'CAB-SRV-BLU', name: 'Servo wire Blue', unit: 'Sợi', type: 'COMPONENT' },
          quantity: 4,
        },
      ],
      totalItems: 6,
      createdAt: '2026-11-01T08:00:00Z',
      updatedAt: '2026-11-01T08:00:00Z',
    },
    {
      id: 'kit-allocated-2',
      code: 'KIT-WBM-01',
      name: 'Whose Big Mouth Kit',
      description: 'Lắp ráp mô hình miệng rộng',
      status: 'ALLOCATED',
      locationId: 'loc-1',
      location: { id: 'loc-1', code: 'FZ-1', name: 'Al Fantasy Zoo 1' },
      items: [
        {
          id: 'ki-3',
          itemId: 'item-3',
          item: { id: 'item-3', code: 'FRAME-01', name: 'Square frame', unit: 'Khung', type: 'COMPONENT' },
          quantity: 1,
        },
      ],
      totalItems: 1,
      createdAt: '2026-11-01T08:00:00Z',
      updatedAt: '2026-11-01T08:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/kits') {
        return Promise.resolve({
          data: {
            success: true,
            data: { items: mockKitsList, meta: { totalItems: 2, page: 1, limit: 20 } },
          },
        });
      }
      if (url.startsWith('/items')) {
        return Promise.resolve({ data: { success: true, data: { items: [] } } });
      }
      if (url.startsWith('/locations')) {
        return Promise.resolve({ data: { success: true, data: { locations: [] } } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('allows STUDENT to see "Đăng ký mượn" on AVAILABLE kit and submit borrow registration', async () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockStudentUser,
      token: 'student-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { success: true, data: { ...mockKitsList[0], status: 'ALLOCATED' } },
    } as any);

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    // Verify "Đăng ký mượn" button is visible for student on AVAILABLE kit
    await waitFor(() => {
      expect(screen.getByText('Đăng ký mượn')).toBeDefined();
    });

    // ALLOCATED kit should show "Đang được mượn"
    expect(screen.getByText('Đang được mượn')).toBeDefined();

    // Click "Đăng ký mượn" to open modal
    fireEvent.click(screen.getByText('Đăng ký mượn'));

    // Check modal opens with student borrow title
    expect(screen.getByText('Đăng ký mượn Hộp Kit thực hành')).toBeDefined();
    expect(screen.getAllByText('Cat Eyes Robot Kit').length).toBeGreaterThanOrEqual(1);

    // Submit the registration
    const submitBtn = screen.getByText('Xác nhận Đăng ký mượn Kit');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/kits/kit-available-1/status',
        expect.objectContaining({
          status: 'ALLOCATED',
          notes: expect.stringContaining('ĐĂNG KÝ MƯỢN KIT'),
        })
      );
    });
  });

  it('allows Operator to open "Nghiệm thu & Trả kit" modal on ALLOCATED kit and perform inspection', async () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockAdminUser,
      token: 'admin-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { success: true, data: { ...mockKitsList[1], status: 'AVAILABLE' } },
    } as any);

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    // Verify "Nghiệm thu & Trả kit" button is visible for Operator on ALLOCATED kit
    await waitFor(() => {
      expect(screen.getByText('Nghiệm thu & Trả kit')).toBeDefined();
    });

    // Click to open inspection modal
    fireEvent.click(screen.getByText('Nghiệm thu & Trả kit'));

    // Verify inspection modal title and components table
    expect(screen.getByText('Kiểm đếm & Nghiệm thu Hoàn trả Hộp Kit')).toBeDefined();
    expect(screen.getAllByText('Whose Big Mouth Kit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Square frame')).toBeDefined();

    // By default, 100% good items shows automated verdict: ĐẦY ĐỦ VÀ TỐT 100%
    expect(screen.getByText(/ĐẦY ĐỦ VÀ TỐT 100%/i)).toBeDefined();

    // Confirm return inspection
    const confirmBtn = screen.getByText('Xác nhận Nghiệm thu ➔ Đưa về Sẵn sàng');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/kits/kit-allocated-2/status',
        expect.objectContaining({
          status: 'AVAILABLE',
          notes: expect.stringContaining('NGHIỆM THU: ĐẦY ĐỦ 100%'),
        })
      );
    });
  });

  it('automatically sets status to MAINTENANCE when operator marks an item DAMAGED or missing', async () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockAdminUser,
      token: 'admin-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { success: true, data: { ...mockKitsList[1], status: 'MAINTENANCE' } },
    } as any);

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Nghiệm thu & Trả kit')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Nghiệm thu & Trả kit'));

    // Change condition of Square frame to DAMAGED
    const conditionSelect = screen.getByDisplayValue('🟢 Tốt (Đầy đủ)');
    fireEvent.change(conditionSelect, { target: { value: 'DAMAGED' } });

    // Automated verdict switches to BẢO TRÌ
    expect(screen.getByText(/PHÁT HIỆN HAO HỤT \/ HỎNG HÓC/i)).toBeDefined();

    const submitMaintenanceBtn = screen.getByText('Xác nhận Nghiệm thu ➔ Chuyển sang Bảo trì');
    fireEvent.click(submitMaintenanceBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/kits/kit-allocated-2/status',
        expect.objectContaining({
          status: 'MAINTENANCE',
          notes: expect.stringContaining('NGHIỆM THU: BẢO TRÌ'),
        })
      );
    });
  });
});
