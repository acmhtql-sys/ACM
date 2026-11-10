import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Stage4CReturnWriterService,
  generateReturnNumber,
} from '../src/modules/borrow/borrow.stage4c-writer.service';
import { idempotencyService } from '../src/modules/inventory/idempotency.service';
import { UserRole } from '@acm/shared';
import { AuthenticatedUser } from '../src/middleware/auth';
import { AppError } from '../src/shared/AppError';
import {
  BorrowStatus,
  ReservationStatus,
  AssetCondition,
  StockTransactionType,
} from '@prisma/client';

describe('Stage4C Return Writer Service - Two-Phase Atomic Return Unit Tests', () => {
  let service: Stage4CReturnWriterService;
  let mockPrisma: any;

  const mockTechnician: AuthenticatedUser = {
    id: 'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
    email: 'tech@acm.local',
    fullName: 'Kỹ thuật viên phòng lab',
    role: UserRole.TECHNICIAN,
  };

  const mockStudent: AuthenticatedUser = {
    id: '6c39a348-d42a-406b-bd69-fea42e400001',
    email: 'student@acm.local',
    fullName: 'Sinh viên mượn đồ',
    role: UserRole.STUDENT,
  };

  const validIdemKey = 'idem-key-stage4c-test-001';

  beforeEach(() => {
    vi.stubEnv('ACM_RETURN_OPERATIONS_ENABLED', 'true');
    vi.stubEnv('STAGING_READ_ONLY', 'false');

    mockPrisma = {
      borrowRequest: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      borrowDetail: {
        update: vi.fn(),
        findMany: vi.fn(),
      },
      stockBalance: {
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({ id: 'sm-uuid-001' }),
      },
      returnTransaction: {
        create: vi.fn().mockResolvedValue({ id: 'rt-uuid-001', returnNumber: 'RT-20261110-0001' }),
        findUnique: vi.fn().mockResolvedValue({ id: 'rt-uuid-001', returnNumber: 'RT-20261110-0001' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'rt-uuid-001', returnNumber: 'RT-20261110-0001' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'rt-uuid-001', returnNumber: 'RT-20261110-0001' }]),
      },
      returnDetail: {
        create: vi.fn().mockResolvedValue({ id: 'rd-uuid-001' }),
      },
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'idem-rec-001', status: 'PENDING' }),
        update: vi.fn().mockResolvedValue({ id: 'idem-rec-001', status: 'COMPLETED' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-001' }),
      },
      $queryRaw: vi.fn().mockImplementation(async (sql: any) => {
        const text = String(sql);
        if (text.includes('borrow_return_operations') && text.includes('WHERE "id"')) {
          return [
            {
              id: 'op-001',
              borrow_request_id: 'borrow-001',
              state: 'PREPARED',
              physical_evidence_ref: 'EVID-TEST-001',
              payload_hash: null,
              payload_snapshot: null,
            },
          ];
        }
        return [];
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new Stage4CReturnWriterService(mockPrisma);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- HARD GATES & RBAC TESTS ---
  describe('Hard Gates & Access Controls', () => {
    it('TC-S4C-GATE-01: Chặn ghi dữ liệu khi STAGING_READ_ONLY = "true" (403)', async () => {
      vi.stubEnv('STAGING_READ_ONLY', 'true');

      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'EVID-TEST-001',
          },
          mockTechnician
        )
      ).rejects.toThrowError(/Chỉ đọc/);

      await expect(
        service.commitReturnOperation('op-001', mockTechnician, undefined, null, validIdemKey)
      ).rejects.toThrowError(/Chỉ đọc/);
    });

    it('TC-S4C-GATE-02: Gọi rejectUnreleasedReturnOperations() khi ACM_RETURN_OPERATIONS_ENABLED !== "true" (503)', async () => {
      vi.stubEnv('ACM_RETURN_OPERATIONS_ENABLED', 'false');

      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'EVID-TEST-001',
          },
          mockTechnician
        )
      ).rejects.toThrowError(/chưa được phát hành/);

      await expect(
        service.commitReturnOperation('op-001', mockTechnician, undefined, null, validIdemKey)
      ).rejects.toThrowError(/chưa được phát hành/);
    });

    it('TC-S4C-RBAC-01: Chặn sinh viên (STUDENT) ở cả Pha 1 và Pha 2 (403)', async () => {
      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'EVID-TEST-001',
          },
          mockStudent
        )
      ).rejects.toThrowError(/Chỉ Quản trị viên, Quản lý Lab hoặc Kỹ thuật viên/);

      await expect(
        service.commitReturnOperation('op-001', mockStudent, undefined, null, validIdemKey)
      ).rejects.toThrowError(/Chỉ Quản trị viên, Quản lý Lab hoặc Kỹ thuật viên/);
    });
  });

  // --- PHA 1: PREPARE TESTS ---
  describe('Pha 1: Prepare Operation', () => {
    it('TC-S4C-01: Tiếp nhận hợp lệ tạo bản ghi PREPARED và gọi advisory lock', async () => {
      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-uuid-001',
        status: BorrowStatus.HANDED_OVER,
        details: [{ id: 'det-1', quantity: 2, returnedQuantity: 0 }],
      });

      const result = await service.prepareReturnOperation(
        {
          borrowRequestId: 'borrow-uuid-001',
          physicalEvidenceRef: 'BB-2026-001',
        },
        mockTechnician
      );

      expect(result.state).toBe('PREPARED');
      expect(result.physicalEvidenceRef).toBe('BB-2026-001');
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('TC-S4C-02: Từ chối nếu phiếu mượn không ở trạng thái HANDED_OVER hoặc PARTIALLY_RETURNED (400)', async () => {
      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-uuid-001',
        status: BorrowStatus.APPROVED,
      });

      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'BB-2026-001',
          },
          mockTechnician
        )
      ).rejects.toThrowError(/Chỉ phiếu mượn 'Đang mượn/);
    });

    it('TC-S4C-03: Từ chối nếu phiếu mượn đang có thao tác PREPARED hoặc RECONCILIATION_REQUIRED dở dang (409)', async () => {
      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-uuid-001',
        status: BorrowStatus.HANDED_OVER,
      });

      mockPrisma.$queryRaw.mockImplementation(async (sql: any) => {
        const text = String(sql);
        if (text.includes('PREPARED') && text.includes('RECONCILIATION_REQUIRED')) {
          return [{ id: 'existing-op', state: 'PREPARED' }];
        }
        return [];
      });

      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'BB-2026-001',
          },
          mockTechnician
        )
      ).rejects.toThrowError(/đang có một thao tác hoàn trả chưa kết thúc/);
    });

    it('TC-S4C-04: Từ chối mã chứng từ vật lý không hợp lệ theo quy tắc BIZ-01 (422)', async () => {
      for (const badRef of ['', '   ', 'MÃ-CÓ-DẤU', 'REF@INVALID!', ' leading', 'trailing ']) {
        await expect(
          service.prepareReturnOperation(
            {
              borrowRequestId: 'borrow-uuid-001',
              physicalEvidenceRef: badRef,
            },
            mockTechnician
          )
        ).rejects.toThrow();
      }
    });

    it('TC-S4C-14: Từ chối mã chứng từ vật lý đã tồn tại trong hệ thống (không phân biệt hoa thường) (409)', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (sql: any) => {
        const text = String(sql);
        if (text.includes('return_transactions')) {
          return [{ id: 'existing-rt-id' }];
        }
        return [];
      });

      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'RT-20261010-001',
          },
          mockTechnician
        )
      ).rejects.toThrowError(/đã tồn tại trong hệ thống/);
    });

    it('TC-S4C-15: Từ chối input.items là mảng rỗng [] (422)', async () => {
      await expect(
        service.prepareReturnOperation(
          {
            borrowRequestId: 'borrow-uuid-001',
            physicalEvidenceRef: 'EVID-TEST-EMPTY',
            items: [],
          },
          mockTechnician
        )
      ).rejects.toThrowError(/không được để trống/);
    });
  });

  // --- PHA 2: COMMIT TESTS ---
  describe('Pha 2: Commit Operation', () => {
    it('TC-S4C-IDEM-01: Bắt buộc truyền Idempotency-Key hợp lệ (422)', async () => {
      await expect(
        service.commitReturnOperation('op-001', mockTechnician, undefined, null, '')
      ).rejects.toThrowError(/bắt buộc/);

      await expect(
        service.commitReturnOperation('op-001', mockTechnician, undefined, null, 'short')
      ).rejects.toThrowError(/không hợp lệ/);
    });

    it('TC-S4C-05: Từ chối commit nếu trạng thái thao tác không phải là PREPARED (409)', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (sql: any) => {
        const text = String(sql);
        if (text.includes('borrow_return_operations') && text.includes('WHERE "id"')) {
          return [
            {
              id: 'op-001',
              borrow_request_id: 'borrow-001',
              state: 'RECONCILIATION_REQUIRED',
              physical_evidence_ref: 'EVID-TEST-001',
              received_by_id: mockTechnician.id,
              payload_hash: null,
              payload_snapshot: null,
            },
          ];
        }
        return [];
      });

      await expect(
        service.commitReturnOperation('op-001', mockTechnician, undefined, null, validIdemKey)
      ).rejects.toThrowError(/không thể commit/);
    });

    it('TC-S4C-SNAP-01: [P1.2] Bản chụp bền vững trong cơ sở dữ liệu: độc lập qua các process độc lập và từ chối khi sửa payload', async () => {
      const lineItem = {
        borrowDetailId: '11111111-1111-4111-8111-111111111111',
        returnedQuantity: 2,
        condition: 'GOOD' as const,
        locationId: null,
        sourceLocationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        notes: null,
      };

      // 1. Pha 1 Prepare
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-001',
        requestNumber: 'BR-20261110-0001',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineItem.borrowDetailId,
            itemId: 'item-uuid-001',
            quantity: 2,
            returnedQuantity: 0,
            item: { id: 'item-uuid-001', name: 'Arduino Uno' },
          },
        ],
        reservations: [
          {
            id: 'res-001',
            itemId: 'item-uuid-001',
            locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            quantity: 2,
            status: ReservationStatus.FULFILLED,
          },
        ],
      });

      const prepResult = await service.prepareReturnOperation(
        {
          borrowRequestId: 'borrow-001',
          physicalEvidenceRef: 'EVID-SNAP-001',
          items: [lineItem],
        },
        mockTechnician
      );

      expect(prepResult.payloadHash).toBeDefined();

      // Mô phỏng Process Restart / Process độc lập mới:
      // Tạo service instance mới, độc lập không hề có bộ nhớ tạm từ Pha 1
      const freshServiceAfterRestart = new Stage4CReturnWriterService(mockPrisma);

      const persistedHash = prepResult.payloadHash!;
      const persistedSnapshot = {
        items: [lineItem],
        notes: null,
      };

      mockPrisma.$queryRaw.mockImplementation(async (sql: any) => {
        const text = String(sql);
        if (text.includes('borrow_return_operations') && text.includes('WHERE "id"')) {
          return [
            {
              id: prepResult.operationId,
              borrow_request_id: 'borrow-001',
              state: 'PREPARED',
              physical_evidence_ref: 'EVID-SNAP-001',
              received_by_id: mockTechnician.id,
              payload_hash: persistedHash,
              payload_snapshot: persistedSnapshot,
            },
          ];
        }
        return [];
      });

      // 2. Commit tại Pha 2 nhưng cố tình gửi payload bị sửa đổi số lượng -> 409 Hash Mismatch
      await expect(
        freshServiceAfterRestart.commitReturnOperation(
          prepResult.operationId,
          mockTechnician,
          [{ ...lineItem, returnedQuantity: 1 }],
          null,
          validIdemKey
        )
      ).rejects.toThrowError(/không khớp với bản chụp kiểm định/);

      // 3. Commit tại Pha 2 không truyền inputItems (undefined) -> đọc thành công snapshot từ DB row!
      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        id: 'bal-001',
        itemId: 'item-uuid-001',
        locationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        onHand: 10,
        borrowed: 2,
        quarantined: 0,
      });
      mockPrisma.borrowDetail.findMany.mockResolvedValue([
        { id: lineItem.borrowDetailId, quantity: 2, returnedQuantity: 2 },
      ]);

      const commitWithDbSnapshot = await freshServiceAfterRestart.commitReturnOperation(
        prepResult.operationId,
        mockTechnician,
        undefined,
        null,
        'idem-key-fresh-session-002'
      );

      expect(commitWithDbSnapshot.state).toBe('COMPLETED');
      expect(commitWithDbSnapshot.returnNumber).toBeDefined();
    });

    it('TC-S4C-06: Commit thành công với kiểm định cách ly Quarantine-First (DAMAGED condition)', async () => {
      const lineDetailId = '11111111-1111-4111-8111-111111111111';

      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-001',
        requestNumber: 'BR-20261110-0001',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineDetailId,
            itemId: 'item-uuid-001',
            quantity: 2,
            returnedQuantity: 0,
            item: { id: 'item-uuid-001', name: 'Arduino Uno R3' },
          },
        ],
        reservations: [
          {
            id: 'res-001',
            itemId: 'item-uuid-001',
            locationId: 'loc-wh-01',
            quantity: 2,
            status: ReservationStatus.FULFILLED,
          },
        ],
        returnTransactions: [],
      });

      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        id: 'bal-001',
        itemId: 'item-uuid-001',
        locationId: 'loc-wh-01',
        onHand: 10,
        borrowed: 2,
        quarantined: 0,
      });

      mockPrisma.borrowDetail.findMany.mockResolvedValue([
        { id: lineDetailId, quantity: 2, returnedQuantity: 2 },
      ]);

      const result = await service.commitReturnOperation(
        'op-001',
        mockTechnician,
        [
          {
            borrowDetailId: lineDetailId,
            returnedQuantity: 2,
            condition: 'DAMAGED',
            locationId: null,
            notes: 'Hỏng cổng USB',
          },
        ],
        'Biên nhận hoàn trả hư hỏng',
        validIdemKey
      );

      expect(result.state).toBe('COMPLETED');
      expect(result.borrowStatus).toBe(BorrowStatus.RETURNED);

      // Kiểm tra Quarantine-First: Tăng onHand, tăng quarantined, giảm borrowed
      expect(mockPrisma.stockBalance.update).toHaveBeenCalledWith({
        where: { id: 'bal-001' },
        data: {
          onHand: { increment: 2 },
          quarantined: { increment: 2 },
          borrowed: { decrement: 2 },
        },
      });

      // Kiểm tra tạo bút toán StockMovement cách ly
      expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          itemId: 'item-uuid-001',
          locationId: 'loc-wh-01',
          type: StockTransactionType.IMPORT,
          quantityDelta: 2,
          referenceType: 'RETURN_DAMAGED',
        }),
      });
    });

    it('TC-S4C-07: Từ chối nếu số lượng trả vượt quá số lượng đang mượn còn lại của dòng (400)', async () => {
      const lineDetailId = '11111111-1111-4111-8111-111111111111';

      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-001',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineDetailId,
            itemId: 'item-uuid-001',
            quantity: 5,
            returnedQuantity: 4, // Chỉ còn 1 chiếc
            item: { id: 'item-uuid-001', name: 'Arduino' },
          },
        ],
        reservations: [
          {
            id: 'res-001',
            itemId: 'item-uuid-001',
            locationId: 'loc-wh-01',
            quantity: 5,
            status: ReservationStatus.FULFILLED,
          },
        ],
        returnTransactions: [],
      });

      await expect(
        service.commitReturnOperation(
          'op-001',
          mockTechnician,
          [
            {
              borrowDetailId: lineDetailId,
              returnedQuantity: 2, // Cố tình trả 2 chiếc > 1
              condition: 'GOOD',
              locationId: null,
              notes: null,
            },
          ],
          null,
          validIdemKey
        )
      ).rejects.toThrowError(/vượt quá số lượng đang mượn còn lại/);
    });

    it('TC-S4C-ALLOC-01: [P1.3 / Issue #43] Từ chối hoàn trả nếu số lượng vượt quá phân bổ xuất kho còn lại của phiếu tại kho nguồn (409)', async () => {
      const lineDetailId = '22222222-2222-4222-8222-222222222222';
      const locKhoA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const locKhoB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

      // Phiếu mượn xuất 10 chiếc: 4 chiếc từ Kho A, 6 chiếc từ Kho B
      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-002',
        requestNumber: 'BR-20261110-0002',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineDetailId,
            itemId: 'item-uuid-002',
            quantity: 10,
            returnedQuantity: 0, // Đang mượn còn 10 chiếc
            item: { id: 'item-uuid-002', name: 'Linh kiện X' },
          },
        ],
        reservations: [
          {
            id: 'res-002-a',
            itemId: 'item-uuid-002',
            locationId: locKhoA,
            quantity: 4,
            status: ReservationStatus.FULFILLED,
          },
          {
            id: 'res-002-b',
            itemId: 'item-uuid-002',
            locationId: locKhoB,
            quantity: 6,
            status: ReservationStatus.FULFILLED,
          },
        ],
        returnTransactions: [],
      });

      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        id: 'bal-kho-a',
        itemId: 'item-uuid-002',
        locationId: locKhoA,
        onHand: 10,
        borrowed: 20,
        quarantined: 0,
      });

      // Cố tình hoàn trả 5 chiếc từ Kho A (vượt quá hạn ngạch 4 chiếc đã xuất từ Kho A của phiếu này)
      // Chú ý: Dòng chi tiết còn 10 chiếc, nên vượt qua bước kiểm tra remaining của detail và kích hoạt chính xác kiểm tra hạn ngạch nguồn (P1.3)!
      await expect(
        service.commitReturnOperation(
          'op-002',
          mockTechnician,
          [
            {
              borrowDetailId: lineDetailId,
              returnedQuantity: 5,
              condition: 'GOOD',
              sourceLocationId: locKhoA,
              locationId: null,
              notes: null,
            },
          ],
          null,
          validIdemKey
        )
      ).rejects.toThrowError(/vượt quá phân bổ xuất kho còn lại \(4\) từ kho nguồn/);
    });

    it('TC-S4C-ALLOC-02: Từ chối trùng dòng borrowDetailId trong danh sách commit (422)', async () => {
      const lineDetailId = '33333333-3333-4333-8333-333333333333';

      await expect(
        service.commitReturnOperation(
          'op-003',
          mockTechnician,
          [
            {
              borrowDetailId: lineDetailId,
              returnedQuantity: 1,
              condition: 'GOOD',
              locationId: null,
              notes: null,
            },
            {
              borrowDetailId: lineDetailId, // Trùng ID dòng mượn
              returnedQuantity: 1,
              condition: 'GOOD',
              locationId: null,
              notes: null,
            },
          ],
          null,
          validIdemKey
        )
      ).rejects.toThrowError(/trùng dòng chi tiết mượn/);
    });

    it('TC-S4C-11: [P1.3 / Issue #43] Trả chéo kho từ nguồn đa kho: Thử không truyền nguồn bị từ chối 409; truyền nguồn chính xác được giải trừ đúng kho', async () => {
      const lineDetailId = '44444444-4444-4444-8444-444444444444';
      const locKhoA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const locKhoB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const locKhoC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

      // Phiếu mượn xuất từ cả Kho A (5 chiếc) và Kho B (5 chiếc)
      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-006',
        requestNumber: 'BR-20261110-0006',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineDetailId,
            itemId: 'item-uuid-006',
            quantity: 10,
            returnedQuantity: 0,
            item: { id: 'item-uuid-006', name: 'Bo mạch STM32' },
          },
        ],
        reservations: [
          {
            id: 'res-006-a',
            itemId: 'item-uuid-006',
            locationId: locKhoA,
            quantity: 5,
            status: ReservationStatus.FULFILLED,
          },
          {
            id: 'res-006-b',
            itemId: 'item-uuid-006',
            locationId: locKhoB,
            quantity: 5,
            status: ReservationStatus.FULFILLED,
          },
        ],
        returnTransactions: [],
      });

      mockPrisma.stockBalance.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.itemId_locationId.locationId === locKhoA) {
          return { id: 'bal-kho-a', itemId: 'item-uuid-006', locationId: locKhoA, onHand: 0, borrowed: 5, quarantined: 0 };
        }
        if (where.itemId_locationId.locationId === locKhoB) {
          return { id: 'bal-kho-b', itemId: 'item-uuid-006', locationId: locKhoB, onHand: 0, borrowed: 5, quarantined: 0 };
        }
        if (where.itemId_locationId.locationId === locKhoC) {
          return { id: 'bal-kho-c', itemId: 'item-uuid-006', locationId: locKhoC, onHand: 10, borrowed: 0, quarantined: 0 };
        }
        return null;
      });

      // TH1: Khi có nhiều kho nguồn mà không truyền sourceLocationId -> BẮT BUỘC FAIL-CLOSED 409
      await expect(
        service.commitReturnOperation(
          'op-006',
          mockTechnician,
          [
            {
              borrowDetailId: lineDetailId,
              returnedQuantity: 3,
              condition: 'GOOD',
              locationId: locKhoC,
              notes: 'Không truyền sourceLocationId',
            },
          ],
          null,
          'idem-multi-fail-001'
        )
      ).rejects.toThrowError(/Không thể xác định duy nhất kho nguồn/);

      // TH2: Truyền rõ sourceLocationId: Kho A và trả về Kho C -> Hợp lệ và giải trừ chuẩn xác
      mockPrisma.borrowDetail.findMany.mockResolvedValue([
        { id: lineDetailId, quantity: 10, returnedQuantity: 3 },
      ]);

      const result = await service.commitReturnOperation(
        'op-006',
        mockTechnician,
        [
          {
            borrowDetailId: lineDetailId,
            returnedQuantity: 3,
            condition: 'GOOD',
            sourceLocationId: locKhoA,
            locationId: locKhoC,
            notes: 'Trả từ kho A sang kho C',
          },
        ],
        null,
        validIdemKey
      );

      expect(result.state).toBe('COMPLETED');

      // Giảm borrowed tại kho nguồn A đúng 3 chiếc (onHand A giữ nguyên)
      expect(mockPrisma.stockBalance.update).toHaveBeenCalledWith({
        where: { id: 'bal-kho-a' },
        data: { borrowed: { decrement: 3 } },
      });

      // Tăng onHand tại kho đích C đúng 3 chiếc
      expect(mockPrisma.stockBalance.upsert).toHaveBeenCalledWith({
        where: { itemId_locationId: { itemId: 'item-uuid-006', locationId: locKhoC } },
        update: { onHand: { increment: 3 } },
        create: { itemId: 'item-uuid-006', locationId: locKhoC, onHand: 3 },
      });

      // Ghi nhận 2 bút toán StockMovement
      expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          locationId: locKhoA,
          referenceType: 'RETURN_CROSS_SOURCE_RELIEF',
        }),
      });
      expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          locationId: locKhoC,
          type: StockTransactionType.IMPORT,
          quantityDelta: 3,
          referenceType: 'RETURN',
        }),
      });
    });

    it('TC-S4C-12: [Tiêu chí 5] Hàng mất (LOST): Chỉ giảm borrowed, onHand giữ nguyên', async () => {
      const lineDetailId = '55555555-5555-4555-8555-555555555555';
      const locKho = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-007',
        requestNumber: 'BR-20261110-0007',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineDetailId,
            itemId: 'item-uuid-007',
            quantity: 3,
            returnedQuantity: 0,
            item: { id: 'item-uuid-007', name: 'Mô-đun GPS' },
          },
        ],
        reservations: [
          {
            id: 'res-007',
            itemId: 'item-uuid-007',
            locationId: locKho,
            quantity: 3,
            status: ReservationStatus.FULFILLED,
          },
        ],
        returnTransactions: [],
      });

      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        id: 'bal-007',
        itemId: 'item-uuid-007',
        locationId: locKho,
        onHand: 15,
        borrowed: 3,
        quarantined: 0,
      });

      mockPrisma.borrowDetail.findMany.mockResolvedValue([
        { id: lineDetailId, quantity: 3, returnedQuantity: 3 },
      ]);

      const result = await service.commitReturnOperation(
        'op-007',
        mockTechnician,
        [
          {
            borrowDetailId: lineDetailId,
            returnedQuantity: 3,
            condition: 'LOST',
            locationId: null,
            notes: 'Mất hoàn toàn',
          },
        ],
        null,
        validIdemKey
      );

      expect(result.state).toBe('COMPLETED');
      // LOST: Chỉ giảm borrowed, KHÔNG tăng onHand
      expect(mockPrisma.stockBalance.update).toHaveBeenCalledWith({
        where: { id: 'bal-007' },
        data: { borrowed: { decrement: 3 } },
      });
      expect(mockPrisma.stockBalance.upsert).not.toHaveBeenCalled();

      // Ghi nhận StockMovement loại RETURN_LOST
      expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: StockTransactionType.EXPORT,
          quantityDelta: 0,
          referenceType: 'RETURN_LOST',
        }),
      });
    });

    it('TC-S4C-13: [Vấn đề B & Tiêu chí 9] Khôi phục Idempotent an toàn khi thao tác đã COMPLETED và ReturnTransaction hợp lệ', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (sqlQuery: any) => {
        const text = String(sqlQuery);
        if (text.includes('borrow_return_operations') && text.includes('WHERE "id"')) {
          return [
            {
              id: 'op-008',
              borrow_request_id: 'borrow-008',
              state: 'COMPLETED',
              physical_evidence_ref: 'EVID-TEST-008',
              received_by_id: mockTechnician.id,
              payload_hash: null,
              payload_snapshot: null,
            },
          ];
        }
        return [];
      });

      mockPrisma.returnTransaction.findFirst.mockResolvedValue({
        id: 'rt-uuid-001',
        returnNumber: 'RT-20261110-0001',
      });

      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-008',
        status: BorrowStatus.RETURNED,
      });

      const result = await service.commitReturnOperation(
        'op-008',
        mockTechnician,
        undefined,
        null,
        validIdemKey
      );
      expect(result.state).toBe('COMPLETED');
      expect(result.returnNumber).toBe('RT-20261110-0001');
      // Không thực thi lại cập nhật kho
      expect(mockPrisma.stockBalance.update).not.toHaveBeenCalled();
    });

    it('TC-S4C-IDEM-04: Từ chối khôi phục khi operation COMPLETED nhưng không tìm thấy ReturnTransaction thật (409)', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (sqlQuery: any) => {
        const text = String(sqlQuery);
        if (text.includes('borrow_return_operations') && text.includes('WHERE "id"')) {
          return [
            {
              id: 'op-009',
              borrow_request_id: 'borrow-009',
              state: 'COMPLETED',
              physical_evidence_ref: 'EVID-TEST-009',
              received_by_id: mockTechnician.id,
              return_transaction_id: 'rt-nonexistent',
              payload_hash: null,
              payload_snapshot: null,
            },
          ];
        }
        return [];
      });

      mockPrisma.returnTransaction.findFirst.mockResolvedValue(null);
      mockPrisma.returnTransaction.findUnique.mockResolvedValue(null);

      await expect(
        service.commitReturnOperation(
          'op-009',
          mockTechnician,
          undefined,
          null,
          validIdemKey
        )
      ).rejects.toThrowError(/chứng từ hoàn trả tương ứng/);
    });

    it('TC-S4C-IDEM-05: [P1.4] Khôi phục theo IdempotencyRecord COMPLETED phải xác minh chứng từ ReturnTransaction thật trong DB (409)', async () => {
      const expectedHash = idempotencyService.generateFingerprint(
        mockTechnician.id,
        '/api/v1/borrow-return-operations/op-005/commit',
        {
          operationId: 'op-005',
          items: undefined,
          notes: undefined,
        }
      );

      mockPrisma.idempotencyRecord.findUnique.mockResolvedValue({
        id: 'idem-rec-005',
        key: validIdemKey,
        userId: mockTechnician.id,
        endpoint: '/api/v1/borrow-return-operations/op-005/commit',
        requestHash: expectedHash,
        status: 'COMPLETED',
        responseBody: {
          returnNumber: 'RT-20261110-0001',
          returnTransactionId: 'rt-ghost-001',
        },
      });

      // ReturnTransaction bị xóa hoặc không tồn tại trong DB -> Phải từ chối 409
      mockPrisma.returnTransaction.findUnique.mockResolvedValue(null);

      await expect(
        service.commitReturnOperation('op-005', mockTechnician, undefined, undefined, validIdemKey)
      ).rejects.toThrowError(/không còn tồn tại trên hệ thống/);
    });

    it('TC-S4C-PG17-06: [P1.3 / PG17-06] Hai BorrowDetail có cùng itemId được đối soát độc lập qua sổ phân bổ có cấu trúc, không cộng nhầm quota', async () => {
      const detailId1 = '11111111-1111-4111-8111-111111111111';
      const detailId2 = '22222222-2222-4222-8222-222222222222';
      const sameItemId = '99999999-9999-4999-8999-999999999999';
      const locKhoA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-pg17-06',
        requestNumber: 'BR-20261110-0088',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: detailId1,
            itemId: sameItemId,
            quantity: 5,
            returnedQuantity: 3, // Dòng 1 đã trả 3 chiếc trước đó
            item: { id: sameItemId, name: 'Cáp USB Type-C' },
          },
          {
            id: detailId2,
            itemId: sameItemId,
            quantity: 5,
            returnedQuantity: 0, // Dòng 2 chưa trả chiếc nào
            item: { id: sameItemId, name: 'Cáp USB Type-C' },
          },
        ],
        reservations: [
          {
            id: 'res-pg-01',
            itemId: sameItemId,
            locationId: locKhoA,
            quantity: 10,
            status: ReservationStatus.FULFILLED,
          },
        ],
        returnTransactions: [],
      });

      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        id: 'bal-kho-a',
        itemId: sameItemId,
        locationId: locKhoA,
        onHand: 10,
        borrowed: 7,
        quarantined: 0,
      });

      // Sổ phân bổ có cấu trúc ghi nhận: detailId1 đã giải trừ 3 chiếc, detailId2 giải trừ 0 chiếc
      mockPrisma.$queryRaw.mockImplementation(async (sql: any) => {
        const text = String(sql);
        if (text.includes('borrow_return_operations') && text.includes('WHERE "id"')) {
          return [
            {
              id: 'op-pg17-06',
              borrow_request_id: 'borrow-pg17-06',
              state: 'PREPARED',
              physical_evidence_ref: 'EVID-PG17-06',
              received_by_id: mockTechnician.id,
              payload_hash: null,
              payload_snapshot: null,
            },
          ];
        }
        if (text.includes('borrow_return_source_allocations')) {
          if (text.includes(detailId1)) {
            return [{ relieved_qty: 3 }];
          }
          if (text.includes(detailId2)) {
            return [{ relieved_qty: 0 }];
          }
        }
        return [];
      });

      mockPrisma.borrowDetail.findMany.mockResolvedValue([
        { id: detailId2, quantity: 5, returnedQuantity: 5 },
      ]);

      // Hoàn trả 5 chiếc cho detailId2 -> Thành công vì detailId2 chưa bị giải trừ, không bị cộng nhầm từ detailId1!
      const result = await service.commitReturnOperation(
        'op-pg17-06',
        mockTechnician,
        [
          {
            borrowDetailId: detailId2,
            returnedQuantity: 5,
            condition: 'GOOD',
            sourceLocationId: locKhoA,
            locationId: locKhoA,
            notes: 'Trả toàn bộ 5 chiếc cho detail 2',
          },
        ],
        null,
        'idem-pg17-06-key'
      );

      expect(result.state).toBe('COMPLETED');
      expect(mockPrisma.borrowDetail.update).toHaveBeenCalledWith({
        where: { id: detailId2 },
        data: { returnedQuantity: { increment: 5 } },
      });
    });
  });

  // --- P1.1: API CUTOVER EXECUTOR TESTS ---
  describe('P1.1: API Cutover Executor (executeDirectReturn)', () => {
    it('TC-S4C-CUTOVER-01: Thực hiện thành công trọn gói 2 pha qua executeDirectReturn', async () => {
      const lineDetailId = '11111111-1111-4111-8111-111111111111';
      const locKho = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      mockPrisma.borrowRequest.findUnique.mockResolvedValue({
        id: 'borrow-cutover-001',
        requestNumber: 'BR-20261110-0099',
        status: BorrowStatus.HANDED_OVER,
        details: [
          {
            id: lineDetailId,
            itemId: 'item-uuid-001',
            quantity: 2,
            returnedQuantity: 0,
            item: { id: 'item-uuid-001', code: 'IT-001', name: 'Arduino', unit: 'Cái' },
          },
        ],
        reservations: [
          {
            id: 'res-001',
            itemId: 'item-uuid-001',
            locationId: locKho,
            quantity: 2,
            status: ReservationStatus.FULFILLED,
            location: { id: locKho, code: 'KHO-A', name: 'Kho A' },
          },
        ],
        returnTransactions: [],
      });

      mockPrisma.stockBalance.findUnique.mockResolvedValue({
        id: 'bal-001',
        itemId: 'item-uuid-001',
        locationId: locKho,
        onHand: 10,
        borrowed: 2,
        quarantined: 0,
      });

      mockPrisma.borrowDetail.findMany.mockResolvedValue([
        { id: lineDetailId, quantity: 2, returnedQuantity: 2 },
      ]);

      const result = await service.executeDirectReturn(
        'borrow-cutover-001',
        {
          items: [
            {
              borrowDetailId: lineDetailId,
              returnedQuantity: 2,
              condition: 'GOOD',
            },
          ],
        },
        mockTechnician,
        'idem-key-cutover-001'
      );

      expect(result.returnNumber).toBeDefined();
      expect(result.borrowRequest).toBeDefined();
      expect(result.borrowRequest.id).toBe('borrow-cutover-001');
    });
  });

  // --- P1.5: DETERMINISTIC SEQUENTIAL RETURN NUMBER GENERATOR ---
  describe('P1.5: Sequential Return Number Generator', () => {
    it('TC-S4C-SEQ-01: Sinh mã tuần tự tăng dần từ RT-YYYYMMDD-0001 nếu chưa có biên nhận nào trong ngày', async () => {
      mockPrisma.returnTransaction.findFirst.mockResolvedValue(null);

      const num = await generateReturnNumber(mockPrisma);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(num).toBe(`RT-${dateStr}-0001`);
    });

    it('TC-S4C-SEQ-02: Tăng tuần tự lên RT-YYYYMMDD-0006 nếu đã có RT-YYYYMMDD-0005', async () => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      mockPrisma.returnTransaction.findFirst.mockResolvedValue({
        returnNumber: `RT-${dateStr}-0005`,
      });

      const num = await generateReturnNumber(mockPrisma);
      expect(num).toBe(`RT-${dateStr}-0006`);
    });
  });
});
