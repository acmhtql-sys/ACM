// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CameraReturnModal, type CatalogItem, type BorrowRecord } from './CameraReturnModal';
import * as visionService from '../../services/vision.service';
import { apiClient } from '../../services/api';

describe('CameraReturnModal AI Mapping Safety Suite (GATE-3-AI-SAFETY)', () => {
  const mockBorrowRecord: BorrowRecord = {
    id: 'borrow-req-safety-001',
    requestNumber: 'BR-SAFETY-20261106',
    borrowerName: 'Tran Van Safety',
    details: [
      {
        id: 'detail-esp32',
        itemId: 'item-uuid-esp32',
        item: { id: 'item-uuid-esp32', code: 'ESP32-WROOM-32', name: 'Kit WiFi ESP32 WROOM-32', unit: 'Cái' },
        quantity: 5,
        returnedQuantity: 2, // remaining = 3
      },
      {
        id: 'detail-arduino',
        itemId: 'item-uuid-uno',
        item: { id: 'item-uuid-uno', code: 'ARD-UNO-R3', name: 'Arduino Uno R3', unit: 'Cái' },
        quantity: 2,
        returnedQuantity: 2, // remaining = 0 (already fully returned)
      },
    ],
  };

  const mockActiveCatalog: CatalogItem[] = [
    { id: 'item-uuid-esp32', code: 'ESP32-WROOM-32', name: 'Kit WiFi ESP32 WROOM-32', unit: 'Cái', isActive: true },
    { id: 'item-uuid-uno', code: 'ARD-UNO-R3', name: 'Arduino Uno R3', unit: 'Cái', isActive: true },
    { id: 'item-uuid-resistor', code: 'RES-10K-025W', name: 'Điện trở 10k 1/4W', unit: 'Con', isActive: true },
    { id: 'item-uuid-obsolete', code: 'OBSOLETE-IC-8051', name: 'Vi điều khiển 8051 cũ', unit: 'Con', isActive: false },
  ];

  let mockTracks: any[];
  let mockStream: any;

  beforeEach(() => {
    mockTracks = [{ stop: vi.fn() }];
    mockStream = {
      getTracks: () => mockTracks,
    };

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    vi.spyOn(visionService, 'checkVisionHealth').mockResolvedValue({ status: 'ok', service: 'acm-camera-return-service', modelVersion: '1.0.0', modelHash: 'c9b1f5d5', classesCount: 64, device: 'cpu' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TC-AI-SAFETY-01: Sai mã / Mã không tồn tại trong danh mục -> UNMAPPED, không tự staged
  it('TC-AI-SAFETY-01 [Mã không tồn tại trong catalog]: marks UNMAPPED, displays clear notice, and does NOT auto-stage', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_01',
      inferenceTimeMs: 25.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 99,
          className: 'Ghost_Sensor',
          confidence: 0.89,
          boundingBox: { x1: 50, y1: 50, x2: 150, y2: 150 },
          suggestedItemCode: 'UNKNOWN-PART-999', // Non-existent in catalog
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'ghost.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Must NOT be staged into return list
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      expect(screen.getAllByText(/1 chưa ánh xạ/i).length).toBeGreaterThan(0);
    });

    // Check detail status in tab
    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getAllByText(/Chưa ánh xạ/i).length).toBeGreaterThan(0);
      expect(
        screen.getByText(/Mã 'UNKNOWN-PART-999' không tồn tại trong danh mục linh kiện hoạt động/i)
      ).toBeTruthy();
    });
  });

  // TC-AI-SAFETY-02: Mã có trong catalog nhưng bị Inactive -> UNMAPPED
  it('TC-AI-SAFETY-02 [Mã không còn hoạt động (inactive)]: treats as UNMAPPED and prevents auto-staging', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_02',
      inferenceTimeMs: 28.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 101,
          className: 'Microcontroller_8051',
          confidence: 0.92,
          boundingBox: { x1: 60, y1: 60, x2: 160, y2: 160 },
          suggestedItemCode: 'OBSOLETE-IC-8051', // Inactive part
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], '8051.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      expect(screen.getAllByText(/1 chưa ánh xạ/i).length).toBeGreaterThan(0);
    });

    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(
        screen.getByText(/Mã 'OBSOLETE-IC-8051' không tồn tại trong danh mục linh kiện hoạt động/i)
      ).toBeTruthy();
    });
  });

  // TC-AI-SAFETY-03: Catalog API sập / không khả dụng -> CATALOG_UNVERIFIED, fail-safe
  it('TC-AI-SAFETY-03 [Catalog API sập]: fails safe to CATALOG_UNVERIFIED and blocks auto-staging', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    // Mock API failure for /items
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('500 Internal Server Error: Database down'));

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_03',
      inferenceTimeMs: 31.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 44,
          className: 'Resistor_10K',
          confidence: 0.88,
          boundingBox: { x1: 30, y1: 30, x2: 130, y2: 130 },
          suggestedItemCode: 'RES-10K-025W',
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        // catalogItems omitted so it attempts API lookup
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'resistor.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Must NOT be staged
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      // Should show unverified badge/count
      expect(screen.getAllByText(/1 chưa xác minh/i).length).toBeGreaterThan(0);
    });

    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/Chưa xác minh DM/i)).toBeTruthy();
      expect(
        screen.getByText(/Chưa thể xác minh danh mục|Đang đồng bộ danh mục/i)
      ).toBeTruthy();
    });
  });

  // TC-AI-SAFETY-04: Mã hợp lệ trong catalog nhưng không thuộc phiếu mượn -> MATCHED_CATALOG_ONLY
  it('TC-AI-SAFETY-04 [Mã hợp lệ catalog nhưng không thuộc phiếu mượn]: flags MATCHED_CATALOG_ONLY and does NOT auto-stage', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_04',
      inferenceTimeMs: 35.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 44,
          className: 'Resistor_10k',
          confidence: 0.95,
          boundingBox: { x1: 40, y1: 40, x2: 140, y2: 140 },
          suggestedItemCode: 'RES-10K-025W', // Valid in catalog, NOT in borrow slip
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'res.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      expect(screen.getAllByText(/1 khớp DM/i).length).toBeGreaterThan(0);
    });

    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/Khớp DM khác/i)).toBeTruthy();
      expect(
        screen.getByText(/Khớp danh mục ACM: RES-10K-025W - Điện trở 10k 1\/4W \(Không thuộc phiếu mượn này\)/i)
      ).toBeTruthy();
    });
  });

  // TC-AI-SAFETY-05: Mã hợp lệ khớp phiếu mượn -> MATCHED_BORROW và auto-staged
  it('TC-AI-SAFETY-05 [Mã hợp lệ khớp phiếu mượn]: stages item and clamps quantity correctly', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_05',
      inferenceTimeMs: 22.0,
      detectionsCount: 2,
      detections: [
        {
          classId: 50,
          className: 'ESP32',
          confidence: 0.96,
          boundingBox: { x1: 10, y1: 10, x2: 100, y2: 100 },
          suggestedItemCode: 'ESP32-WROOM-32',
        },
        {
          classId: 50,
          className: 'ESP32',
          confidence: 0.94,
          boundingBox: { x1: 110, y1: 10, x2: 200, y2: 100 },
          suggestedItemCode: 'ESP32-WROOM-32',
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'esp32_pair.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Linh kiện hoàn trả \(1\)/i)).toBeTruthy();
      expect(screen.getAllByText(/Kit WiFi ESP32 WROOM-32/i).length).toBeGreaterThan(0);
      const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(qtyInput.value).toBe('2'); // 2 detected <= remaining 3
    });
  });

  // TC-AI-SAFETY-06: Khớp mờ theo tên (fuzzy name) KHÔNG được làm chứng cứ duy nhất để tự staged
  it('TC-AI-SAFETY-06 [Fuzzy name alone rejected]: does not auto-stage when suggestedItemCode is absent or incorrect despite partial name match', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_06',
      inferenceTimeMs: 33.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 55,
          className: 'Arduino', // partial text match with "Arduino Uno R3"
          confidence: 0.85,
          boundingBox: { x1: 20, y1: 20, x2: 120, y2: 120 },
          suggestedItemCode: null, // No verified catalog code!
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'arduino_fuzzy.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Must NOT be auto-staged based on name alone!
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      expect(screen.getAllByText(/1 chưa ánh xạ/i).length).toBeGreaterThan(0);
    });
  });

  // TC-AI-SAFETY-07: Clamping số lượng khi AI phát hiện nhiều hơn số lượng còn thiếu
  it('TC-AI-SAFETY-07 [Quantity clamping to remaining]: clamps staged quantity to remaining unreturned items', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    // Remaining for ESP32 is 3 (5 borrowed - 2 returned). AI detects 8 ESP32s.
    const eightEspDetections: visionService.VisionDetection[] = Array.from({ length: 8 }, (_, i) => ({
      classId: 50,
      className: 'ESP32',
      confidence: 0.92,
      boundingBox: { x1: 10 + i * 20, y1: 10, x2: 25 + i * 20, y2: 80 },
      suggestedItemCode: 'ESP32-WROOM-32',
    }));

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_safety_07',
      inferenceTimeMs: 45.0,
      detectionsCount: 8,
      detections: eightEspDetections,
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'eight_esp32.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Linh kiện hoàn trả \(1\)/i)).toBeTruthy();
      const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(qtyInput.value).toBe('3'); // Clamped to remaining 3, not 8!
      expect(
        screen.getByText(/Phát hiện 8 cái \(Giới hạn trả 3\)/i)
      ).toBeTruthy();
    });
  });
  // TC-AI-SAFETY-08: Catalog đa trang (Pagination) -> Tải đầy đủ trang 1 và trang 2 để khớp mã
  it('TC-AI-SAFETY-08 [Pagination support]: accumulates items across multiple pages and matches item from page 2', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    // Mock page 1 and page 2
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('page=1')) {
        return {
          data: {
            success: true,
            data: [
              { id: 'item-page1', code: 'PAGE1-ITEM', name: 'Linh kiện Trang 1', isActive: true },
            ],
            meta: { page: 1, limit: 100, totalItems: 2, totalPages: 2 },
          },
        };
      }
      if (url.includes('page=2')) {
        return {
          data: {
            success: true,
            data: [
              { id: 'item-page2', code: 'PAGE2-ITEM', name: 'Linh kiện Trang 2', isActive: true },
            ],
            meta: { page: 2, limit: 100, totalItems: 2, totalPages: 2 },
          },
        };
      }
      return { data: { success: false } };
    });

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_page2_01',
      inferenceTimeMs: 20.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 77,
          className: 'Page2_Sensor',
          confidence: 0.9,
          boundingBox: { x1: 10, y1: 10, x2: 90, y2: 90 },
          suggestedItemCode: 'PAGE2-ITEM',
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'page2.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Must identify as MATCHED_CATALOG_ONLY from page 2!
      expect(screen.getAllByText(/1 khớp DM/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
    });

    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/Khớp DM khác/i)).toBeTruthy();
      expect(screen.getByText(/PAGE2-ITEM - Linh kiện Trang 2/i)).toBeTruthy();
    });
  });

  // TC-AI-SAFETY-09: Phân trang không tải đủ (Incomplete pagination) -> Fail-safe sang CATALOG_UNVERIFIED
  it('TC-AI-SAFETY-09 [Incomplete pagination fail-safe]: fails safe to CATALOG_UNVERIFIED if subsequent page fails to load', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    // Mock page 1 success (totalPages: 2), page 2 failure
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('page=1')) {
        return {
          data: {
            success: true,
            data: [
              { id: 'item-page1', code: 'PAGE1-ITEM', name: 'Linh kiện Trang 1', isActive: true },
            ],
            meta: { page: 1, limit: 100, totalItems: 200, totalPages: 2 },
          },
        };
      }
      throw new Error('500 Error loading page 2');
    });

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_incomplete_01',
      inferenceTimeMs: 25.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 88,
          className: 'Missing_Sensor',
          confidence: 0.9,
          boundingBox: { x1: 10, y1: 10, x2: 90, y2: 90 },
          suggestedItemCode: 'UNFETCHED-CODE-XYZ',
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'missing.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Must NOT be staged
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      // Must fail-safe to CATALOG_UNVERIFIED because catalog was not completely loaded
      expect(screen.getAllByText(/1 chưa xác minh/i).length).toBeGreaterThan(0);
    });

    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/Chưa xác minh DM/i)).toBeTruthy();
      expect(screen.getByText(/Danh mục linh kiện chưa tải đủ/i)).toBeTruthy();
    });
  });

  // TC-AI-SAFETY-10: Timeout mạng khi tra cứu Catalog -> Fail-safe sang CATALOG_UNVERIFIED
  it('TC-AI-SAFETY-10 [Network Timeout fail-safe]: fails safe to CATALOG_UNVERIFIED when catalog lookup times out', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    const timeoutErr = new Error('timeout of 5000ms exceeded');
    (timeoutErr as any).code = 'ECONNABORTED';
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(timeoutErr);

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_timeout_01',
      inferenceTimeMs: 22.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 50,
          className: 'ESP32_Timeout',
          confidence: 0.93,
          boundingBox: { x1: 15, y1: 15, x2: 85, y2: 85 },
          suggestedItemCode: 'ESP32-UNKNOWN',
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'timeout.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      expect(screen.getAllByText(/1 chưa xác minh/i).length).toBeGreaterThan(0);
    });
  });

  // TC-AI-SAFETY-11: Tuyệt đối không tự động ghi giao dịch kho hoặc trả hàng
  it('TC-AI-SAFETY-11 [No automatic mutation]: does not call apply callback until operator explicitly clicks button', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_auto_safe_01',
      inferenceTimeMs: 18.0,
      detectionsCount: 1,
      detections: [
        {
          classId: 50,
          className: 'ESP32',
          confidence: 0.95,
          boundingBox: { x1: 10, y1: 10, x2: 90, y2: 90 },
          suggestedItemCode: 'ESP32-WROOM-32',
        },
      ],
    });

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
        catalogItems={mockActiveCatalog}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'esp.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Linh kiện hoàn trả \(1\)/i)).toBeTruthy();
    });

    // Verify handleApply has NOT been called automatically
    expect(handleApply).not.toHaveBeenCalled();

    // Only when operator clicks "Xác nhận hoàn trả"
    const applyButton = screen.getByRole('button', { name: /Xác nhận hoàn trả/i });
    fireEvent.click(applyButton);

    expect(handleApply).toHaveBeenCalledTimes(1);
  });
});
