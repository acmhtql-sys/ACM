// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { KitsPage, generateKitCode, removeVietnameseTones } from './KitsPage';
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

describe('KitsPage DOM Test Suite', () => {
  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@acm.local',
    fullName: 'Admin User',
    role: 'ADMIN' as const,
  };

  const mockTechUser = {
    id: 'tech-1',
    email: 'tech@acm.local',
    fullName: 'Kỹ Thuật Viên',
    role: 'TECHNICIAN' as const,
  };

  const mockStudentUser = {
    id: 'student-1',
    email: 'student@acm.local',
    fullName: 'Sinh Viên',
    role: 'STUDENT' as const,
  };

  const mockKitsList = [
    {
      id: 'kit-1',
      code: 'KIT-IOT-001',
      name: 'Bộ thực hành IoT ESP32',
      description: 'Kit thực hành vi điều khiển',
      status: 'AVAILABLE',
      location: { id: 'loc-1', code: 'WH-MAIN', name: 'Kho Tổng' },
      items: [
        {
          id: 'ki-1',
          itemId: 'item-1',
          item: { id: 'item-1', code: 'ESP32', name: 'ESP32 DevKit', unit: 'cái', type: 'TRACKED_ASSET' },
          quantity: 2,
          notes: 'Module chính',
        },
      ],
      totalItems: 2,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
    {
      id: 'kit-2',
      code: 'KIT-ROBOT-002',
      name: 'Bộ thực hành Robot ARM',
      description: 'Kit điều khiển cánh tay robot',
      status: 'ALLOCATED',
      location: { id: 'loc-1', code: 'WH-MAIN', name: 'Kho Tổng' },
      items: [],
      totalItems: 0,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
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
      if (url === '/kits') {
        return Promise.resolve({ data: { success: true, data: mockKitsList } } as any);
      }
      if (url === '/items') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'item-1',
                code: 'ESP32',
                name: 'ESP32 DevKit',
                unit: 'cái',
                categoryId: 'cat-mcu',
                categoryName: 'Vi điều khiển',
                stockBalances: [{ locationId: 'loc-1', available: 10, onHand: 15 }],
              },
              {
                id: 'item-2',
                code: 'MAIN-02',
                name: 'Main Board 2',
                unit: 'cái',
                categoryId: 'cat-mcu',
                categoryName: 'Vi điều khiển',
                stockBalances: [{ locationId: 'loc-1', available: 5, onHand: 5 }],
              },
              {
                id: 'item-3',
                code: 'SEN-IR',
                name: 'Cảm biến hồng ngoại',
                unit: 'cái',
                categoryId: 'cat-sensor',
                categoryName: 'Cảm biến',
                stockBalances: [{ locationId: 'loc-1', available: 0, onHand: 2 }],
              },
            ],
          },
        } as any);
      }
      if (url === '/locations') {
        return Promise.resolve({ data: { success: true, data: [{ id: 'loc-1', code: 'WH-MAIN', name: 'Kho Tổng' }] } } as any);
      }
      return Promise.resolve({ data: { success: true, data: [] } } as any);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders KitsPage workspace with title, search input, status tabs, and kits table', async () => {
    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Hộp Kit thực hành (Practice Kits)')).toBeDefined();
    expect(screen.getByPlaceholderText('Tìm theo mã, tên kit...')).toBeDefined();
    expect(screen.getByText('Tất cả')).toBeDefined();
    expect(screen.getByText('Sẵn sàng')).toBeDefined();
    expect(screen.getByText('Đang phân bổ')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('KIT-IOT-001')).toBeDefined();
      expect(screen.getByText('Bộ thực hành IoT ESP32')).toBeDefined();
      expect(screen.getByText('KIT-ROBOT-002')).toBeDefined();
    });
  });

  it('filters kits when clicking a status tab', async () => {
    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    const availableTab = screen.getByText('Sẵn sàng');
    fireEvent.click(availableTab);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/kits', {
        params: expect.objectContaining({ status: 'AVAILABLE' }),
      });
    });
  });

  it('toggles kit details when clicking kit code', async () => {
    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('KIT-IOT-001')).toBeDefined();
    });

    const kitCodeBtn = screen.getByText('KIT-IOT-001');
    fireEvent.click(kitCodeBtn);

    await waitFor(() => {
      expect(screen.getByText('Linh kiện thành phần trong hộp kit:')).toBeDefined();
      expect(screen.getByText('ESP32 DevKit')).toBeDefined();
    });
  });

  it('hides mutation buttons when logged in as STUDENT (read-only view)', async () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockStudentUser as any,
      token: 'student-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('KIT-IOT-001')).toBeDefined();
    });

    // "Tạo hộp kit mới" must NOT be rendered
    expect(screen.queryByText('Tạo hộp kit mới')).toBeNull();

    // Status action buttons ("Bàn giao", "Bảo trì", "Rã kit") in table must NOT be rendered
    const table = screen.getByRole('table');
    expect(within(table).queryByText('Bàn giao')).toBeNull();
    expect(within(table).queryByText('Bảo trì')).toBeNull();
    expect(within(table).queryByText('Rã kit')).toBeNull();
  });

  it('allows TECHNICIAN to see Create Kit and status actions but hides Delete button', async () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: mockTechUser as any,
      token: 'tech-token',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Tạo hộp kit mới')).toBeDefined();
      expect(screen.getByText('Bàn giao')).toBeDefined();
    });

    // Delete button (title="Xóa hộp kit") must NOT be present for TECHNICIAN
    expect(screen.queryByTitle('Xóa hộp kit')).toBeNull();
  });

  it('calls status update API when clicking Bàn giao action', async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { success: true, data: { ...mockKitsList[0], status: 'ALLOCATED' } },
    } as any);

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Bàn giao')).toBeDefined();
    });

    const handoverBtn = screen.getByText('Bàn giao');
    fireEvent.click(handoverBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/kits/kit-1/status', {
        status: 'ALLOCATED',
      });
    });
  });

  it('calls delete API when ADMIN clicks delete button on non-allocated kit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.delete).mockResolvedValueOnce({
      data: { success: true, message: 'Hộp kit đã được xóa' },
    } as any);

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle('Xóa hộp kit')).toBeDefined();
    });

    const deleteBtn = screen.getByTitle('Xóa hộp kit');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/kits/kit-1');
    });
  });

  it('displays empty state when kits array is empty', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/kits') {
        return Promise.resolve({ data: { success: true, data: [] } } as any);
      }
      return Promise.resolve({ data: { success: true, data: [] } } as any);
    });

    render(
      <BrowserRouter>
        <KitsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy hộp kit thực hành nào')).toBeDefined();
    });
  });

  describe('generateKitCode & Auto-generation Suite', () => {
    it('generates concise uppercase kit codes from Vietnamese names and handles duplicates', () => {
      expect(generateKitCode('AI FANTASY ZOO - Chủ đề 1')).toBe('KIT-AFZ-01');
      expect(generateKitCode('AI FANTASY ZOO - Chủ đề 2')).toBe('KIT-AFZ-02');
      expect(generateKitCode('Kit vi điều khiển IoT')).toBe('KIT-VDKI-01');
      expect(generateKitCode('Bộ thực hành IoT 01')).toBe('KIT-IOT-01');
      expect(generateKitCode('')).toBe('');
      expect(generateKitCode('   ')).toBe('');

      // Collision avoidance & auto-incrementing
      const existing = ['KIT-AFZ-01', 'KIT-AFZ-02'];
      expect(generateKitCode('AI FANTASY ZOO - Chủ đề 1', existing)).toBe('KIT-AFZ-03');
    });

    it('automatically generates kit code when user types kit name in Create Kit modal', async () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockTechUser as any,
        token: 'tech-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <BrowserRouter>
          <KitsPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Tạo hộp kit mới')).toBeDefined();
      });

      fireEvent.click(screen.getByText('Tạo hộp kit mới'));

      const nameInput = screen.getByTestId('kit-name-input');
      const codeInput = screen.getByTestId('kit-code-input') as HTMLInputElement;

      expect(codeInput.value).toBe('');

      // Type name
      fireEvent.change(nameInput, { target: { value: 'AI FANTASY ZOO - Chủ đề 1' } });
      expect(codeInput.value).toBe('KIT-AFZ-01');

      // Manual edit of code
      fireEvent.change(codeInput, { target: { value: 'CUSTOM-KIT-99' } });
      expect(codeInput.value).toBe('CUSTOM-KIT-99');

      // Changing name further does not overwrite manual edit
      fireEvent.change(nameInput, { target: { value: 'Kit vi điều khiển IoT ESP32' } });
      expect(codeInput.value).toBe('CUSTOM-KIT-99');

      // Clicking "Tạo lại theo tên" re-syncs
      const resyncBtn = screen.getByTitle('Tạo lại mã tự động theo tên hộp kit');
      fireEvent.click(resyncBtn);
      expect(codeInput.value).toBe('KIT-VDKIE-01');
    });

    it('applies kit template to populate kit name, auto-generated code, and matched components', async () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockTechUser as any,
        token: 'tech-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <BrowserRouter>
          <KitsPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Tạo hộp kit mới')).toBeDefined();
      });

      fireEvent.click(screen.getByText('Tạo hộp kit mới'));

      // Find template dropdown
      const templateSelect = screen.getByTitle('Nạp nhanh các linh kiện theo mẫu kit chuẩn');
      fireEvent.change(templateSelect, { target: { value: 'ai-fantasy-zoo' } });

      const nameInput = screen.getByTestId('kit-name-input') as HTMLInputElement;
      const codeInput = screen.getByTestId('kit-code-input') as HTMLInputElement;

      expect(nameInput.value).toBe('AI FANTASY ZOO - Chủ đề 1');
      expect(codeInput.value).toBe('KIT-AFZ-01');

      // The table should contain matched components like MAIN-02 and SEN-IR
      expect(screen.getAllByText(/Main Board 2/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Cảm biến hồng ngoại/).length).toBeGreaterThan(0);
    });

    it('batch adds components by category', async () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockTechUser as any,
        token: 'tech-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <BrowserRouter>
          <KitsPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Tạo hộp kit mới')).toBeDefined();
      });

      fireEvent.click(screen.getByText('Tạo hộp kit mới'));

      // Find category dropdown
      const categorySelect = screen.getByTitle('Thêm toàn bộ linh kiện của một danh mục vào kit');
      fireEvent.change(categorySelect, { target: { value: 'cat-sensor' } });

      // Cảm biến hồng ngoại should now be present in the kit table
      expect(screen.getAllByText(/Cảm biến hồng ngoại/).length).toBeGreaterThan(0);
    });

    it('opens multi-item search picker and adds selected items to kit', async () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: mockTechUser as any,
        token: 'tech-token',
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <BrowserRouter>
          <KitsPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Tạo hộp kit mới')).toBeDefined();
      });

      fireEvent.click(screen.getByText('Tạo hộp kit mới'));

      // Click "🔍 Tìm & Chọn linh kiện"
      const pickerBtn = screen.getByText('🔍 Tìm & Chọn linh kiện');
      fireEvent.click(pickerBtn);

      // Picker modal opens
      expect(screen.getByText('Tìm & Chọn linh kiện thêm vào Kit thực hành')).toBeDefined();

      // Click to check an item
      const itemRow = screen.getByText('ESP32 DevKit');
      fireEvent.click(itemRow);

      // Click "Thêm 1 linh kiện vào Kit"
      const addBtn = screen.getByText(/Thêm 1 linh kiện vào Kit/);
      fireEvent.click(addBtn);

      // Verify item appears in kit table with value
      expect(screen.getByDisplayValue(/ESP32 - ESP32 DevKit/)).toBeDefined();
    });
  });
});
