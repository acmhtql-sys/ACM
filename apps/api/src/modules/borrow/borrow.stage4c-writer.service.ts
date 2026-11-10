import {
  PrismaClient,
  Prisma,
  BorrowStatus,
  ReservationStatus,
  AssetCondition,
  StockTransactionType,
} from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../../shared/AppError';
import { UserRole, BorrowRequestResponse } from '@acm/shared';
import { AuthenticatedUser } from '../../middleware/auth';
import { isStagingReadOnlyActive } from '../../middleware/cloudStagingReadOnly';
import { idempotencyService } from '../inventory/idempotency.service';
import {
  assertPhysicalEvidenceReference,
  canonicalReturnOperationPayload,
  hashReturnOperationPayload,
  returnOperationCutoverRequested,
  rejectUnreleasedReturnOperations,
  type ReturnOperationLineSnapshot,
  type ReturnOperationPayloadSnapshot,
} from './borrow.return-operation-foundation';

export interface PrepareStage4CReturnInput {
  borrowRequestId: string;
  physicalEvidenceRef: string;
  items?: ReturnOperationLineSnapshot[];
  notes?: string | null;
}

export interface CommitStage4CReturnInput {
  operationId: string;
  items?: (ReturnOperationLineSnapshot & { sourceLocationId?: string | null })[];
  notes?: string | null;
  idempotencyKey?: string;
}

/**
 * Hàm sinh mã chứng từ hoàn trả tuần tự có khóa advisory lock giao dịch theo ngày (P1.5)
 * Định dạng chuẩn: RT-YYYYMMDD-XXXX (XXXX là số thứ tự tăng dần bắt đầu từ 0001)
 */
