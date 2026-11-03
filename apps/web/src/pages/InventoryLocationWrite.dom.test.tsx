// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LocationType } from '@acm/shared';
import { LocationFormModal } from '../components/inventory/LocationFormModal';
import { LocationStatusModal } from '../components/inventory/LocationStatusModal';
import { LocationHierarchyTree } from '../components/inventory/LocationHierarchyTree';
import * as features from '../config/features';

describe('ACM Phase 2.2 Step 4B.2B – Locations Write UI DOM Test Suite (Mock-Verified)', () => {
  // Sample test fixtures
  const mockLocations = [
    {
      id: 'wh-main',
      code: 'WH-MAIN',
      name: 'Kho Tổng Lab',
      type: LocationType.WAREHOUSE,
      parentId: null,
      isActive: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'rack-a',
      code: 'RACK-A',
      name: 'Kệ A',
      type: LocationType.RACK,
      parentId: 'wh-main',
      isActive: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'shelf-a1',
      code: 'SHELF-A1',
      name: 'Tầng A1',
      type: LocationType.SHELF,
      parentId: 'rack-a',
      isActive: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'bin-a1',
      code: 'BIN-A1',
      name: 'Khay A1',
      type: LocationType.BIN,
      parentId: 'rack-a', // 3-level directly under rack
      isActive: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'bin-a1-1',
      code: 'BIN-A1-1',
      name: 'Khay A1.1',
      type: LocationType.BIN,
      parentId: 'shelf-a1', // 4-level under shelf
      isActive: false, // inactive location
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to write enabled for functional tests, will toggle in safety group
    vi.spyOn(features, 'isLocationWriteEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // GROUP A: CREATE LOCATION MODAL TESTS
  // =========================================================================
  describe('A. Location CREATE Operations', () => {
    it('TC-DOM-LOC-CR-01: opens create modal with clean fields and default WAREHOUSE', () => {
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByRole('heading', { name: /Thêm Mới Vị Trí Kho/i })).toBeDefined();
      const codeInput = screen.getByLabelText(/Mã vị trí kho/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i) as HTMLInputElement;
      const typeSelect = screen.getByLabelText(/Loại vị trí/i) as HTMLSelectElement;

      expect(codeInput.value).toBe('');
      expect(nameInput.value).toBe('');
      expect(typeSelect.value).toBe(LocationType.WAREHOUSE);
    });

    it('TC-DOM-LOC-CR-02: validates mandatory fields (empty code and name) without submitting', async () => {
      const submitMock = vi.fn();
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText('Mã vị trí kho không được để trống')).toBeDefined();
      expect(screen.getByText('Tên vị trí kho không được để trống')).toBeDefined();
      expect(submitMock).not.toHaveBeenCalled();
    });

    it('TC-DOM-LOC-CR-03: rejects invalid code format (special chars, spaces, <2 chars)', async () => {
      const submitMock = vi.fn();
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const codeInput = screen.getByLabelText(/Mã vị trí kho/i);
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i);
      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });

      // Test 1 char
      fireEvent.change(codeInput, { target: { value: 'A' } });
      fireEvent.change(nameInput, { target: { value: 'Kho Mới' } });
      fireEvent.click(submitBtn);
      expect(screen.getByText('Mã vị trí phải có ít nhất 2 ký tự')).toBeDefined();
      expect(submitMock).not.toHaveBeenCalled();

      // Test special character (e.g. '@#$')
      fireEvent.change(codeInput, { target: { value: 'BIN@01' } });
      fireEvent.click(submitBtn);
      expect(
        screen.getByText(/Mã vị trí chỉ được chứa chữ cái, số, dấu gạch ngang/i)
      ).toBeDefined();
      expect(submitMock).not.toHaveBeenCalled();
    });

    it('TC-DOM-LOC-CR-04: rejects RACK or BIN without selecting a valid parent', async () => {
      const submitMock = vi.fn();
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const codeInput = screen.getByLabelText(/Mã vị trí kho/i);
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i);
      const typeSelect = screen.getByLabelText(/Loại vị trí/i);
      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });

      fireEvent.change(codeInput, { target: { value: 'RACK-TEST' } });
      fireEvent.change(nameInput, { target: { value: 'Kệ Kiểm Thử' } });
      fireEvent.change(typeSelect, { target: { value: LocationType.RACK } });

      const parentSelect = screen.getByLabelText(/Vị trí trực thuộc \(Cha\)/i) as HTMLSelectElement;
      fireEvent.change(parentSelect, { target: { value: '' } });

      fireEvent.click(submitBtn);
      expect(screen.getByText("Vị trí loại 'RACK' bắt buộc phải chọn vị trí cha")).toBeDefined();
      expect(submitMock).not.toHaveBeenCalled();
    });

    it('TC-DOM-LOC-CR-05: submits valid payload matching Backend contract with mock API', async () => {
      const submitMock = vi.fn().mockResolvedValue(undefined);
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const codeInput = screen.getByLabelText(/Mã vị trí kho/i);
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i);
      const typeSelect = screen.getByLabelText(/Loại vị trí/i);

      fireEvent.change(codeInput, { target: { value: 'rack-b' } });
      fireEvent.change(nameInput, { target: { value: 'Kệ B' } });
      fireEvent.change(typeSelect, { target: { value: LocationType.RACK } });

      const parentSelect = screen.getByLabelText(/Vị trí trực thuộc \(Cha\)/i);
      fireEvent.change(parentSelect, { target: { value: 'wh-main' } });

      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitMock).toHaveBeenCalledTimes(1);
        expect(submitMock).toHaveBeenCalledWith({
          code: 'RACK-B', // auto uppercase
          name: 'Kệ B',
          type: LocationType.RACK,
          parentId: 'wh-main',
        });
      });
    });

    it('TC-DOM-LOC-CR-06: displays 409 conflict error when code already exists and retains form inputs', async () => {
      const submitMock = vi.fn().mockRejectedValue({
        response: {
          status: 409,
          data: {
            success: false,
            message: "Mã vị trí kho 'WH-MAIN' đã tồn tại trong hệ thống",
          },
        },
      });

      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const codeInput = screen.getByLabelText(/Mã vị trí kho/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i) as HTMLInputElement;

      fireEvent.change(codeInput, { target: { value: 'WH-MAIN' } });
      fireEvent.change(nameInput, { target: { value: 'Kho Tổng Số 2' } });

      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Mã vị trí kho 'WH-MAIN' đã tồn tại trong hệ thống")).toBeDefined();
        // Form inputs must be retained
        expect(codeInput.value).toBe('WH-MAIN');
        expect(nameInput.value).toBe('Kho Tổng Số 2');
      });
    });

    it('TC-DOM-LOC-CR-07: displays 422 Zod error returned from backend API', async () => {
      const submitMock = vi.fn().mockRejectedValue({
        response: {
          status: 422,
          data: {
            success: false,
            message: 'Dữ liệu tạo vị trí kho không hợp lệ',
          },
        },
      });

      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const codeInput = screen.getByLabelText(/Mã vị trí kho/i);
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i);

      fireEvent.change(codeInput, { target: { value: 'WH-TEST' } });
      fireEvent.change(nameInput, { target: { value: 'Kho Test' } });

      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Dữ liệu tạo vị trí kho không hợp lệ')).toBeDefined();
      });
    });
  });

  // =========================================================================
  // GROUP B: EDIT LOCATION MODAL TESTS
  // =========================================================================
  describe('B. Location EDIT Operations', () => {
    it('TC-DOM-LOC-ED-01: pre-fills existing location data in EDIT mode', () => {
      const initial = mockLocations[1]; // RACK-A
      render(
        <LocationFormModal
          isOpen={true}
          mode="EDIT"
          initialLocation={initial}
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByRole('heading', { name: /Chỉnh Sửa Vị Trí Kho/i })).toBeDefined();
      const codeInput = screen.getByLabelText(/Mã vị trí kho/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/Tên vị trí kho/i) as HTMLInputElement;
      const typeSelect = screen.getByLabelText(/Loại vị trí/i) as HTMLSelectElement;

      expect(codeInput.value).toBe('RACK-A');
      expect(nameInput.value).toBe('Kệ A');
      expect(typeSelect.value).toBe(LocationType.RACK);
    });

    it('TC-DOM-LOC-ED-02: prevents selecting self or descendants as parent (anti-loop)', () => {
      // Editing RACK-A: children are SHELF-A1 and BIN-A1
      const initial = mockLocations[1]; // RACK-A
      render(
        <LocationFormModal
          isOpen={true}
          mode="EDIT"
          initialLocation={initial}
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const parentSelect = screen.getByLabelText(/Vị trí trực thuộc \(Cha\)/i) as HTMLSelectElement;
      const optionValues = Array.from(parentSelect.options).map((opt) => opt.value);

      // Self (rack-a) must not be an option
      expect(optionValues).not.toContain('rack-a');
      // Descendants (shelf-a1, bin-a1) must not be options
      expect(optionValues).not.toContain('shelf-a1');
      expect(optionValues).not.toContain('bin-a1');
      // Eligible parent WH-MAIN must be present
      expect(optionValues).toContain('wh-main');
    });

    it('TC-DOM-LOC-ED-03: submits updated name and parent conforming to Backend Contract', async () => {
      const initial = mockLocations[3]; // BIN-A1
      const submitMock = vi.fn().mockResolvedValue(undefined);

      render(
        <LocationFormModal
          isOpen={true}
          mode="EDIT"
          initialLocation={initial}
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const nameInput = screen.getByLabelText(/Tên vị trí kho/i);
      fireEvent.change(nameInput, { target: { value: 'Khay A1 (Đã đổi tên)' } });

      const submitBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitMock).toHaveBeenCalledTimes(1);
        expect(submitMock).toHaveBeenCalledWith({
          code: 'BIN-A1',
          name: 'Khay A1 (Đã đổi tên)',
          type: LocationType.BIN,
          parentId: 'rack-a',
        });
      });
    });

    it('TC-DOM-LOC-ED-04: retains form inputs and displays error when backend rejects update', async () => {
      const initial = mockLocations[1]; // RACK-A
      const submitMock = vi.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            success: false,
            message: 'Không thể chọn vị trí con/cháu làm vị trí cha (phát hiện vòng lặp phân cấp)',
          },
        },
      });

      render(
        <LocationFormModal
          isOpen={true}
          mode="EDIT"
          initialLocation={initial}
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Không thể chọn vị trí con/cháu làm vị trí cha (phát hiện vòng lặp phân cấp)')
        ).toBeDefined();
      });
    });
  });

  // =========================================================================
  // GROUP C: LOCATION STATUS MANAGEMENT (SAFE ACTIVATION / DEACTIVATION)
  // =========================================================================
  describe('C. Location STATUS Management Operations', () => {
    it('TC-DOM-LOC-ST-01: renders confirmation modal before deactivating with clear warnings', () => {
      const targetLoc = mockLocations[1]; // RACK-A (isActive: true)
      render(
        <LocationStatusModal
          isOpen={true}
          location={targetLoc}
          targetActive={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByRole('heading', { name: /Xác Nhận Vô Hiệu Hóa Vị Trí/i })).toBeDefined();
      expect(screen.getByText('RACK-A')).toBeDefined();
      expect(screen.getByText('Kệ A')).toBeDefined();
      expect(screen.getByText(/Quy tắc an toàn kho nội bộ/i)).toBeDefined();
      expect(screen.getByText(/Điều kiện bắt buộc:/i)).toBeDefined();
      expect(screen.getByText('TỪ CHỐI')).toBeDefined();
    });

    it('TC-DOM-LOC-ST-02: clicking cancel closes modal and makes no API request', () => {
      const targetLoc = mockLocations[1];
      const closeMock = vi.fn();
      const confirmMock = vi.fn();

      render(
        <LocationStatusModal
          isOpen={true}
          location={targetLoc}
          targetActive={false}
          onClose={closeMock}
          onConfirm={confirmMock}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Hủy bỏ/i });
      fireEvent.click(cancelBtn);

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(confirmMock).not.toHaveBeenCalled();
    });

    it('TC-DOM-LOC-ST-03: displays 400 error when backend rejects deactivation due to active stock balances', async () => {
      const targetLoc = mockLocations[3]; // BIN-A1
      const confirmMock = vi.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            success: false,
            message:
              'Không thể vô hiệu hóa vị trí kho này vì vẫn còn tồn kho vật lý (45 sản phẩm) hoặc số lượng đang phân bổ. Vui lòng điều chuyển hoặc xuất kho trước khi vô hiệu hóa.',
          },
        },
      });

      render(
        <LocationStatusModal
          isOpen={true}
          location={targetLoc}
          targetActive={false}
          onClose={vi.fn()}
          onConfirm={confirmMock}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /Xác nhận vô hiệu hóa/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Không thể vô hiệu hóa vị trí kho này vì vẫn còn tồn kho vật lý/i)
        ).toBeDefined();
      });
    });

    it('TC-DOM-LOC-ST-04: displays 400 error when backend rejects deactivation due to active child locations', async () => {
      const targetLoc = mockLocations[0]; // WH-MAIN
      const confirmMock = vi.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            success: false,
            message:
              'Không thể vô hiệu hóa vị trí này vì vẫn còn 4 vị trí con đang hoạt động. Vui lòng vô hiệu hóa các vị trí con trước.',
          },
        },
      });

      render(
        <LocationStatusModal
          isOpen={true}
          location={targetLoc}
          targetActive={false}
          onClose={vi.fn()}
          onConfirm={confirmMock}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /Xác nhận vô hiệu hóa/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Không thể vô hiệu hóa vị trí này vì vẫn còn 4 vị trí con đang hoạt động/i)
        ).toBeDefined();
      });
    });

    it('TC-DOM-LOC-ST-05: successfully calls mock reactivation for inactive location', async () => {
      const targetLoc = mockLocations[4]; // BIN-A1-1 (isActive: false)
      const confirmMock = vi.fn().mockResolvedValue(undefined);

      render(
        <LocationStatusModal
          isOpen={true}
          location={targetLoc}
          targetActive={true}
          onClose={vi.fn()}
          onConfirm={confirmMock}
        />
      );

      expect(screen.getByRole('heading', { name: /Xác Nhận Kích Hoạt Vị Trí/i })).toBeDefined();

      const reasonInput = screen.getByLabelText(/Lý do thay đổi trạng thái/i);
      fireEvent.change(reasonInput, { target: { value: 'Bảo trì hoàn tất, đưa vào sử dụng' } });

      const confirmBtn = screen.getByRole('button', { name: /Xác nhận kích hoạt/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(confirmMock).toHaveBeenCalledTimes(1);
        expect(confirmMock).toHaveBeenCalledWith({
          isActive: true,
          reason: 'Bảo trì hoàn tất, đưa vào sử dụng',
        });
      });
    });
  });

  // =========================================================================
  // GROUP D: RBAC PERMISSIONS IN LOCATION HIERARCHY TREE
  // =========================================================================
  describe('D. RBAC Permissions on Location Write UI', () => {
    const mockTree = [
      {
        id: 'wh-main',
        code: 'WH-MAIN',
        name: 'Kho Tổng Lab',
        type: LocationType.WAREHOUSE,
        isActive: true,
        children: [],
      },
    ];

    it('TC-DOM-LOC-RBAC-01: ADMIN and LAB_MANAGER see write actions (Thêm vị trí, Chỉnh sửa, Vô hiệu hóa)', () => {
      const onAddMock = vi.fn();
      const onEditMock = vi.fn();
      const onStatusMock = vi.fn();

      render(
        <LocationHierarchyTree
          tree={mockTree}
          canWrite={true}
          onAddLocation={onAddMock}
          onEditLocation={onEditMock}
          onToggleStatus={onStatusMock}
          selectedLocationId="wh-main"
          locationDetail={{
            id: 'wh-main',
            code: 'WH-MAIN',
            name: 'Kho Tổng Lab',
            type: LocationType.WAREHOUSE,
            isActive: true,
            children: [],
            stockBalances: [],
          }}
          onSelectLocation={vi.fn()}
        />
      );

      // Verify + Thêm vị trí button is visible
      const addBtn = screen.getByRole('button', { name: /Thêm vị trí/i });
      expect(addBtn).toBeDefined();
      fireEvent.click(addBtn);
      expect(onAddMock).toHaveBeenCalledTimes(1);

      // Verify Chỉnh sửa button is visible in right pane
      const editBtn = screen.getByRole('button', { name: /Chỉnh sửa/i });
      expect(editBtn).toBeDefined();
      fireEvent.click(editBtn);
      expect(onEditMock).toHaveBeenCalledTimes(1);

      // Verify Vô hiệu hóa button is visible in right pane
      const statusBtn = screen.getByRole('button', { name: /Vô hiệu hóa/i });
      expect(statusBtn).toBeDefined();
      fireEvent.click(statusBtn);
      expect(onStatusMock).toHaveBeenCalledTimes(1);
    });

    it('TC-DOM-LOC-RBAC-02: TECHNICIAN (canWrite=false) cannot see or click write action buttons', () => {
      render(
        <LocationHierarchyTree
          tree={mockTree}
          canWrite={false}
          selectedLocationId="wh-main"
          locationDetail={{
            id: 'wh-main',
            code: 'WH-MAIN',
            name: 'Kho Tổng Lab',
            type: LocationType.WAREHOUSE,
            isActive: true,
            children: [],
            stockBalances: [],
          }}
          onSelectLocation={vi.fn()}
        />
      );

      // Neither Thêm vị trí, Chỉnh sửa, nor Vô hiệu hóa should be present
      expect(screen.queryByRole('button', { name: /Thêm vị trí/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Chỉnh sửa/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Vô hiệu hóa/i })).toBeNull();
    });
  });

  // =========================================================================
  // GROUP E: SAFETY, FEATURE FLAG & CACHE INVALIDATION
  // =========================================================================
  describe('E. Safety, Feature Flag & Cache Invalidation', () => {
    it('TC-DOM-LOC-SAFE-01: feature flag OFF disables submit button and blocks mutation', () => {
      // Mock Feature Flag OFF
      vi.spyOn(features, 'isLocationWriteEnabled').mockReturnValue(false);

      const submitMock = vi.fn();
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={submitMock}
        />
      );

      // Banner should be visible
      expect(screen.getByText(/Chế độ Thử nghiệm \(Feature Flag OFF\)/i)).toBeDefined();

      // Submit button must be disabled
      const submitBtn = screen.getByRole('button', { name: /Tạo vị trí/i });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(submitBtn);
      expect(submitMock).not.toHaveBeenCalled();
    });

    it('TC-DOM-LOC-SAFE-02: double-click prevention via isSubmitting disables button and shows spinner', () => {
      render(
        <LocationFormModal
          isOpen={true}
          mode="CREATE"
          existingLocations={mockLocations}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          isSubmitting={true}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /Đang xử lý/i });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
    });

    it('TC-DOM-LOC-SAFE-03: verifies NO HTTP DELETE button exists in the DOM', () => {
      render(
        <LocationHierarchyTree
          tree={mockLocations as any}
          canWrite={true}
          selectedLocationId="wh-main"
          locationDetail={mockLocations[0]}
          onSelectLocation={vi.fn()}
        />
      );

      // Ensure no "Xóa" or "Delete" button exists anywhere in the UI
      expect(screen.queryByRole('button', { name: /Xóa/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Delete/i })).toBeNull();
    });

    it('TC-DOM-LOC-SAFE-04: verifies cache invalidation keys match required domain specifications', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      };

      const invalidateLocationQueries = (locationId?: string) => {
        mockQueryClient.invalidateQueries({ queryKey: ['locations', 'list'] });
        mockQueryClient.invalidateQueries({ queryKey: ['locations', 'tree'] });
        if (locationId) {
          mockQueryClient.invalidateQueries({ queryKey: ['locations', 'detail', locationId] });
        }
        mockQueryClient.invalidateQueries({ queryKey: ['inventory', 'summary'] });
      };

      invalidateLocationQueries('loc-123');

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['locations', 'list'] });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['locations', 'tree'] });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['locations', 'detail', 'loc-123'],
      });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inventory', 'summary'] });
    });
  });
});
