// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CameraReturnModal } from './CameraReturnModal';
import * as visionService from '../../services/vision.service';

describe('CameraReturnModal Test Suite (SUP-VISION-01, 02, 04, 05, 06, 08)', () => {
  const mockBorrowRecord = {
    id: 'borrow-req-uuid-001',
    requestNumber: 'BR-20261105-001',
    borrowerName: 'Nguyen Van A',
    details: [
      {
        id: 'detail-uuid-servo',
        itemId: 'item-uuid-servo',
        item: { id: 'item-uuid-servo', code: 'SERVO-SG90', name: 'Servo Motor SG90', unit: 'Cái' },
        quantity: 5,
        returnedQuantity: 2, // remaining = 3
      },
      {
        id: 'detail-uuid-dht22',
        itemId: 'item-uuid-dht22',
        item: { id: 'item-uuid-dht22', code: 'DHT22-AM2302', name: 'Cảm biến DHT22', unit: 'Cái' },
        quantity: 4,
        returnedQuantity: 4, // remaining = 0 (fully returned)
      },
      {
        id: 'detail-uuid-uno',
        itemId: 'item-uuid-uno',
        item: { id: 'item-uuid-uno', code: 'ARD-UNO-R3', name: 'Arduino Uno R3', unit: 'Cái' },
        quantity: 2,
        returnedQuantity: 0, // remaining = 2
      },
    ],
  };

  let mockTracks: any[];
  let mockStream: any;

  beforeEach(() => {
    mockTracks = [{ stop: vi.fn() }];
    mockStream = {
      getTracks: () => mockTracks,
    };

    // Mock HTMLMediaElement.play
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    // Mock FileReader for JSDOM
    class MockFileReader {
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,mock_data' } });
        }, 10);
      }
    }
    (window as any).FileReader = MockFileReader;

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

  // SUP-VISION-01: Camera permission granted / denied
  it('SUP-VISION-01: handles camera permission granted and sets up active stream', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Camera đã sẵn sàng/i)).toBeTruthy();
    });
  });

  it('SUP-VISION-01: displays fallback and upload button when camera permission is denied', async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
      new Error('Permission denied by user')
    );

    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Camera chưa được kích hoạt/i)).toBeTruthy();
      expect(screen.getAllByText(/Tải ảnh linh kiện/i).length).toBeGreaterThan(0);
    });
  });

  // SUP-VISION-02: Live preview and canvas capture
  it('SUP-VISION-02: renders video element with controls and start/stop recognition toggle', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Bắt đầu nhận diện/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Đổi Camera/i })).toBeTruthy();
    });

    // Toggle recognition
    const startBtn = screen.getByRole('button', { name: /Bắt đầu nhận diện/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Dừng nhận diện/i })).toBeTruthy();
    });
  });

  // SUP-VISION-04: Unknown/low-confidence class -> manual fallback
  it('SUP-VISION-04: supports manual fallback selection when component is not detected by AI', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    // Initial staged items is empty
    expect(screen.getByText(/Chưa có linh kiện nào được nhận diện/i)).toBeTruthy();

    // Select Arduino Uno R3 manually from dropdown
    const select = document.getElementById('manual-item-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: 'detail-uuid-uno' } });

    await waitFor(() => {
      expect(screen.getAllByText(/Arduino Uno R3/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Mã: ARD-UNO-R3/i)).toBeTruthy();
    });
  });

  // SUP-VISION-05: Mapping detected class to BorrowDetails Item ID
  it('SUP-VISION-05: automatically maps recognized YOLO class to matching BorrowDetail', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_test_001',
      inferenceTimeMs: 45.2,
      detectionsCount: 1,
      detections: [
        {
          classId: 59,
          className: 'Servo',
          confidence: 0.92,
          boundingBox: { x1: 50, y1: 50, x2: 200, y2: 200 },
          suggestedItemCode: 'SERVO-SG90',
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

    // Trigger upload via input[type="file"]
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(['fake-image-bytes'], 'servo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(
      () => {
        expect(screen.getAllByText(/Servo Motor SG90/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/AI: Servo \(92%\)/i)).toBeTruthy();
      },
      { timeout: 2500 }
    );
  });

  // SUP-VISION-06: returnedQuantity cannot exceed outstandingQuantity
  it('SUP-VISION-06: clamps returnedQuantity to remaining outstanding quantity', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    // Manually add Servo (remaining = 3)
    const select = document.getElementById('manual-item-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'detail-uuid-servo' } });

    await waitFor(() => {
      expect(screen.getAllByText(/Servo Motor SG90/i).length).toBeGreaterThan(0);
    });

    // Try setting quantity to 10 (> remaining 3)
    const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '10' } });

    // Must be clamped to remaining (3)
    expect(qtyInput.value).toBe('3');

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: /Áp dụng vào Phiếu Hoàn trả/i });
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith(
      {
        'detail-uuid-servo': {
          quantity: '3',
          condition: 'GOOD',
        },
      },
      undefined
    );
    expect(handleClose).toHaveBeenCalled();
  });

  // SUP-VISION-08: Camera stop and track teardown on close
  it('SUP-VISION-08: cleans up camera tracks when modal is closed', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    const { unmount } = render(
      <CameraReturnModal
        isOpen={true}
        onClose={handleClose}
        borrowRecord={mockBorrowRecord}
        onApplyReturnRows={handleApply}
      />
    );

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    unmount();

    // Verify track.stop was called to free hardware camera resources
    expect(mockTracks[0].stop).toHaveBeenCalled();
  });
});
