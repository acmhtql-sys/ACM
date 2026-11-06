// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CategoriesPage } from './CategoriesPage';
import { apiClient } from '../services/api';
import * as authHook from '../hooks/useAuth';

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockCategories = [
  {
    id: 'cat-1',
    code: 'CAT-MCU',
    name: 'Vi điều khiển & Bo mạch nhúng',
    description: 'Các loại bo mạch MCU',
    parentId: null,
    parent: null,
    _count: { items: 2, children: 0 },
  },
  {
    id: 'cat-2',
    code: 'CAT-SENSOR',
    name: 'Cảm biến & Đo lường',
    description: 'Cảm biến nhiệt, siêu âm',
    parentId: null,
    parent: null,
    _count: { items: 1, children: 0 },
  },
  {
    id: 'cat-3',
    code: 'CAT-EMPTY',
    name: 'Danh mục Trống Kiểm thử',
    description: 'Danh mục không chứa linh kiện',
    parentId: null,
    parent: null,
    _count: { items: 0, children: 0 },
  },
];

describe('CategoriesPage DOM & RBAC Test Suite (P0 Categories CRUD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('TC-CAT-FE-01: renders categories list with codes, names, and counts', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'admin@acm.vn', fullName: 'Admin', role: 'ADMIN' },
      token: 'valid-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories },
    });

    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-MCU')).toBeTruthy();
      expect(screen.getByText('Vi điều khiển & Bo mạch nhúng')).toBeTruthy();
      expect(screen.getByText('2 linh kiện')).toBeTruthy();
      expect(screen.getByText('CAT-SENSOR')).toBeTruthy();
      expect(screen.getByText('1 linh kiện')).toBeTruthy();
      expect(screen.getByText('CAT-EMPTY')).toBeTruthy();
      expect(screen.getByText('0 linh kiện')).toBeTruthy();
    });
  });

  it('TC-CAT-FE-02: RBAC controls - Technician and Student have read-only view without write buttons', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u2', email: 'tech@acm.vn', fullName: 'Technician', role: 'TECHNICIAN' },
      token: 'valid-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories },
    });

    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-MCU')).toBeTruthy();
    });

    // Check that "Tạo danh mục mới" button is NOT rendered
    expect(screen.queryByText('Tạo danh mục mới')).toBeNull();
    // Check that read-only banner is displayed
    expect(screen.getByText(/Chế độ Xem \(Chỉ Admin \/ Lab Manager có quyền sửa\)/i)).toBeTruthy();
    // Check that Edit/Delete buttons are NOT rendered
    expect(screen.queryByTitle('Chỉnh sửa danh mục')).toBeNull();
    expect(screen.queryByTitle('Xóa danh mục')).toBeNull();
  });

  it('TC-CAT-FE-03: opens CategoryModal on create and submits POST /categories', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'admin@acm.vn', fullName: 'Admin', role: 'ADMIN' },
      token: 'valid-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories },
    });

    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('Tạo danh mục mới')).toBeTruthy();
    });

    // Click "Tạo danh mục mới"
    fireEvent.click(screen.getByText('Tạo danh mục mới'));

    // Modal opens
    expect(screen.getByText('Tạo Danh mục Linh kiện Mới')).toBeTruthy();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('VD: CAT-DEV-KIT'), {
      target: { value: 'CAT-IOT' },
    });
    fireEvent.change(screen.getByPlaceholderText('VD: Bo mạch vi điều khiển & Phát triển'), {
      target: { value: 'Internet of Things' },
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'cat-new', code: 'CAT-IOT', name: 'Internet of Things' } },
    });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: [...mockCategories, { id: 'cat-new', code: 'CAT-IOT', name: 'Internet of Things' }],
      },
    });

    // Click submit
    fireEvent.click(screen.getByText('Tạo danh mục'));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/categories', {
        code: 'CAT-IOT',
        name: 'Internet of Things',
        description: null,
        parentId: null,
      });
    });
  });

  it('TC-CAT-FE-04: Guarded Delete - blocks deletion when category has items', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'admin@acm.vn', fullName: 'Admin', role: 'ADMIN' },
      token: 'valid-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories },
    });

    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-MCU')).toBeTruthy();
    });

    const deleteButtons = screen.getAllByTitle('Xóa danh mục');
    // First button belongs to CAT-MCU which has 2 items
    fireEvent.click(deleteButtons[0]);

    // Should display warning banner explaining cannot delete
    expect(screen.getByText(/Không thể xóa danh mục 'Vi điều khiển & Bo mạch nhúng' vì đang có 2 linh kiện trực thuộc/i)).toBeTruthy();
    // Confirm delete modal should NOT open
    expect(screen.queryByText('Xác nhận Xóa')).toBeNull();
  });

  it('TC-CAT-FE-05: Guarded Delete - allows deletion when category has 0 items and 0 children', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'admin@acm.vn', fullName: 'Admin', role: 'ADMIN' },
      token: 'valid-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories },
    });

    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-EMPTY')).toBeTruthy();
    });

    const deleteButtons = screen.getAllByTitle('Xóa danh mục');
    // Third button belongs to CAT-EMPTY which has 0 items and 0 children
    fireEvent.click(deleteButtons[2]);

    // Confirmation modal should open
    expect(screen.getByText('Xác nhận Xóa Danh mục')).toBeTruthy();
    expect(screen.getByText(/CAT-EMPTY - Danh mục Trống Kiểm thử/i)).toBeTruthy();

    vi.mocked(apiClient.delete).mockResolvedValueOnce({
      data: { success: true, data: { id: 'cat-3', deleted: true } },
    });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories.slice(0, 2) },
    });

    // Click confirm delete
    fireEvent.click(screen.getByText('Xác nhận Xóa'));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/categories/cat-3');
    });
  });

  it('TC-CAT-FE-06: verifies DemoDataNotice is removed from CategoriesPage', async () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'admin@acm.vn', fullName: 'Admin', role: 'ADMIN' },
      token: 'valid-token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockCategories },
    });

    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-MCU')).toBeTruthy();
    });

    expect(screen.queryByText(/DemoDataNotice/i)).toBeNull();
    expect(screen.queryByText(/Chế độ Demo/i)).toBeNull();
  });
});
