// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { apiClient } from '../services/api';

vi.mock('../services/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('SettingsPage (System & Lab Info Truthfulness)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders system info header and read-only description', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { service: 'ACM API Gateway', status: 'ok', database: 'connected' },
    });

    render(<SettingsPage />);

    expect(
      screen.getByText(/Thông tin Hệ thống & Phòng Lab/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/Tra cứu trạng thái hạ tầng dịch vụ/i)
    ).toBeTruthy();
  });

  it('renders live API health status from backend endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { service: 'ACM API Gateway', status: 'ok', database: 'connected' },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/HOẠT ĐỘNG \(HEALTHY\)/i)).toBeTruthy();
      expect(screen.getByText(/ACM API Gateway/i)).toBeTruthy();
      expect(screen.getByText(/Đã kết nối \(Healthy\)/i)).toBeTruthy();
    });
  });

  it('renders standard lab operational parameters in read-only mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { service: 'ACM API Gateway', status: 'ok', database: 'connected' },
    });

    render(<SettingsPage />);

    expect(screen.getByText(/Read-Only Reference/i)).toBeTruthy();
    expect(screen.getByText(/WH-UAT-MAIN \(Kho Nghiệm thu UAT\)/i)).toBeTruthy();
    expect(screen.getByText(/14 ngày \(2 tuần, gia hạn tối đa 1 lần\)/i)).toBeTruthy();
    expect(
      screen.getByText(/Khóa duyệt tự động khi tồn khả dụng/i)
    ).toBeTruthy();
  });

  it('does NOT render fake "Lưu cấu hình" button or DemoDataNotice banner', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { service: 'ACM API Gateway', status: 'ok', database: 'connected' },
    });

    render(<SettingsPage />);

    expect(screen.queryByText(/Lưu cấu hình/i)).toBeNull();
    expect(screen.queryByText(/DemoDataNotice/i)).toBeNull();
    expect(screen.queryByText(/Chế độ Demo/i)).toBeNull();
  });
});
