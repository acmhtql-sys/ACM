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

  // =========================================================================
  // ENHANCED AI CAMERA DETECTION TEST SUITE (5 Target Scenarios)
  // =========================================================================

  // Scenario 1: Nhận diện đúng (Correct Detection)
  it('SCENARIO-01 [Nhận diện đúng]: displays matched class, confidence, bounding box and auto-stages item', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_correct_01',
      inferenceTimeMs: 38.5,
      detectionsCount: 1,
      detections: [
        {
          classId: 59,
          className: 'Servo',
          confidence: 0.94,
          boundingBox: { x1: 100, y1: 120, x2: 300, y2: 320 },
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

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-bytes'], 'servo_correct.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Summary banner shows 1 matched
      expect(screen.getAllByText(/1 khớp phiếu/i).length).toBeGreaterThan(0);
      // Auto-staged item in return list
      expect(screen.getAllByText(/Servo Motor SG90/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/AI: Servo \(94%\)/i)).toBeTruthy();
    });

    // Switch to Detections tab to verify details
    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/BBox: \[100, 120\] - \[300, 320\]/i)).toBeTruthy();
      expect(screen.getByText(/Khớp phiếu mượn: Servo Motor SG90/i)).toBeTruthy();
      expect(screen.getByText(/Đã thêm vào danh sách hoàn trả/i)).toBeTruthy();
    });
  });

  // Scenario 2: Nhận diện sai / Không thuộc phiếu mượn (Catalog match but NOT in this borrow request)
  it('SCENARIO-02 [Nhận diện sai/Không thuộc phiếu]: identifies catalog item but does NOT auto-stage when item is not in borrow request', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_unrelated_01',
      inferenceTimeMs: 41.2,
      detectionsCount: 1,
      detections: [
        {
          classId: 63,
          className: 'LED_lamp',
          confidence: 0.88,
          boundingBox: { x1: 50, y1: 50, x2: 120, y2: 150 },
          suggestedItemCode: 'LED-5MM-RGB', // Valid catalog item, but NOT in mockBorrowRecord!
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
    const file = new File(['fake-bytes'], 'led.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Summary bar indicates 1 catalog match, 0 borrow match
      expect(screen.getAllByText(/1 khớp DM/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/0 khớp phiếu/i).length).toBeGreaterThan(0);
      // Does NOT auto-stage: list of return items remains empty
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
      expect(screen.getByText(/Chưa có linh kiện nào được nhận diện hoặc chọn hoàn trả/i)).toBeTruthy();
    });

    // Check Detections tab
    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/Khớp DM khác/i)).toBeTruthy();
      expect(screen.getByText(/Khớp danh mục ACM: LED-5MM-RGB \(Không thuộc phiếu mượn này\)/i)).toBeTruthy();
    });
  });

  // Scenario 3: Không ánh xạ được (Unmapped YOLO class)
  it('SCENARIO-03 [Không ánh xạ được]: flags unmapped class and prevents automatic return claiming', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_unmapped_01',
      inferenceTimeMs: 36.1,
      detectionsCount: 1,
      detections: [
        {
          classId: 1,
          className: '11-hole_stick',
          confidence: 0.91,
          boundingBox: { x1: 80, y1: 90, x2: 240, y2: 140 },
          suggestedItemCode: null, // Robotics part not in ACM catalog
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
    const file = new File(['fake-bytes'], 'stick.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getAllByText(/1 chưa ánh xạ/i).length).toBeGreaterThan(0);
      // Return list must be empty
      expect(screen.getByText(/Linh kiện hoàn trả \(0\)/i)).toBeTruthy();
    });

    // Check Detections tab
    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getAllByText(/Chưa ánh xạ/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Chưa có ánh xạ trong danh mục linh kiện ACM/i)).toBeTruthy();
      // Check manual assignment dropdown exists
      expect(screen.getByText(/Gán thủ công:/i)).toBeTruthy();
    });
  });

  // Scenario 4: Nhiều đối tượng (25 đối tượng phát hiện)
  it('SCENARIO-04 [Nhiều đối tượng - 25 detections]: displays all 25 detections breakdown without losing unmapped objects', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    // Create 25 detections: 2 Servos (matched borrow), 3 LEDs (matched catalog only), 20 sticks (unmapped)
    const mock25Detections: visionService.VisionDetection[] = [
      {
        classId: 59,
        className: 'Servo',
        confidence: 0.95,
        boundingBox: { x1: 10, y1: 10, x2: 60, y2: 60 },
        suggestedItemCode: 'SERVO-SG90',
      },
      {
        classId: 59,
        className: 'Servo',
        confidence: 0.91,
        boundingBox: { x1: 70, y1: 10, x2: 120, y2: 60 },
        suggestedItemCode: 'SERVO-SG90',
      },
      ...Array.from({ length: 3 }, (_, i) => ({
        classId: 63,
        className: 'LED_lamp',
        confidence: 0.85,
        boundingBox: { x1: 130 + i * 40, y1: 10, x2: 160 + i * 40, y2: 50 },
        suggestedItemCode: 'LED-5MM-RGB',
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        classId: 1,
        className: '11-hole_stick',
        confidence: 0.80 + (i % 15) * 0.01,
        boundingBox: { x1: 10 + (i % 5) * 60, y1: 80 + Math.floor(i / 5) * 40, x2: 60 + (i % 5) * 60, y2: 110 + Math.floor(i / 5) * 40 },
        suggestedItemCode: null,
      })),
    ];

    expect(mock25Detections.length).toBe(25);

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_25_objects',
      inferenceTimeMs: 48.2,
      detectionsCount: 25,
      detections: mock25Detections,
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
    const file = new File(['fake-bytes'], 'all_25.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Banner explicitly shows: AI phát hiện: 25 đối tượng
      expect(screen.getByText(/AI phát hiện: 25 đối tượng/i)).toBeTruthy();
      expect(screen.getAllByText(/2 khớp phiếu/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/3 khớp DM/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/20 chưa ánh xạ/i).length).toBeGreaterThan(0);

      // Only the 2 Servos are staged in return items list
      expect(screen.getByText(/Linh kiện hoàn trả \(1\)/i)).toBeTruthy();
      expect(screen.getAllByText(/Servo Motor SG90/i).length).toBeGreaterThan(0);
      const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(qtyInput.value).toBe('2'); // Staged 2 items from the 2 detected Servos
    });

    // Check Detections tab has all 25
    const detTab = screen.getByRole('button', { name: /Chi tiết AI nhận diện \(25\)/i });
    fireEvent.click(detTab);

    await waitFor(() => {
      expect(screen.getByText(/Tất cả \(25\)/i)).toBeTruthy();
      expect(screen.getByText(/Khớp phiếu \(2\)/i)).toBeTruthy();
      expect(screen.getByText(/Khớp DM \(3\)/i)).toBeTruthy();
      expect(screen.getByText(/Chưa ánh xạ \(20\)/i)).toBeTruthy();
    });
  });

  // Scenario 5: Số lượng vượt outstanding (Quantity Exceeds Outstanding)
  it('SCENARIO-05 [Số lượng vượt outstanding]: clamps staged quantity to remaining and alerts operator', async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    // mockBorrowRecord has Servo quantity=5, returnedQuantity=2 -> remaining=3
    // Simulate detecting 5 Servos in the frame
    const mock5Servos: visionService.VisionDetection[] = Array.from({ length: 5 }, (_, i) => ({
      classId: 59,
      className: 'Servo',
      confidence: 0.90 + i * 0.01,
      boundingBox: { x1: 10 + i * 50, y1: 20, x2: 50 + i * 50, y2: 80 },
      suggestedItemCode: 'SERVO-SG90',
    }));

    vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
      success: true,
      frameId: 'frame_exceed_01',
      inferenceTimeMs: 44.0,
      detectionsCount: 5,
      detections: mock5Servos,
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
    const file = new File(['fake-bytes'], 'servos_5.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      // Must be staged with quantity clamped to remaining (3), NOT 5!
      const qtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(qtyInput.value).toBe('3');

      // Operator warning indicator displayed
      expect(screen.getByText(/Phát hiện 5 cái \(Giới hạn trả 3\)/i)).toBeTruthy();
    });
  });

  // =========================================================================
  // CAMERA AI SIMPLE RECOGNITION DISPLAY TEST SUITE (TC-SIMPLE-01..06)
  // =========================================================================

  describe('Camera AI Simple Recognition Display Suite', () => {
    // TC-SIMPLE-01: 0 detection -> displays "Chưa nhận diện được"
    it('TC-SIMPLE-01: displays "Chưa nhận diện được" when detections list is empty', async () => {
      render(
        <CameraReturnModal
          isOpen={true}
          onClose={vi.fn()}
          borrowRecord={mockBorrowRecord}
          onApplyReturnRows={vi.fn()}
        />
      );

      // Verify the simple summary bar exists
      expect(screen.getByTestId('ai-simple-recognition-bar')).toBeTruthy();
      expect(screen.getByText(/AI đã nhận diện:/i)).toBeTruthy();
      expect(screen.getByText(/Chưa nhận diện được/i)).toBeTruthy();
    });

    // TC-SIMPLE-02: 1 detection -> displays 1 friendly name chip
    it('TC-SIMPLE-02: displays 1 friendly name chip when 1 item is detected', async () => {
      vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
        success: true,
        frameId: 'frame_single_01',
        inferenceTimeMs: 35.0,
        detectionsCount: 1,
        detections: [
          {
            classId: 59,
            className: 'Servo',
            confidence: 0.94,
            boundingBox: { x1: 50, y1: 50, x2: 200, y2: 200 },
            suggestedItemCode: 'SERVO-SG90',
          },
        ],
      });

      render(
        <CameraReturnModal
          isOpen={true}
          onClose={vi.fn()}
          borrowRecord={mockBorrowRecord}
          onApplyReturnRows={vi.fn()}
        />
      );

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['fake-bytes'], 'single_servo.jpg', { type: 'image/jpeg' });
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        const chip = screen.getByTestId('ai-chip-Servo');
        expect(chip).toBeTruthy();
        expect(chip.textContent).toContain('Servo Motor SG90');
      });
    });

    // TC-SIMPLE-03: Multiple objects of same class -> does not repeat name, shows count badge
    it('TC-SIMPLE-03: deduplicates multiple detections of same class into 1 chip with count badge', async () => {
      vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
        success: true,
        frameId: 'frame_multi_same_01',
        inferenceTimeMs: 40.0,
        detectionsCount: 4,
        detections: [
          { classId: 59, className: 'Servo', confidence: 0.91, boundingBox: { x1: 10, y1: 10, x2: 50, y2: 50 }, suggestedItemCode: 'SERVO-SG90' },
          { classId: 59, className: 'Servo', confidence: 0.92, boundingBox: { x1: 60, y1: 10, x2: 100, y2: 50 }, suggestedItemCode: 'SERVO-SG90' },
          { classId: 59, className: 'Servo', confidence: 0.89, boundingBox: { x1: 110, y1: 10, x2: 150, y2: 50 }, suggestedItemCode: 'SERVO-SG90' },
          { classId: 59, className: 'Servo', confidence: 0.95, boundingBox: { x1: 160, y1: 10, x2: 200, y2: 50 }, suggestedItemCode: 'SERVO-SG90' },
        ],
      });

      render(
        <CameraReturnModal
          isOpen={true}
          onClose={vi.fn()}
          borrowRecord={mockBorrowRecord}
          onApplyReturnRows={vi.fn()}
        />
      );

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['fake'], 'servos.jpg', { type: 'image/jpeg' })] } });

      await waitFor(() => {
        const chips = screen.getAllByTestId('ai-chip-Servo');
        expect(chips.length).toBe(1);
        expect(chips[0].textContent).toContain('x4');
      });
    });

    // TC-SIMPLE-04: 25 detections across multiple classes -> compact interface (max 4 chips + expand button)
    it('TC-SIMPLE-04: displays at most 4 chips by default and shows "+ X loại khác" for 25 detections', async () => {
      const classNames = ['Servo', 'Ultrasonic_sensor', 'Temp_hum_sensor', 'LED_lamp', 'gear_spur_plastic', 'bearing_ball', 'bracket_angle'];
      const detections: visionService.VisionDetection[] = Array.from({ length: 25 }, (_, i) => {
        const cls = classNames[i % classNames.length];
        return {
          classId: i,
          className: cls,
          confidence: 0.80,
          boundingBox: { x1: (i * 20) % 400, y1: 20, x2: ((i * 20) % 400) + 30, y2: 60 },
          suggestedItemCode: cls === 'Servo' ? 'SERVO-SG90' : cls === 'Ultrasonic_sensor' ? 'SR04-ULTRASONIC' : null,
        };
      });

      vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
        success: true,
        frameId: 'frame_25_items',
        inferenceTimeMs: 48.0,
        detectionsCount: 25,
        detections,
      });

      render(
        <CameraReturnModal
          isOpen={true}
          onClose={vi.fn()}
          borrowRecord={mockBorrowRecord}
          onApplyReturnRows={vi.fn()}
        />
      );

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['fake'], 'cluttered.jpg', { type: 'image/jpeg' })] } });

      await waitFor(() => {
        const expandBtn = screen.getByTestId('ai-expand-classes-toggle');
        expect(expandBtn).toBeTruthy();
        expect(expandBtn.textContent).toContain('+3 loại khác');

        const chipContainer = screen.getByTestId('ai-recognition-chips');
        const chips = chipContainer.querySelectorAll('button[data-testid^="ai-chip-"]');
        expect(chips.length).toBe(4);
      });

      // Click to expand
      const expandBtn = screen.getByTestId('ai-expand-classes-toggle');
      fireEvent.click(expandBtn);

      const chipContainer = screen.getByTestId('ai-recognition-chips');
      const expandedChips = chipContainer.querySelectorAll('button[data-testid^="ai-chip-"]');
      expect(expandedChips.length).toBe(7);
      expect(expandBtn.textContent).toContain('Thu gọn');
    });

    // TC-SIMPLE-05: Chip selection highlights bounding box and shows "Xem tất cả" button
    it('TC-SIMPLE-05: clicking a chip activates highlight and shows "Xem tất cả" reset button', async () => {
      vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
        success: true,
        frameId: 'frame_highlight_test',
        inferenceTimeMs: 32.0,
        detectionsCount: 2,
        detections: [
          { classId: 59, className: 'Servo', confidence: 0.93, boundingBox: { x1: 10, y1: 10, x2: 50, y2: 50 }, suggestedItemCode: 'SERVO-SG90' },
          { classId: 80, className: 'gear_spur_plastic', confidence: 0.75, boundingBox: { x1: 100, y1: 100, x2: 150, y2: 150 }, suggestedItemCode: null },
        ],
      });

      render(
        <CameraReturnModal
          isOpen={true}
          onClose={vi.fn()}
          borrowRecord={mockBorrowRecord}
          onApplyReturnRows={vi.fn()}
        />
      );

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['fake'], 'two_items.jpg', { type: 'image/jpeg' })] } });

      await waitFor(() => {
        expect(screen.getByTestId('ai-chip-Servo')).toBeTruthy();
        expect(screen.getByTestId('ai-chip-gear_spur_plastic')).toBeTruthy();
      });

      // Click on Servo chip to highlight
      const servoChip = screen.getByTestId('ai-chip-Servo');
      fireEvent.click(servoChip);

      await waitFor(() => {
        expect(screen.getByTestId('ai-clear-highlight')).toBeTruthy();
      });

      // Click reset button
      fireEvent.click(screen.getByTestId('ai-clear-highlight'));
      await waitFor(() => {
        expect(screen.queryByTestId('ai-clear-highlight')).toBeNull();
      });
    });

    // TC-SIMPLE-06: Unmapped class displays raw AI class name and does not auto-stage
    it('TC-SIMPLE-06: unmapped class keeps raw AI class name in chip and prevents auto-staging', async () => {
      vi.spyOn(visionService, 'detectFrameFile').mockResolvedValueOnce({
        success: true,
        frameId: 'frame_unmapped_01',
        inferenceTimeMs: 25.0,
        detectionsCount: 1,
        detections: [
          { classId: 99, className: 'bearing_ball_radial', confidence: 0.82, boundingBox: { x1: 50, y1: 50, x2: 100, y2: 100 }, suggestedItemCode: null },
        ],
      });

      render(
        <CameraReturnModal
          isOpen={true}
          onClose={vi.fn()}
          borrowRecord={mockBorrowRecord}
          onApplyReturnRows={vi.fn()}
        />
      );

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['fake'], 'bearing.jpg', { type: 'image/jpeg' })] } });

      await waitFor(() => {
        const unmappedChip = screen.getByTestId('ai-chip-bearing_ball_radial');
        expect(unmappedChip).toBeTruthy();
        expect(unmappedChip.textContent).toContain('bearing_ball_radial');
        expect(screen.getByText(/Chưa có linh kiện nào được nhận diện hoặc chọn hoàn trả/i)).toBeTruthy();
      });
    });
  });

});
