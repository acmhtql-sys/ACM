// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { UsersPage } from './UsersPage';
import { apiClient } from '../services/api';
import * as authHooks from '../hooks/useAuth';
import type { PublicUser } from './usersContracts';

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('ACM Phase 5 – Users Management Frontend DOM Test Suite (SEC-05)', () => {
  const currentAdminUser = {
    id: 'admin-uuid-1',
    email: 'admin1@acm.local',
    fullName: 'Primary Admin',
    role: 'ADMIN' as const,
  };

  const mockUsersList: PublicUser[] = [
    {
      id: 'admin-uuid-1',
      email: 'admin1@acm.local',
      fullName: 'Primary Admin',
      role: 'ADMIN',
      department: 'IT Dept',
      studentOrStaffId: 'STAFF-001',
      isActive: true,
      isLocked: false,
      createdAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'admin-uuid-2',
      email: 'admin2@acm.local',
      fullName: 'Secondary Admin',
      role: 'ADMIN',
      department: 'Lab Operations',
      studentOrStaffId: 'STAFF-002',
      isActive: true,
      isLocked: false,
      createdAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'student-uuid-1',
      email: 'student1@acm.local',
      fullName: 'Nguyen Van Sinh Vien',
      role: 'STUDENT',
      department: 'Computer Science',
      studentOrStaffId: 'SV2026001',
      isActive: true,
      isLocked: false,
      createdAt: '2026-10-02T00:00:00Z',
    },
    {
      id: 'tech-uuid-1',
      email: 'tech1@acm.local',
      fullName: 'Tran Ky Thuat Vien',
      role: 'TECHNICIAN',
      department: 'Hardware Lab',
      studentOrStaffId: 'TECH-001',
      isActive: false,
      isLocked: true,
      createdAt: '2026-10-03T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: currentAdminUser,
      token: 'mock-admin-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { success: true, data: mockUsersList },
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Table render
  it('TC-USERS-DOM-01: renders user table with correct headers, columns, and initial users', async () => {
    render(<UsersPage />);

    expect(screen.getByText('Quản trị người dùng')).toBeDefined();
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/users');
    });

    expect(screen.getByText('Primary Admin')).toBeDefined();
    expect(screen.getByText('admin1@acm.local')).toBeDefined();
    expect(screen.getByText('Secondary Admin')).toBeDefined();
    expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined();
    expect(screen.getByText('Tran Ky Thuat Vien')).toBeDefined();

    // Check table headers within table
    const table = screen.getByRole('table');
    expect(within(table).getByText('Người dùng')).toBeDefined();
    expect(within(table).getByText('Vai trò')).toBeDefined();
    expect(within(table).getByText('Mã/Đơn vị')).toBeDefined();
    expect(within(table).getByText('Trạng thái')).toBeDefined();
    expect(within(table).getByText('Thao tác')).toBeDefined();
  });

  // 2. Search filtering
  it('TC-USERS-DOM-02: filters user list dynamically by name, email, id, or department', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined());

    const searchInput = screen.getByPlaceholderText('Tên, email, mã số hoặc đơn vị');

    // Filter by name
    fireEvent.change(searchInput, { target: { value: 'Sinh Vien' } });
    expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined();
    expect(screen.queryByText('Primary Admin')).toBeNull();

    // Filter by department
    fireEvent.change(searchInput, { target: { value: 'Hardware Lab' } });
    expect(screen.getByText('Tran Ky Thuat Vien')).toBeDefined();
    expect(screen.queryByText('Nguyen Van Sinh Vien')).toBeNull();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Primary Admin')).toBeDefined();
    expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined();
  });

  // 3. Role filtering
  it('TC-USERS-DOM-03: filters user list by role selector', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined());

    const roleSelect = screen.getByRole('combobox');
    fireEvent.change(roleSelect, { target: { value: 'STUDENT' } });

    expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined();
    expect(screen.queryByText('Primary Admin')).toBeNull();
    expect(screen.queryByText('Tran Ky Thuat Vien')).toBeNull();
  });

  // 4. Open and close modal
  it('TC-USERS-DOM-04: opens and closes "Thêm người dùng" modal cleanly', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Primary Admin')).toBeDefined());

    const addButton = screen.getByRole('button', { name: 'Thêm người dùng' });
    fireEvent.click(addButton);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Thêm tài khoản')).toBeDefined();

    const closeButton = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeButton);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // 5. Submit Create User form
  it('TC-USERS-DOM-05: submits Create User form calling POST /users with proper payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'new-user-1' } },
    } as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Primary Admin')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Thêm người dùng' }));

    const dialog = screen.getByRole('dialog');
    const nameInput = dialog.querySelector('input[required]:not([type="email"]):not([type="password"])') as HTMLInputElement;
    const emailInput = dialog.querySelector('input[type="email"]') as HTMLInputElement;
    const pwdInput = dialog.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Le Thi Moi' } });
    fireEvent.change(emailInput, { target: { value: 'moi.le@acm.local' } });
    fireEvent.change(pwdInput, { target: { value: 'SecurePass@20261104' } });

    const submitBtn = screen.getByRole('button', { name: 'Tạo tài khoản' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users', expect.objectContaining({
        fullName: 'Le Thi Moi',
        email: 'moi.le@acm.local',
        password: 'SecurePass@20261104',
        role: 'STUDENT',
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Đã tạo tài khoản người dùng.')).toBeDefined();
    });
  });

  // 6. Open Edit User modal with pre-filled fields
  it('TC-USERS-DOM-06: opens Edit User modal with target user pre-filled attributes', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined());

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    // Click edit on student (third row)
    fireEvent.click(editButtons[2]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(within(dialog).getByText('Cập nhật tài khoản')).toBeDefined();
    expect(within(dialog).getByText('student1@acm.local')).toBeDefined();

    const nameInput = dialog.querySelector('input[value="Nguyen Van Sinh Vien"]') as HTMLInputElement;
    expect(nameInput).toBeDefined();
  });

  // 7. Submit Edit User form
  it('TC-USERS-DOM-07: submits Edit User form calling PUT /users/:id with updated fields', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'student-uuid-1' } },
    } as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined());

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    fireEvent.click(editButtons[2]);

    const dialog = screen.getByRole('dialog');
    const nameInput = dialog.querySelector('input[value="Nguyen Van Sinh Vien"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Nguyen Van Sinh Vien Updated' } });

    const saveBtn = screen.getByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/student-uuid-1',
        expect.objectContaining({
          fullName: 'Nguyen Van Sinh Vien Updated',
          role: 'STUDENT',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Đã cập nhật thông tin người dùng.')).toBeDefined();
    });
  });

  // 8. Status toggle modal
  it('TC-USERS-DOM-08: triggers status toggle modal and calls PATCH /users/:id/status', async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { success: true, data: { id: 'student-uuid-1', isActive: false } },
    } as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined());

    const deactButtons = screen.getAllByRole('button', { name: 'Vô hiệu hóa' });
    // Index 0: Primary Admin, Index 1: Secondary Admin, Index 2: Student
    fireEvent.click(deactButtons[2]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(within(dialog).getByText('Xác nhận trạng thái')).toBeDefined();
    expect(within(dialog).getByText(/Bạn có chắc muốn vô hiệu hóa tài khoản/)).toBeDefined();

    const confirmBtn = within(dialog).getByRole('button', { name: 'Xác nhận' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/users/student-uuid-1/status',
        { isActive: false }
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Đã cập nhật trạng thái tài khoản.')).toBeDefined();
    });
  });

  // 9. Reset password modal sends { password }
  it('TC-USERS-DOM-09: submits reset password sending contract { password } payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'student-uuid-1' } },
    } as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Van Sinh Vien')).toBeDefined());

    const resetButtons = screen.getAllByRole('button', { name: 'Đặt lại mật khẩu' });
    fireEvent.click(resetButtons[2]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(within(dialog).getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeDefined();

    const pwdInput = dialog.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(pwdInput, { target: { value: 'NewMasterPass@2026' } });

    const confirmBtn = within(dialog).getByRole('button', { name: 'Xác nhận đặt lại' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/users/student-uuid-1/reset-password',
        { password: 'NewMasterPass@2026' }
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Đã đặt lại mật khẩu\. Không hiển thị hoặc ghi log mật khẩu\./)).toBeDefined();
    });
  });

  // 10. Client guard prevents self-demotion
  it('TC-USERS-DOM-10: client-side guard prevents active admin from demoting themselves', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Primary Admin')).toBeDefined());

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    // First edit button is for Primary Admin (current user admin-uuid-1)
    fireEvent.click(editButtons[0]);

    const dialog = screen.getByRole('dialog');
    const roleSelect = dialog.querySelector('select') as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'STUDENT' } });

    const saveBtn = screen.getByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Không thể tự thay đổi vai trò của chính tài khoản đang đăng nhập.')).toBeDefined();
    });
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  // 11. Client guard prevents self-lockout/self-deactivation
  it('TC-USERS-DOM-11: client-side guard prevents active admin from locking or deactivating themselves', async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Primary Admin')).toBeDefined());

    const deactButtons = screen.getAllByRole('button', { name: 'Vô hiệu hóa' });
    // First deactivate button is for Primary Admin (admin-uuid-1)
    fireEvent.click(deactButtons[0]);

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Không thể tự khóa hoặc vô hiệu hóa chính tài khoản đang đăng nhập.')).toBeDefined();
    });
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  // 12. Client guard prevents demoting last operational admin
  it('TC-USERS-DOM-12: client-side guard prevents demoting the last operational ADMIN', async () => {
    // Only one operational ADMIN in directory
    const singleAdminList: PublicUser[] = [
      {
        id: 'admin-uuid-1',
        email: 'soleadmin@acm.local',
        fullName: 'Sole Admin',
        role: 'ADMIN',
        department: 'IT Dept',
        studentOrStaffId: 'STAFF-001',
        isActive: true,
        isLocked: false,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'tech-uuid-1',
        email: 'tech1@acm.local',
        fullName: 'Technician User',
        role: 'TECHNICIAN',
        department: 'Lab',
        studentOrStaffId: 'TECH-001',
        isActive: true,
        isLocked: false,
        createdAt: '2026-10-02T00:00:00Z',
      },
    ];

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: singleAdminList },
    } as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Sole Admin')).toBeDefined());

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    fireEvent.click(editButtons[0]);

    const dialog = screen.getByRole('dialog');
    const roleSelect = dialog.querySelector('select') as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'LAB_MANAGER' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      expect(
        screen.queryByText('Không thể tự thay đổi vai trò của chính tài khoản đang đăng nhập.') ||
        screen.queryByText('Không thể hạ quyền quản trị viên hoạt động cuối cùng của hệ thống.')
      ).not.toBeNull();
    });
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  // 13. Client allows managing another ADMIN when >= 2 operational ADMINs exist
  it('TC-USERS-DOM-13: client allows editing another ADMIN when multiple operational ADMINs exist', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'admin-uuid-2' } },
    } as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Secondary Admin')).toBeDefined());

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    // Edit Secondary Admin (second row)
    fireEvent.click(editButtons[1]);

    const dialog = screen.getByRole('dialog');
    const deptInput = dialog.querySelector('input[value="Lab Operations"]') as HTMLInputElement;
    fireEvent.change(deptInput, { target: { value: 'Data Center Ops' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/admin-uuid-2',
        expect.objectContaining({
          department: 'Data Center Ops',
          role: 'ADMIN',
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByText('Đã cập nhật thông tin người dùng.')).toBeDefined();
    });
  });

  // 14. Displays server error message on 400/403/409 and reloads user list
  it('TC-USERS-DOM-14: displays server error message on 400/403/409 and triggers user reload', async () => {
    vi.mocked(apiClient.put).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          success: false,
          message: 'Không thể hạ quyền quản trị viên hoạt động cuối cùng của hệ thống',
        },
      },
    });

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Secondary Admin')).toBeDefined());

    const editButtons = screen.getAllByRole('button', { name: 'Sửa' });
    fireEvent.click(editButtons[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      expect(
        screen.getByText('Không thể hạ quyền quản trị viên hoạt động cuối cùng của hệ thống')
      ).toBeDefined();
    });

    // Verify loadUsers was invoked on error recovery
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  // 15. Prevents duplicate submission while busy
  it('TC-USERS-DOM-15: disables action buttons and shows busy state during ongoing mutation', async () => {
    let resolvePost: any;
    const pendingPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    vi.mocked(apiClient.post).mockReturnValueOnce(pendingPromise as any);

    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Primary Admin')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Thêm người dùng' }));

    const dialog = screen.getByRole('dialog');
    const nameInput = dialog.querySelector('input[required]:not([type="email"]):not([type="password"])') as HTMLInputElement;
    const emailInput = dialog.querySelector('input[type="email"]') as HTMLInputElement;
    const pwdInput = dialog.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Tran Van A' } });
    fireEvent.change(emailInput, { target: { value: 'a.tran@acm.local' } });
    fireEvent.change(pwdInput, { target: { value: 'Password@20261104' } });

    const submitBtn = screen.getByRole('button', { name: 'Tạo tài khoản' }) as HTMLButtonElement;
    fireEvent.click(submitBtn);

    // In-flight state: button disabled and text updated
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe('Đang xử lý...');

    // Resolve in-flight request
    resolvePost({ data: { success: true, data: { id: 'new-id' } } });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // 16. Rejects non-ADMIN user with role alert
  it('TC-USERS-DOM-16: renders alert and denies access when current user is not ADMIN', () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: {
        id: 'student-uuid-1',
        email: 'student@acm.local',
        fullName: 'Student User',
        role: 'STUDENT' as any,
      },
      token: 'student-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    render(<UsersPage />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(
      screen.getByText('Chỉ ADMIN được sử dụng giao diện quản lý người dùng.')
    ).toBeDefined();
    expect(screen.queryByText('Thêm người dùng')).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  // 17. Never exposes passwordHash or JWT token in DOM
  it('TC-USERS-DOM-17: never exposes passwordHash or JWT token anywhere in DOM', async () => {
    const rawUsersWithSensitiveData: any[] = [
      {
        ...mockUsersList[0],
        passwordHash: '$2a$12$superSecretHashThatMustNeverAppearInTheDOM1234567890',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitivePayload',
      },
    ];

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: rawUsersWithSensitiveData },
    } as any);

    const { container } = render(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Primary Admin')).toBeDefined());

    expect(container.innerHTML).not.toContain('$2a$12$');
    expect(container.innerHTML).not.toContain('superSecretHash');
    expect(container.innerHTML).not.toContain('eyJhbGciOiJIUzI1Ni');
  });
});