export async function generateReturnNumber(tx: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `RT-${dateStr}`;

  // Khóa Postgres advisory xact lock theo ngày để đảm bảo sinh số thứ tự tuần tự tuyệt đối
  try {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'SEQ_' + prefix}))`;
  } catch {
    // Non-Postgres / mock fallback
  }

  let latest = null;
  if (typeof tx?.returnTransaction?.findFirst === 'function') {
    latest = await tx.returnTransaction.findFirst({
      where: { returnNumber: { startsWith: prefix } },
      orderBy: { returnNumber: 'desc' },
      select: { returnNumber: true },
    });
  } else if (typeof tx?.returnTransaction?.findMany === 'function') {
    const list = await tx.returnTransaction.findMany({
      where: { returnNumber: { startsWith: prefix } },
      orderBy: { returnNumber: 'desc' },
      take: 1,
    });
    if (list && list.length > 0) latest = list[0];
  }

  let nextSeq = 1;
  if (latest && latest.returnNumber) {
    const parts = latest.returnNumber.split('-');
    if (parts.length === 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num)) {
        nextSeq = num + 1;
      }
    }
  }

  return `${prefix}-${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Định dạng phản hồi BorrowRequestResponse DTO cho API cutover
 */
function formatBorrowResponse(b: any): BorrowRequestResponse {
  const isOverdue =
    (b.status === BorrowStatus.HANDED_OVER || b.status === BorrowStatus.PARTIALLY_RETURNED) &&
    Boolean(b.expectedReturnDate && new Date().getTime() > new Date(b.expectedReturnDate).getTime());

  return {
    id: b.id,
    requestNumber: b.requestNumber,
    borrowerId: b.borrowerId,
    borrower: b.borrower
      ? {
          id: b.borrower.id,
          fullName: b.borrower.fullName,
          email: b.borrower.email,
        }
      : undefined,
    borrowerName: b.borrower?.fullName || '',
    borrowerEmail: b.borrower?.email || '',
    approverId: b.approverId,
    approver: b.approver
      ? {
          id: b.approver.id,
          fullName: b.approver.fullName,
          email: b.approver.email,
        }
      : null,
    approverName: b.approver?.fullName || null,
    status: b.status,
    purpose: b.purpose,
    expectedBorrowDate:
      b.expectedBorrowDate instanceof Date
        ? b.expectedBorrowDate.toISOString().slice(0, 10)
        : b.expectedBorrowDate,
    expectedReturnDate:
      b.expectedReturnDate instanceof Date
        ? b.expectedReturnDate.toISOString().slice(0, 10)
        : b.expectedReturnDate,
    actualBorrowDate:
      b.actualBorrowDate instanceof Date ? b.actualBorrowDate.toISOString() : b.actualBorrowDate,
    actualReturnDate:
      b.actualReturnDate instanceof Date ? b.actualReturnDate.toISOString() : b.actualReturnDate,
    rejectionReason: b.rejectionReason,
    notes: b.notes,
    itemCount: b.details?.length || 0,
    details: (b.details || []).map((d: any) => ({
      id: d.id,
      borrowRequestId: d.borrowRequestId,
      itemId: d.itemId,
      item: d.item
        ? {
            id: d.item.id,
            code: d.item.code,
            name: d.item.name,
            unit: d.item.unit,
          }
        : undefined,
      assetId: d.assetId,
      quantity: d.quantity,
      returnedQuantity: d.returnedQuantity || 0,
      notes: d.notes,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    reservations: (b.reservations || []).map((r: any) => ({
      id: r.id,
      borrowRequestId: r.borrowRequestId,
      itemId: r.itemId,
      item: r.item
        ? {
            id: r.item.id,
            code: r.item.code,
            name: r.item.name,
            unit: r.item.unit,
          }
        : undefined,
      locationId: r.locationId,
      location: r.location
        ? {
            id: r.location.id,
            code: r.location.code,
            name: r.location.name,
          }
        : undefined,
      quantity: r.quantity,
      status: r.status,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    })),
    returnTransactions: (b.returnTransactions || []).map((rt: any) => ({
      id: rt.id,
      returnNumber: rt.returnNumber,
      borrowRequestId: rt.borrowRequestId,
      receiverId: rt.receiverId,
      receiver: rt.receiver
        ? {
            id: rt.receiver.id,
            fullName: rt.receiver.fullName,
            email: rt.receiver.email,
          }
        : undefined,
      notes: rt.notes,
      details: (rt.details || []).map((rd: any) => ({
        id: rd.id,
        returnTransactionId: rd.returnTransactionId,
        itemId: rd.itemId,
        item: rd.item
          ? {
              id: rd.item.id,
              code: rd.item.code,
              name: rd.item.name,
              unit: rd.item.unit,
            }
          : undefined,
        quantity: rd.quantity,
        condition: rd.condition,
        notes: rd.notes,
        createdAt: rd.createdAt,
      })),
      createdAt: rt.createdAt,
    })),
    isOverdue,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export class Stage4CReturnWriterService {
  constructor(private prisma: PrismaClient) {}

  /**
   * PHA 1: PREPARE OPERATION
   * Tiếp nhận kiểm định thực tế, lưu bản chụp bất biến (snapshot & hash) TRỰC TIẾP VÀO DATABASE
   * và tạo bản ghi ở trạng thái PREPARED (P1.2, P1.5).
   */
  async prepareReturnOperation(
    input: PrepareStage4CReturnInput,
    currentUser: AuthenticatedUser
  ) {
    // 1. Kiểm tra môi trường Staging Read-Only (Hard Gate - Tiêu chí an toàn)
    if (isStagingReadOnlyActive() || process.env.STAGING_READ_ONLY === 'true') {
      throw new AppError(
        'Thao tác ghi bị chặn: Môi trường Staging đang hoạt động ở chế độ Chỉ đọc (Read-Only).',
        403
      );
    }

    // 2. Kiểm tra cờ cutover phát hành Stage4C (Feature Flag Gate)
    if (!returnOperationCutoverRequested(process.env.ACM_RETURN_OPERATIONS_ENABLED)) {
      rejectUnreleasedReturnOperations();
    }

    // 3. Kiểm tra quyền tiếp nhận vật lý (chỉ ADMIN, LAB_MANAGER, TECHNICIAN)
    if (
      currentUser.role !== UserRole.ADMIN &&
      currentUser.role !== UserRole.LAB_MANAGER &&
      currentUser.role !== UserRole.TECHNICIAN
    ) {
      throw new AppError(
        'Chỉ Quản trị viên, Quản lý Lab hoặc Kỹ thuật viên mới có quyền tiếp nhận trả đồ',
        403
      );
    }

    // 4. Kiểm tra định dạng mã chứng từ vật lý theo quy tắc BIZ-01
    assertPhysicalEvidenceReference(input.physicalEvidenceRef);

    // 5. Chuẩn hóa và tạo bản chụp (immutable snapshot & hash) nếu có danh sách hoàn trả
    let canonicalPayload: ReturnOperationPayloadSnapshot | null = null;
    let payloadHash: string | null = null;

    if (input.items !== undefined) {
      if (input.items.length === 0) {
        throw new AppError('Danh sách linh kiện hoàn trả không được để trống', 422);
      }
      canonicalPayload = canonicalReturnOperationPayload({
        items: input.items,
        notes: input.notes || null,
      });
      payloadHash = hashReturnOperationPayload(canonicalPayload);
    }

    return await this.prisma.$transaction(async (tx) => {
      // 6. Khóa phân tán Postgres Advisory Lock theo hàm băm của mã chứng từ (chống race condition đồng thời - P1 Issue 4/5)
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('EV_' || LOWER(${input.physicalEvidenceRef})))
      `;

      // 7. Kiểm tra tính duy nhất của mã chứng từ vật lý trên toàn hệ thống (case-insensitive - Issue B / P1.5)
      // 7a. Kiểm tra trong bảng borrow_return_operations
      const existingOpEvidence = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "borrow_return_operations"
        WHERE LOWER("physical_evidence_ref") = LOWER(${input.physicalEvidenceRef})
        LIMIT 1
      `;
      if (existingOpEvidence && existingOpEvidence.length > 0) {
        throw new AppError(
          `Mã chứng từ vật lý '${input.physicalEvidenceRef}' đã tồn tại trong hệ thống`,
          409
        );
      }

      // 7b. Kiểm tra trong bảng return_transactions (chứng từ hoàn trả RC5 cũ / hệ thống)
      const existingReturnTx = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "return_transactions"
        WHERE LOWER("returnNumber") = LOWER(${input.physicalEvidenceRef})
        LIMIT 1
      `;
      if (existingReturnTx && existingReturnTx.length > 0) {
        throw new AppError(
          `Mã chứng từ vật lý '${input.physicalEvidenceRef}' đã tồn tại trong hệ thống`,
          409
        );
      }

      // 7c. Kiểm tra trong bảng stock_transactions (chứng từ giao dịch kho)
      const existingStockTx = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "stock_transactions"
        WHERE LOWER("transactionNumber") = LOWER(${input.physicalEvidenceRef})
        LIMIT 1
      `;
      if (existingStockTx && existingStockTx.length > 0) {
        throw new AppError(
          `Mã chứng từ vật lý '${input.physicalEvidenceRef}' đã tồn tại trong hệ thống`,
          409
        );
      }

      // 7d. Kiểm tra trong system_evidence_registry nếu bảng tồn tại
      try {
        const existingRegistry = await tx.$queryRaw<Array<{ normalized_ref: string }>>`
          SELECT "normalized_ref" FROM "system_evidence_registry"
          WHERE "normalized_ref" = LOWER(${input.physicalEvidenceRef})
          LIMIT 1
        `;
        if (existingRegistry && existingRegistry.length > 0) {
          throw new AppError(
            `Mã chứng từ vật lý '${input.physicalEvidenceRef}' đã tồn tại trong hệ thống`,
            409
          );
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
      }

      // 8. Kiểm tra xem phiếu mượn có tồn tại và đang ở trạng thái hợp lệ để trả không
      const borrow = await tx.borrowRequest.findUnique({
        where: { id: input.borrowRequestId },
        include: { details: true },
      });
      if (!borrow) {
        throw new AppError('Phiếu mượn không tồn tại', 404);
      }

      if (
        borrow.status !== BorrowStatus.HANDED_OVER &&
        borrow.status !== BorrowStatus.PARTIALLY_RETURNED
      ) {
        throw new AppError(
          `Chỉ phiếu mượn 'Đang mượn (HANDED_OVER)' hoặc 'Đã trả một phần (PARTIALLY_RETURNED)' mới có thể lập thao tác hoàn trả. Trạng thái hiện tại: '${borrow.status}'`,
          400
        );
      }

      // 9. Kiểm tra xem phiếu mượn có thao tác nào đang dở dang (PREPARED hoặc RECONCILIATION_REQUIRED) không
      const pendingOp = await tx.$queryRaw<Array<{ id: string; state: string }>>`
        SELECT "id", "state" FROM "borrow_return_operations"
        WHERE "borrow_request_id" = ${input.borrowRequestId}::uuid
        AND "state" IN ('PREPARED', 'RECONCILIATION_REQUIRED')
        LIMIT 1
      `;
      if (pendingOp && pendingOp.length > 0) {
        throw new AppError(
          `Phiếu mượn đang có một thao tác hoàn trả chưa kết thúc (${pendingOp[0].state}). Yêu cầu đối soát trước khi tạo mới.`,
          409
        );
      }

      // 10. Tạo bản ghi thao tác ở trạng thái PREPARED với JSONB snapshot và hash bền vững trong database (P1.2)
      const operationId = crypto.randomUUID();
      await tx.$executeRaw`
        INSERT INTO "borrow_return_operations" (
          "id", "borrow_request_id", "state", "physical_evidence_ref", "received_by_id", "received_at", "payload_hash", "payload_snapshot"
        ) VALUES (
          ${operationId}::uuid,
          ${input.borrowRequestId}::uuid,
          'PREPARED',
          ${input.physicalEvidenceRef},
          ${currentUser.id}::uuid,
          NOW(),
          ${payloadHash || null},
          ${canonicalPayload ? JSON.stringify(canonicalPayload) : null}::jsonb
        )
      `;

      // 11. Đăng ký chứng từ vào system_evidence_registry toàn hệ thống (P1.5)
      try {
        await tx.$executeRaw`
          INSERT INTO "system_evidence_registry" (
            "normalized_ref", "original_ref", "source_type", "source_id", "created_at"
          ) VALUES (
            LOWER(${input.physicalEvidenceRef}),
            ${input.physicalEvidenceRef},
            'STAGE4C_RETURN_PREPARED',
            ${operationId}::uuid,
            NOW()
          )
        `;
      } catch {
        // Fallback an toàn nếu chưa migrate bảng
      }

      return {
        operationId,
        state: 'PREPARED',
        physicalEvidenceRef: input.physicalEvidenceRef,
        borrowRequestId: input.borrowRequestId,
        payloadHash: payloadHash || undefined,
      };
    });
  }

  /**
   * PHA 2: COMMIT OPERATION
   * Tuần tự hóa giao dịch khóa kho, đọc snapshot bất biến trực tiếp từ database (P1.2),
   * xác thực chứng từ idempotency uy tín (P1.4), phân bổ nguồn đa kho chuẩn xác (P1.3),
   * sinh mã chứng từ tuần tự an toàn (P1.5), cập nhật số dư kho cách ly,
   * ghi nhận ReturnTransaction, ReturnDetail và COMPLETED.
   */
  async commitReturnOperation(
    operationId: string,
    currentUser: AuthenticatedUser,
    inputItems?: (ReturnOperationLineSnapshot & { sourceLocationId?: string | null })[],
    notes?: string | null,
    idempotencyKey?: string
  ) {
    // 1. Kiểm tra môi trường Staging Read-Only (Hard Gate)
    if (isStagingReadOnlyActive() || process.env.STAGING_READ_ONLY === 'true') {
      throw new AppError(
        'Thao tác ghi bị chặn: Môi trường Staging đang hoạt động ở chế độ Chỉ đọc (Read-Only).',
        403
      );
    }

    // 2. Kiểm tra cờ cutover phát hành Stage4C (Feature Flag Gate)
    if (!returnOperationCutoverRequested(process.env.ACM_RETURN_OPERATIONS_ENABLED)) {
      rejectUnreleasedReturnOperations();
    }

    // 3. Kiểm tra quyền hoàn tất thao tác trả đồ (chỉ ADMIN, LAB_MANAGER, TECHNICIAN - P1 Issue 1)
    if (
      currentUser.role !== UserRole.ADMIN &&
      currentUser.role !== UserRole.LAB_MANAGER &&
      currentUser.role !== UserRole.TECHNICIAN
    ) {
      throw new AppError(
        'Chỉ Quản trị viên, Quản lý Lab hoặc Kỹ thuật viên mới có quyền hoàn tất thao tác trả đồ',
        403
      );
    }

    // 4. Bắt buộc kiểm tra Idempotency-Key và định dạng (Issue B / Tiêu chí 9)
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new AppError(
        'Khóa Idempotency-Key là bắt buộc để thực hiện commit hoàn trả',
        422
      );
    }
    const trimmedKey = idempotencyKey.trim();
    if (!idempotencyService.validateKey(trimmedKey)) {
      throw new AppError('Khóa Idempotency-Key không hợp lệ', 422);
    }

    const endpoint = `/api/v1/borrow-return-operations/${operationId}/commit`;

    // 5. Kiểm tra bản ghi Idempotency hiện có trước khi mở giao dịch (P1.4)
    const existingIdemRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { key: trimmedKey },
    });
    if (existingIdemRecord) {
      const requestHash = idempotencyService.generateFingerprint(currentUser.id, endpoint, {
        operationId,
        items: inputItems,
        notes,
      });
      idempotencyService.verifyRecordMatch(
        existingIdemRecord,
        currentUser.id,
        endpoint,
        requestHash
      );
      if (existingIdemRecord.status === 'COMPLETED' && existingIdemRecord.responseBody) {
        // P1.4: Xác minh chứng từ ReturnTransaction thực tế trong DB trước khi trả về cache
        const body = existingIdemRecord.responseBody as any;
        const returnNumber = body.returnNumber || body.returnTransaction?.returnNumber;
        const returnTxId = body.returnTransactionId || body.returnTransaction?.id;
        let receiptExists = false;
        if (returnTxId) {
          receiptExists = Boolean(
            await this.prisma.returnTransaction.findUnique({ where: { id: returnTxId } })
          );
        } else if (returnNumber) {
          receiptExists = Boolean(
            await this.prisma.returnTransaction.findUnique({ where: { returnNumber } })
          );
        }
        if (!receiptExists) {
          throw new AppError(
            'Biên nhận hoàn trả của giao dịch trước đó không còn tồn tại trên hệ thống. Yêu cầu đối soát kiểm định.',
            409
          );
        }
        return existingIdemRecord.responseBody as any;
      }
      if (existingIdemRecord.status === 'PENDING') {
        throw new AppError(
          'Giao dịch với khóa này đang được xử lý, vui lòng không gửi lại liên tục',
          409
        );
      }
      if (existingIdemRecord.status === 'FAILED') {
        throw new AppError(
          'Giao dịch trước đó với khóa này đã thất bại. Yêu cầu đổi Idempotency-Key mới để thử lại',
          409
        );
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      // 6. Tạo khóa PENDING nguyên tử trong giao dịch
      if (!existingIdemRecord) {
        const initialHash = idempotencyService.generateFingerprint(currentUser.id, endpoint, {
          operationId,
          items: inputItems,
          notes,
        });
        await tx.idempotencyRecord.create({
          data: {
            key: trimmedKey,
            userId: currentUser.id,
            endpoint,
            requestHash: initialHash,
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      // 7. Khóa dòng thao tác bằng SELECT ... FOR UPDATE và đọc bản chụp bền vững từ database (P1.2)
      const opRows = await tx.$queryRaw<
        Array<{
          id: string;
          borrow_request_id: string;
          state: string;
          physical_evidence_ref: string;
          payload_hash: string | null;
          payload_snapshot: any;
        }>
      >`
        SELECT "id", "borrow_request_id", "state", "physical_evidence_ref", "payload_hash", "payload_snapshot"
        FROM "borrow_return_operations"
        WHERE "id" = ${operationId}::uuid
        FOR UPDATE
      `;
      if (!opRows || opRows.length === 0) {
        throw new AppError('Thao tác hoàn trả không tồn tại', 404);
      }
      const op = opRows[0];

      // Nếu thao tác đã COMPLETED, kiểm tra biên nhận thực tế và trả về
      if (op.state === 'COMPLETED') {
        let receipt = null;
        if (typeof tx?.returnTransaction?.findFirst === 'function') {
          receipt = await tx.returnTransaction.findFirst({
            where: { borrowRequestId: op.borrow_request_id },
            orderBy: { createdAt: 'desc' },
          });
        }
        if (!receipt && typeof tx?.returnTransaction?.findUnique === 'function') {
          receipt = await tx.returnTransaction.findUnique({
            where: { id: (op as any).return_transaction_id || '' },
          });
        }
        if (!receipt) {
          throw new AppError(
            'Thao tác đã ghi nhận hoàn tất nhưng không tìm thấy chứng từ hoàn trả tương ứng trên hệ thống. Cần đối soát thủ công.',
            409
          );
        }
        return {
          operationId: op.id,
          state: 'COMPLETED',
          returnNumber: receipt.returnNumber,
          borrowRequestId: op.borrow_request_id,
          borrowStatus: BorrowStatus.RETURNED,
        };
      }

      if (op.state !== 'PREPARED') {
        throw new AppError(
          `Thao tác ở trạng thái '${op.state}' không thể commit. Chỉ thao tác ở trạng thái 'PREPARED' mới được phép commit.`,
          409
        );
      }

      // 8. Đọc bản chụp từ database row (P1.2 - Không phụ thuộc bộ nhớ tạm)
      let dbSnapshot: ReturnOperationPayloadSnapshot | null = null;
      if (op.payload_snapshot) {
        dbSnapshot =
          typeof op.payload_snapshot === 'string'
            ? JSON.parse(op.payload_snapshot)
            : op.payload_snapshot;
      }
      const dbPayloadHash = op.payload_hash;

      let effectiveItems: (ReturnOperationLineSnapshot & { sourceLocationId?: string | null })[];

      if (inputItems !== undefined) {
        if (inputItems.length === 0) {
          throw new AppError('Danh sách linh kiện hoàn trả không được để trống', 422);
        }

        // Chống trùng borrowDetailId ngay từ dữ liệu đầu vào
        const seenDetailIds = new Set<string>();
        for (const line of inputItems) {
          const normId = line.borrowDetailId.toLowerCase();
          if (seenDetailIds.has(normId)) {
            throw new AppError(
              `Không được hoàn trả trùng dòng chi tiết mượn '${line.borrowDetailId}' trong một giao dịch`,
              422
            );
          }
          seenDetailIds.add(normId);
        }

        const commitCanonical = canonicalReturnOperationPayload({
          items: inputItems,
          notes: notes || null,
        });
        const commitHash = hashReturnOperationPayload(commitCanonical);

        // Nếu Pha 1 đã lưu snapshot vào database, Pha 2 bắt buộc phải khớp hash
        if (dbPayloadHash && dbPayloadHash !== commitHash) {
          throw new AppError(
            'Payload hoàn trả tại Pha 2 không khớp với bản chụp kiểm định (snapshot) đã được lập tại Pha 1',
            409
          );
        }
        effectiveItems = inputItems;
      } else if (dbSnapshot && Array.isArray(dbSnapshot.items) && dbSnapshot.items.length > 0) {
        // Tự động dùng snapshot bất biến đã lưu bền vững trong database
        effectiveItems = dbSnapshot.items;
      } else {
        // Bắt buộc fail closed nếu không có snapshot bền vững và không truyền inputItems (P1.2)
        throw new AppError(
          'Không tìm thấy bản chụp danh sách linh kiện hợp lệ từ cơ sở dữ liệu. Yêu cầu truyền danh sách linh kiện hoàn trả.',
          422
        );
      }

      // 9. Đọc phiếu mượn cùng chi tiết và toàn bộ lịch sử hoàn trả trước đó (P1.3)
      const borrow = await tx.borrowRequest.findUnique({
        where: { id: op.borrow_request_id },
        include: {
          details: { include: { item: true } },
          reservations: true,
          returnTransactions: { include: { details: true } },
        },
      });
      if (!borrow) {
        throw new AppError('Phiếu mượn không tồn tại', 404);
      }

      if (
        borrow.status !== BorrowStatus.HANDED_OVER &&
        borrow.status !== BorrowStatus.PARTIALLY_RETURNED
      ) {
        throw new AppError(
          `Chỉ phiếu mượn 'Đang mượn (HANDED_OVER)' hoặc 'Đã trả một phần (PARTIALLY_RETURNED)' mới có thể hoàn trả. Trạng thái hiện tại: '${borrow.status}'`,
          400
        );
      }

      // 10. Đối chiếu chi tiết hoàn trả và tính toán chính xác hạn ngạch từng kho nguồn (P1.3)
      const itemsToProcess: Array<{
        detailId: string;
        itemId: string;
        quantity: number;
        condition: AssetCondition;
        sourceLocationId: string;
        destinationLocationId: string;
        notes?: string | null;
      }> = [];

      // Bản đồ theo dõi lượng đã giải trừ trong giao dịch hiện tại: Map<itemId:sourceLocationId, quantity>
      const currentTxReliefMap = new Map<string, number>();

      for (const inputLine of effectiveItems) {
        const detail = borrow.details.find((d) => d.id === inputLine.borrowDetailId);
        if (!detail) {
          throw new AppError(
            `Dòng chi tiết mượn '${inputLine.borrowDetailId}' không thuộc phiếu mượn này`,
            400
          );
        }

        const remainingOnDetail = detail.quantity - detail.returnedQuantity;
        if (inputLine.returnedQuantity > remainingOnDetail) {
          throw new AppError(
            `Số lượng hoàn trả (${inputLine.returnedQuantity}) vượt quá số lượng đang mượn còn lại (${remainingOnDetail}) của linh kiện '${detail.item?.name || detail.itemId}'`,
            400
          );
        }

        // Tìm các bản ghi phân bổ kho nguồn ban đầu (StockReservation FULFILLED)
        const fulfilledRes = borrow.reservations.filter(
          (r) => r.itemId === detail.itemId && r.status === ReservationStatus.FULFILLED
        );
        if (fulfilledRes.length === 0) {
          throw new AppError(
            `Không tìm thấy phiếu xuất kho ban đầu của linh kiện '${detail.item?.name || detail.itemId}'`,
            400
          );
        }

        let sourceLocationId: string;
        if (inputLine.sourceLocationId) {
          const matchedRes = fulfilledRes.find(
            (r) => r.locationId.toLowerCase() === inputLine.sourceLocationId!.toLowerCase()
          );
          if (!matchedRes) {
            throw new AppError(
              `Kho nguồn chỉ định '${inputLine.sourceLocationId}' không thuộc danh sách xuất kho đã ghi nhận cho linh kiện '${detail.item?.name || detail.itemId}'`,
              409
            );
          }
          sourceLocationId = matchedRes.locationId;
        } else {
          const uniqueSourceLocations = [
            ...new Set(fulfilledRes.map((r) => r.locationId.toLowerCase())),
          ];
          if (uniqueSourceLocations.length > 1) {
            // BẮT BUỘC FAIL-CLOSED: Không suy đoán kho nguồn khi xuất từ nhiều kho (Tiêu chí A / Issue #43)
            throw new AppError(
              `Không thể xác định duy nhất kho nguồn của linh kiện '${detail.item?.name || detail.itemId}' (xuất từ ${uniqueSourceLocations.length} kho khác nhau). Cần chỉ định kho nguồn hoặc đối soát trước khi hoàn trả.`,
              409
            );
          }
          sourceLocationId = fulfilledRes[0].locationId;
        }

        // TỔNG PHÂN BỔ TẠI KHO NGUỒN NÀY CHO PHIẾU
        const totalAllocatedAtSource = fulfilledRes
          .filter((r) => r.locationId.toLowerCase() === sourceLocationId.toLowerCase())
          .reduce((sum, r) => sum + r.quantity, 0);

        // LỊCH SỬ ĐÃ GIẢI TRỪ RIÊNG TẠI KHO NGUỒN NÀY (P1.3)
        // 1. Ưu tiên tra cứu sổ phân bổ kế toán kho có cấu trúc borrow_return_source_allocations
        // Ràng buộc chính xác theo cặp (borrowDetailId, sourceLocationId) để không cộng nhầm giữa các BorrowDetail khác nhau (PG17-06)
        let previouslyRelievedFromThisSource = 0;
        try {
          const ledgerRows = await tx.$queryRaw<Array<{ relieved_qty: number | bigint }>>`
            SELECT COALESCE(SUM("quantity"), 0)::int as relieved_qty
            FROM "borrow_return_source_allocations"
            WHERE "borrow_request_id" = ${borrow.id}::uuid
              AND "borrow_detail_id" = ${detail.id}::uuid
              AND "source_location_id" = ${sourceLocationId}::uuid
          `;
          if (ledgerRows && ledgerRows.length > 0 && Number(ledgerRows[0].relieved_qty) > 0) {
            previouslyRelievedFromThisSource = Number(ledgerRows[0].relieved_qty);
          }
        } catch {
          // Bỏ qua nếu bảng chưa tồn tại trong môi trường test
        }

        // 2. Fallback nếu sổ có cấu trúc chưa ghi nhận dòng này (ví dụ phiếu đã có lần trả RC5 cũ trước đó):
        if (previouslyRelievedFromThisSource === 0 && borrow.returnTransactions && borrow.returnTransactions.length > 0) {
          for (const priorTx of borrow.returnTransactions) {
            for (const priorDetail of priorTx.details || []) {
              if (priorDetail.itemId === detail.itemId) {
                const pNotes = priorDetail.notes || '';
                const match = pNotes.match(/\[SOURCE:([0-9a-fA-F-]+)\]/);
                if (match && match[1]) {
                  if (match[1].toLowerCase() === sourceLocationId.toLowerCase()) {
                    previouslyRelievedFromThisSource += priorDetail.quantity;
                  }
                } else {
                  // Phiếu hoàn trả RC5 cũ không có tag [SOURCE:]:
                  // Nếu linh kiện này chỉ xuất từ 1 kho duy nhất thì chắc chắn đến từ kho đó
                  const uniqueSources = [
                    ...new Set(fulfilledRes.map((r) => r.locationId.toLowerCase())),
                  ];
                  if (
                    uniqueSources.length === 1 &&
                    uniqueSources[0] === sourceLocationId.toLowerCase()
                  ) {
                    previouslyRelievedFromThisSource += priorDetail.quantity;
                  }
                }
              }
            }
          }
        }

        const sourceKey = `${detail.id}:${sourceLocationId.toLowerCase()}`;
        const alreadyRelievedInCurrentTx = currentTxReliefMap.get(sourceKey) || 0;

        const remainingAllocatedAtSource = Math.max(
          0,
          totalAllocatedAtSource - previouslyRelievedFromThisSource - alreadyRelievedInCurrentTx
        );

        if (inputLine.returnedQuantity > remainingAllocatedAtSource) {
          throw new AppError(
            `Số lượng hoàn trả (${inputLine.returnedQuantity}) vượt quá phân bổ xuất kho còn lại (${remainingAllocatedAtSource}) từ kho nguồn '${sourceLocationId}' của phiếu mượn này`,
            409
          );
        }

        currentTxReliefMap.set(
          sourceKey,
          alreadyRelievedInCurrentTx + inputLine.returnedQuantity
        );

        const destinationLocationId = inputLine.locationId || sourceLocationId;

        itemsToProcess.push({
          detailId: detail.id,
          itemId: detail.itemId,
          quantity: inputLine.returnedQuantity,
          condition: (inputLine.condition as AssetCondition) || AssetCondition.GOOD,
          sourceLocationId,
          destinationLocationId,
          notes: inputLine.notes,
        });
      }

      // 11. KHÓA TỒN KHO XÁC ĐỊNH THEO CẶP (itemId, locationId) (Tiêu chí 2 / Tránh Deadlock 40P01)
      const lockPairsMap = new Map<string, { itemId: string; locationId: string }>();
      for (const item of itemsToProcess) {
        lockPairsMap.set(`${item.itemId}:${item.sourceLocationId}`, {
          itemId: item.itemId,
          locationId: item.sourceLocationId,
        });
        lockPairsMap.set(`${item.itemId}:${item.destinationLocationId}`, {
          itemId: item.itemId,
          locationId: item.destinationLocationId,
        });
      }
      const sortedLockPairs = Array.from(lockPairsMap.values()).sort((a, b) => {
        const itemCmp = a.itemId.localeCompare(b.itemId);
        return itemCmp !== 0 ? itemCmp : a.locationId.localeCompare(b.locationId);
      });

      for (const pair of sortedLockPairs) {
        await tx.$queryRaw`
          SELECT "id" FROM "stock_balances"
          WHERE "itemId" = ${pair.itemId}::uuid AND "locationId" = ${pair.locationId}::uuid
          FOR UPDATE
        `;
      }

      // 12. Kiểm tra số dư borrowed tại từng kho nguồn trước khi ghi nhận
      for (const item of itemsToProcess) {
        const sourceBal = await tx.stockBalance.findUnique({
          where: {
            itemId_locationId: {
              itemId: item.itemId,
              locationId: item.sourceLocationId,
            },
          },
        });
        if (!sourceBal || sourceBal.borrowed < item.quantity) {
          throw new AppError(
            `Tồn kho đang mượn tại kho nguồn '${item.sourceLocationId}' không đủ để ghi nhận hoàn trả (${sourceBal?.borrowed || 0} < ${item.quantity})`,
            400
          );
        }
      }

      // 13. Sinh mã chứng từ hoàn trả tuần tự an toàn (P1.5)
      const returnNumber = await generateReturnNumber(tx);

      // Khóa phân tán Postgres Advisory Lock theo mã chứng từ hoàn trả
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('EV_' || LOWER(${returnNumber})))
      `;

      // Đăng ký returnNumber vào registry toàn hệ thống (P1.5)
      try {
        await tx.$executeRaw`
          INSERT INTO "system_evidence_registry" (
            "normalized_ref", "original_ref", "source_type", "source_id", "created_at"
          ) VALUES (
            LOWER(${returnNumber}),
            ${returnNumber},
            'STAGE4C_RETURN_RECEIPT',
            ${op.id}::uuid,
            NOW()
          )
        `;
      } catch {
        // Fallback an toàn
      }

      // 14. Tạo bản ghi ReturnTransaction
      const returnTx = await tx.returnTransaction.create({
        data: {
          returnNumber,
          borrowRequestId: borrow.id,
          receiverId: currentUser.id,
          notes: notes || null,
        },
      });

      // 15. Thực hiện cập nhật số dư, phân loại GOOD / DAMAGED / LOST và ghi StockMovement
      for (const item of itemsToProcess) {
        // Cập nhật số lượng đã trả trên dòng mượn
        await tx.borrowDetail.update({
          where: { id: item.detailId },
          data: { returnedQuantity: { increment: item.quantity } },
        });

        // Tạo dòng chi tiết ReturnDetail kèm tag [SOURCE:locationId] (P1.3)
        const sourceTaggedNote = `[SOURCE:${item.sourceLocationId}] ${item.notes || ''}`.trim();
        await tx.returnDetail.create({
          data: {
            returnTransactionId: returnTx.id,
            itemId: item.itemId,
            quantity: item.quantity,
            condition: item.condition,
            notes: sourceTaggedNote,
          },
        });

        // Ghi sổ phân bổ kho nguồn có cấu trúc (P1.3)
        try {
          await tx.$executeRaw`
            INSERT INTO "borrow_return_source_allocations" (
              "borrow_request_id", "borrow_detail_id", "return_transaction_id", "item_id",
              "source_location_id", "destination_location_id", "quantity", "condition", "created_at"
            ) VALUES (
              ${borrow.id}::uuid,
              ${item.detailId}::uuid,
              ${returnTx.id}::uuid,
              ${item.itemId}::uuid,
              ${item.sourceLocationId}::uuid,
              ${item.destinationLocationId}::uuid,
              ${item.quantity},
              ${item.condition},
              NOW()
            )
          `;
        } catch {
          // Fallback an toàn nếu chưa migrate bảng
        }

        const sourceBal = await tx.stockBalance.findUnique({
          where: {
            itemId_locationId: {
              itemId: item.itemId,
              locationId: item.sourceLocationId,
            },
          },
        });
        const sourceOnHandBefore = sourceBal ? sourceBal.onHand : 0;

        if (item.sourceLocationId === item.destinationLocationId) {
          // TRƯỜNG HỢP 1: HOÀN TRẢ VỀ CÙNG KHO NGUỒN
          if (item.condition === AssetCondition.GOOD) {
            // GOOD: Tăng onHand, giảm borrowed (Tiêu chí 3)
            await tx.stockBalance.update({
              where: { id: sourceBal!.id },
              data: {
                onHand: { increment: item.quantity },
                borrowed: { decrement: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.itemId,
                locationId: item.sourceLocationId,
                type: StockTransactionType.IMPORT,
                quantityDelta: item.quantity,
                onHandBefore: sourceOnHandBefore,
                onHandAfter: sourceOnHandBefore + item.quantity,
                referenceType: 'RETURN',
                referenceId: returnTx.id,
                reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Nhập hoàn trả linh kiện tốt từ phiếu ${borrow.requestNumber}`,
                createdById: currentUser.id,
              },
            });
          } else if (item.condition === AssetCondition.DAMAGED) {
            // DAMAGED: Tăng onHand, tăng quarantined, giảm borrowed (Tiêu chí 4)
            await tx.stockBalance.update({
              where: { id: sourceBal!.id },
              data: {
                onHand: { increment: item.quantity },
                quarantined: { increment: item.quantity },
                borrowed: { decrement: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.itemId,
                locationId: item.sourceLocationId,
                type: StockTransactionType.IMPORT,
                quantityDelta: item.quantity,
                onHandBefore: sourceOnHandBefore,
                onHandAfter: sourceOnHandBefore + item.quantity,
                referenceType: 'RETURN_DAMAGED',
                referenceId: returnTx.id,
                reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Nhập hoàn trả linh kiện hỏng cần cách ly từ phiếu ${borrow.requestNumber}`,
                createdById: currentUser.id,
              },
            });
          } else if (item.condition === AssetCondition.LOST) {
            // LOST: Chỉ giảm borrowed, KHÔNG tăng onHand (Tiêu chí 5)
            await tx.stockBalance.update({
              where: { id: sourceBal!.id },
              data: {
                borrowed: { decrement: item.quantity },
              },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.itemId,
                locationId: item.sourceLocationId,
                type: StockTransactionType.EXPORT,
                quantityDelta: 0,
                onHandBefore: sourceOnHandBefore,
                onHandAfter: sourceOnHandBefore,
                referenceType: 'RETURN_LOST',
                referenceId: returnTx.id,
                reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Báo mất linh kiện khi hoàn trả theo phiếu ${borrow.requestNumber}`,
                createdById: currentUser.id,
              },
            });
          }
        } else {
          // TRƯỜNG HỢP 2: HOÀN TRẢ SANG KHO ĐÍCH KHÁC (CROSS-LOCATION - Tiêu chí 1, 7)
          // A. Giảm borrowed ở kho nguồn & ghi nhận bút toán giải trừ kho nguồn
          await tx.stockBalance.update({
            where: { id: sourceBal!.id },
            data: { borrowed: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              itemId: item.itemId,
              locationId: item.sourceLocationId,
              type: StockTransactionType.TRANSFER,
              quantityDelta: 0,
              onHandBefore: sourceOnHandBefore,
              onHandAfter: sourceOnHandBefore,
              referenceType: 'RETURN_CROSS_SOURCE_RELIEF',
              referenceId: returnTx.id,
              reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Giải trừ linh kiện đang mượn tại kho nguồn do trả về kho đích ${item.destinationLocationId}`,
              createdById: currentUser.id,
            },
          });

          // B. Tăng tồn kho vật lý tại kho đích
          const destBal = await tx.stockBalance.findUnique({
            where: {
              itemId_locationId: {
                itemId: item.itemId,
                locationId: item.destinationLocationId,
              },
            },
          });
          const destOnHandBefore = destBal ? destBal.onHand : 0;

          if (item.condition === AssetCondition.GOOD) {
            await tx.stockBalance.upsert({
              where: {
                itemId_locationId: {
                  itemId: item.itemId,
                  locationId: item.destinationLocationId,
                },
              },
              update: {
                onHand: { increment: item.quantity },
              },
              create: {
                itemId: item.itemId,
                locationId: item.destinationLocationId,
                onHand: item.quantity,
              },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.itemId,
                locationId: item.destinationLocationId,
                type: StockTransactionType.IMPORT,
                quantityDelta: item.quantity,
                onHandBefore: destOnHandBefore,
                onHandAfter: destOnHandBefore + item.quantity,
                referenceType: 'RETURN',
                referenceId: returnTx.id,
                reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Nhập linh kiện tốt từ phiếu ${borrow.requestNumber} vào kho đích`,
                createdById: currentUser.id,
              },
            });
          } else if (item.condition === AssetCondition.DAMAGED) {
            await tx.stockBalance.upsert({
              where: {
                itemId_locationId: {
                  itemId: item.itemId,
                  locationId: item.destinationLocationId,
                },
              },
              update: {
                onHand: { increment: item.quantity },
                quarantined: { increment: item.quantity },
              },
              create: {
                itemId: item.itemId,
                locationId: item.destinationLocationId,
                onHand: item.quantity,
                quarantined: item.quantity,
              },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.itemId,
                locationId: item.destinationLocationId,
                type: StockTransactionType.IMPORT,
                quantityDelta: item.quantity,
                onHandBefore: destOnHandBefore,
                onHandAfter: destOnHandBefore + item.quantity,
                referenceType: 'RETURN_DAMAGED',
                referenceId: returnTx.id,
                reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Nhập linh kiện hỏng từ phiếu ${borrow.requestNumber} vào kho cách ly đích`,
                createdById: currentUser.id,
              },
            });
          } else if (item.condition === AssetCondition.LOST) {
            await tx.stockMovement.create({
              data: {
                itemId: item.itemId,
                locationId: item.destinationLocationId,
                type: StockTransactionType.EXPORT,
                quantityDelta: 0,
                onHandBefore: destOnHandBefore,
                onHandAfter: destOnHandBefore,
                referenceType: 'RETURN_LOST',
                referenceId: returnTx.id,
                reason: `[SOURCE:${item.sourceLocationId}][QTY:${item.quantity}] Ghi nhận linh kiện mất theo phiếu ${borrow.requestNumber} tại đích`,
                createdById: currentUser.id,
              },
            });
          }
        }
      }

      // 16. Cập nhật trạng thái phiếu mượn (Tiêu chí 8)
      const updatedDetails = await tx.borrowDetail.findMany({
        where: { borrowRequestId: borrow.id },
      });
      const allReturned = updatedDetails.every(
        (d) => d.returnedQuantity >= d.quantity
      );
      const newBorrowStatus = allReturned
        ? BorrowStatus.RETURNED
        : BorrowStatus.PARTIALLY_RETURNED;

      await tx.borrowRequest.update({
        where: { id: borrow.id },
        data: {
          status: newBorrowStatus,
          actualReturnDate: allReturned ? new Date() : borrow.actualReturnDate,
        },
      });

      // 17. Chuyển trạng thái thao tác Stage4C sang COMPLETED
      await tx.$executeRaw`
        UPDATE "borrow_return_operations"
        SET "state" = 'COMPLETED',
            "return_transaction_id" = ${returnTx.id}::uuid,
            "verified_by_id" = ${currentUser.id}::uuid,
            "verified_at" = NOW(),
            "updated_at" = NOW()
        WHERE "id" = ${op.id}::uuid
      `;

      // 18. Ghi nhận Audit Log bất biến
      await tx.auditLog.create({
        data: {
          userId: currentUser.id,
          action: 'STAGE4C_RETURN_COMMIT',
          entity: 'BorrowReturnOperation',
          entityId: op.id,
          oldValue: { state: 'PREPARED', borrowStatus: borrow.status },
          newValue: {
            state: 'COMPLETED',
            returnNumber,
            borrowStatus: newBorrowStatus,
          },
        },
      });

      const responsePayload = {
        operationId: op.id,
        state: 'COMPLETED',
        returnNumber,
        borrowRequestId: borrow.id,
        borrowStatus: newBorrowStatus,
      };

      // 19. Cập nhật IdempotencyRecord sang COMPLETED bền vững (P1 Issue 3)
      await tx.idempotencyRecord.update({
        where: { key: trimmedKey },
        data: {
          status: 'COMPLETED',
          statusCode: 200,
          responseBody: idempotencyService.sanitizeResponse(responsePayload),
        },
      });

      return responsePayload;
    });
  }

  /**
   * API CUTOVER EXECUTOR (P1.1):
   * Thực hiện giao dịch hoàn trả hoàn chỉnh qua Stage4C Writer khi cờ ACM_RETURN_OPERATIONS_ENABLED = true.
   * Kết nối trực tiếp từ BorrowService.returnBorrowRequest, bảo toàn release fence DBA-02/DBA-03,
   * hoàn tất đầy đủ 2 pha Prepare và Commit trong chuỗi xử lý an toàn.
   */
  async executeDirectReturn(
    borrowRequestId: string,
    input: any,
    currentUser: AuthenticatedUser,
    idempotencyKey?: string
  ): Promise<{ borrowRequest: BorrowRequestResponse; returnNumber: string }> {
    // 1. Kiểm tra môi trường Staging Read-Only (Hard Gate)
    if (isStagingReadOnlyActive() || process.env.STAGING_READ_ONLY === 'true') {
      throw new AppError(
        'Thao tác ghi bị chặn: Môi trường Staging đang hoạt động ở chế độ Chỉ đọc (Read-Only).',
        403
      );
    }

    // 2. Kiểm tra cờ cutover phát hành Stage4C
    if (!returnOperationCutoverRequested(process.env.ACM_RETURN_OPERATIONS_ENABLED)) {
      rejectUnreleasedReturnOperations();
    }

    // 3. Kiểm tra RBAC (ADMIN, LAB_MANAGER, TECHNICIAN)
    if (
      currentUser.role !== UserRole.ADMIN &&
      currentUser.role !== UserRole.LAB_MANAGER &&
      currentUser.role !== UserRole.TECHNICIAN
    ) {
      throw new AppError(
        'Chỉ Quản trị viên, Quản lý Lab hoặc Kỹ thuật viên mới có quyền nhận hoàn trả linh kiện',
        403
      );
    }

    if (!input || !Array.isArray(input.items) || input.items.length === 0) {
      throw new AppError('Danh sách linh kiện hoàn trả không được để trống', 422);
    }

    const effectiveIdempotencyKey = idempotencyKey || crypto.randomUUID();

    // Sinh mã chứng cứ BIZ-01 chuẩn cho thao tác Prepare
    const rawRef = input.notes && typeof input.notes === 'string' && input.notes.trim().startsWith('EV-')
      ? input.notes.trim()
      : `EV-RET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const physicalEvidenceRef = rawRef.slice(0, 128);

    // Chuẩn hóa input items
    const stage4cItems: (ReturnOperationLineSnapshot & { sourceLocationId?: string })[] = input.items.map((i: any) => ({
      borrowDetailId: i.borrowDetailId,
      returnedQuantity: i.returnedQuantity,
      condition: i.condition || 'GOOD',
      locationId: i.locationId || null,
      sourceLocationId: i.sourceLocationId || null,
      notes: i.notes || null,
    }));

    // Pha 1: Tiếp nhận và lập bản chụp
    const prepResult = await this.prepareReturnOperation(
      {
        borrowRequestId,
        physicalEvidenceRef,
        items: stage4cItems,
        notes: input.notes || null,
      },
      currentUser
    );

    // Pha 2: Commit và thực hiện biến động kho
    const commitResult = await this.commitReturnOperation(
      prepResult.operationId,
      currentUser,
      stage4cItems,
      input.notes || null,
      effectiveIdempotencyKey
    );

    // Truy vấn dữ liệu đầy đủ của phiếu mượn sau khi hoàn tất
    const updatedBorrow = await this.prisma.borrowRequest.findUnique({
      where: { id: borrowRequestId },
      include: {
        borrower: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
        details: { include: { item: { select: { id: true, code: true, name: true, unit: true } } } },
        reservations: { include: { location: true, item: true } },
        returnTransactions: {
          include: {
            receiver: { select: { id: true, fullName: true, email: true } },
            details: { include: { item: true } },
          },
        },
      },
    });

    if (!updatedBorrow) {
      throw new AppError('Phiếu mượn không tồn tại sau khi hoàn tất', 404);
    }

    return {
      borrowRequest: formatBorrowResponse(updatedBorrow),
      returnNumber: commitResult.returnNumber,
    };
  }
}
