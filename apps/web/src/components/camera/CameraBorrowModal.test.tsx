// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CameraBorrowModal } from './CameraBorrowModal';
import * as visionService from '../../services/vision.service';

describe('CameraBorrowModal Test Suite (Real-Time Camera & Anti-Fraud)', () => {
  const mockCatalogItems = [
    { id: 'item-main-02', code: 'MAIN-02', name: 'Main 2', unit: 'Cái', totalAvailable: 5 },
    { id: 'item-sw-02', code: 'SW-MAIN-02', name: 'Switch main 2', unit: 'Cái', totalAvailable: 3 },
    { id: 'item-sen-ir', code: 'SEN-IR', name: 'IR sensor', unit: 'Cái', totalAvailable: 10 },
    { id: 'item-servo', code: 'SERVO-SG90', name: 'Servo Motor', unit: 'Cái', totalAvailable: 8 },
  ];

  let mockTracks: any[];
  let mockStream: any;

  beforeEach(() => {
    mockTracks = [{ stop: vi.fn() }];
    mockStream = {
      getTracks: () => mockTracks,
    };

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(global.navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    vi.spyOn(visionService, 'checkVisionHealth').mockResolvedValue({
      status: 'ok',
      service: 'acm-camera-return-vision-inference',
      modelVersion: 'yolo11n-acm-85',
      modelHash: 'c9b1f5d528a2f75ce3766f06fe6b502ecd3e04f1095c8932cc0ba9b00b7448d3',
      classesCount: 85,
      device: 'cpu',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders modal with title and live anti-fraud badge', async () => {
    render(
      <CameraBorrowModal
        isOpen={true}
        onClose={vi.fn()}
        catalogItems={mockCatalogItems}
        onApplyBorrowItems={vi.fn()}
      />
    );

    expect(screen.getByText(/Quét Camera AI nhận diện linh kiện mượn/i)).toBeTruthy();
    expect(screen.getByText(/Live Anti-Fraud/i)).toBeTruthy();
  });

  it('strictly rejects photos from yesterday or older', async () => {
    render(
      <CameraBorrowModal
        isOpen={true}
        onClose={vi.fn()}
        catalogItems={mockCatalogItems}
        onApplyBorrowItems={vi.fn()}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Create an old file from yesterday
    const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const oldFile = new File(['fake-content'], 'yesterday_component.jpg', {
      type: 'image/jpeg',
      lastModified: yesterday.getTime(),
    });

    fireEvent.change(input, { target: { files: [oldFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(/TỪ CHỐI ẢNH CŨ: Hệ thống không chấp nhận ảnh của ngày hôm qua/i)
      ).toBeTruthy();
    });
  });

  it('matches detected components, adds to staged list, and applies to borrow form', async () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      inferenceTimeMs: 42,
      detections: [
        {
          classId: 53,
          className: 'Main_2',
          confidence: 0.95,
          boundingBox: { x1: 10, y1: 10, x2: 100, y2: 100 },
          suggestedItemCode: 'MAIN-02',
        },
        {
          classId: 43,
          className: 'IR_sensor',
          confidence: 0.88,
          boundingBox: { x1: 110, y1: 10, x2: 200, y2: 100 },
          suggestedItemCode: 'SEN-IR',
        },
      ],
    });

    // Mock FileReader for JSDOM
    class MockFileReader {
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,fresh_mock' } });
        }, 10);
      }
    }
    (window as any).FileReader = MockFileReader;

    render(
      <CameraBorrowModal
        isOpen={true}
        onClose={handleClose}
        catalogItems={mockCatalogItems}
        onApplyBorrowItems={handleApply}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Fresh file from today
    const freshFile = new File(['fresh-content'], 'today_component.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    fireEvent.change(input, { target: { files: [freshFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Nhận diện ảnh thành công: Phát hiện 2 linh kiện/i)).toBeTruthy();
    });

    // Check that Main 2 and IR sensor are listed in staged items
    expect(screen.getByText(/\[MAIN-02\] Main 2/i)).toBeTruthy();
    expect(screen.getByText(/\[SEN-IR\] IR sensor/i)).toBeTruthy();

    // Click Apply
    const applyBtn = screen.getByText(/Áp dụng vào phiếu mượn/i);
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'item-main-02', quantity: 1 }),
        expect.objectContaining({ itemId: 'item-sen-ir', quantity: 1 }),
      ]),
      expect.objectContaining({ dataUrl: expect.stringContaining('data:image') })
    );
  });
});
