import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, AlertCircle, RefreshCw, Sliders, ShieldAlert, Clock } from 'lucide-react';
import {
  AdjustStockInput,
  ItemResponse,
  LocationResponse,
  StockBalanceResponse,
} from '@acm/shared';
import { useIdempotentTransaction } from '../../hooks/useIdempotentTransaction';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { stockTransactionsService } from '../../services/stock-transactions.service';
import { isStockTransactionWriteEnabled, isStockAdjustmentEnabled } from '../../config/features';
import { canPerformStockMutation } from '../../services/stock-rbac';

interface AdjustItemLine {
  itemId: string;
  locationId?: string;
  actualOnHand: number;
  reason?: string | null;
  notes?: string | null;
}

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ItemResponse[];
  locations: LocationResponse[];
  balances: StockBalanceResponse[];
  userId: string;
  userRole?: string;
  onSuccess: (result: any) => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  items,
  locations,
  balances,
  userId,
  userRole,
  onSuccess,
}) => {
  const [headerLocationId, setHeaderLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<AdjustItemLine[]>([
    { itemId: '', locationId: '', actualOnHand: 0, reason: '', notes: '' },
  ]);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [snapshotTimestamp] = useState<string>(() => new Date().toLocaleString('vi-VN'));
  const [reconcileOutcome, setReconcileOutcome] = useState<'TRANSACTION_CONFIRMED_UNEXECUTED' | 'TRANSACTION_ALREADY_SUCCEEDED'>('TRANSACTION_CONFIRMED_UNEXECUTED');
  const [reconcileAuditTicket, setReconcileAuditTicket] = useState('');
  const [reconcileAuthorizedBy, setReconcileAuthorizedBy] = useState('');
  const [reconcileToken, setReconcileToken] = useState('');
  const [reconcileEvidence, setReconcileEvidence] = useState('');
  const [reconcileTxId, setReconcileTxId] = useState('');
  const [reconcileTxNumber, setReconcileTxNumber] = useState('');
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const activeItems = useMemo(() => items.filter((it) => it.isActive), [items]);
  const activeLocations = useMemo(() => locations.filter((loc) => loc.isActive), [locations]);

  // Lookup map for stock balances: key = `${itemId}:${locationId}`
  const balanceMap = useMemo(() => {
    const map = new Map<string, StockBalanceResponse>();
    for (const b of balances) {
      map.set(`${b.itemId}:${b.locationId}`, b);
    }
    return map;
  }, [balances]);

  const getBalanceInfo = (itemId: string, locationId: string) => {
    if (!itemId || !locationId) return { onHand: 0, committed: 0, reserved: 0, quarantined: 0, kitAllocated: 0 };
    const b = balanceMap.get(`${itemId}:${locationId}`);
    if (!b) return { onHand: 0, committed: 0, reserved: 0, quarantined: 0, kitAllocated: 0 };
    const committed = b.reserved + b.quarantined + b.kitAllocated;
    return {
      onHand: b.onHand,
      committed,
      reserved: b.reserved,
      quarantined: b.quarantined,
      kitAllocated: b.kitAllocated,
    };
  };

  // Idempotency FSM Hook
  const fsm = useIdempotentTransaction<AdjustStockInput, any>({
    endpoint: '/api/v1/stock-transactions/adjustment',
    userId,
    onSuccess: (result) => {
      onSuccess(result);
      handleClose();
    },
  });

  const handleClose = () => {
    fsm.resetToDraft();
    setHeaderLocationId('');
    setReason('');
    setNotes('');
    setLines([{ itemId: '', locationId: '', actualOnHand: 0, reason: '', notes: '' }]);
    setClientErrors([]);
    setReconcileOutcome('TRANSACTION_CONFIRMED_UNEXECUTED');
    setReconcileAuditTicket('');
    setReconcileAuthorizedBy('');
    setReconcileToken('');
    setReconcileEvidence('');
    setReconcileTxId('');
    setReconcileTxNumber('');
    setReconcileError(null);
    onClose();
  };

  // Auto-reset transaction to fresh DRAFT when opening modal if previous transaction already completed
  useEffect(() => {
    if (isOpen) {
      if (fsm.state === 'CONFIRMED_SUCCESS' || fsm.state === 'CONFIRMED_FAILURE') {
        fsm.resetToDraft();
      }
    }
  }, [isOpen, fsm.state, fsm.resetToDraft]);

  const backdropDismiss = useModalDismiss(isOpen, handleClose, fsm.isSubmitting);

  if (!isOpen) return null;

  const writeEnabled = isStockTransactionWriteEnabled();
  const adjustmentEnabled = isStockAdjustmentEnabled();
  const isRoleAllowed = canPerformStockMutation(userRole);
  const isOperationBlocked = !writeEnabled || !adjustmentEnabled || !isRoleAllowed;

  const handleResolveReconciliation = () => {
    setReconcileError(null);
    const success = fsm.resolveReconciliation();
    if (!success) {
      setReconcileError(
        fsm.errorMessage ||
          'Chức năng giải phóng đối soát thủ công từ giao diện người dùng đã bị vô hiệu hóa vì lý do an toàn. Cần dịch vụ xác minh có thẩm quyền từ máy chủ.'
      );
    }
  };

  const handleAddLine = () => {
    if (lines.length >= 100) return;
    setLines([...lines, { itemId: '', locationId: headerLocationId || '', actualOnHand: 0, reason: '', notes: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof AdjustItemLine, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!reason.trim() || reason.trim().length < 5) {
      errors.push('Lý do điều chỉnh kiểm kê là bắt buộc và phải có ít nhất 5 ký tự.');
    }
    if (reason.trim().length > 500) {
      errors.push('Lý do điều chỉnh tối đa 500 ký tự.');
    }
    if (lines.length === 0) {
      errors.push('Phiếu kiểm kê phải có ít nhất 1 mặt hàng.');
    }
    if (lines.length > 100) {
      errors.push('Phiếu kiểm kê tối đa 100 mặt hàng mỗi lần.');
    }

    const seen = new Set<string>();
    let nonZeroDeltaCount = 0;

    lines.forEach((line, idx) => {
      const loc = line.locationId || headerLocationId;

      if (!line.itemId) {
        errors.push(`Dòng ${idx + 1}: Vui lòng chọn linh kiện.`);
      }
      if (!loc) {
        errors.push(`Dòng ${idx + 1}: Vị trí kho chưa được chỉ định.`);
      }
      if (line.actualOnHand < 0 || !Number.isInteger(Number(line.actualOnHand))) {
        errors.push(`Dòng ${idx + 1}: Số lượng tồn thực tế phải là số nguyên không âm (>= 0).`);
      }

      if (line.itemId && loc) {
        const key = `${line.itemId}:${loc}`;
        if (seen.has(key)) {
          errors.push(`Dòng ${idx + 1}: Trùng lặp linh kiện tại cùng vị trí trong phiếu điều chỉnh.`);
        }
        seen.add(key);

        const { onHand, committed } = getBalanceInfo(line.itemId, loc);
        const delta = Number(line.actualOnHand) - onHand;

        if (delta !== 0) {
          nonZeroDeltaCount++;
        }

        // Check committed stock guard if decreasing onHand
        if (delta < 0 && Number(line.actualOnHand) < committed) {
          errors.push(
            `Dòng ${idx + 1}: Không thể điều chỉnh tồn thực tế (${line.actualOnHand}) nhỏ hơn số lượng đã cam kết (${committed} = Reserved + Quarantined + KitAllocated).`
          );
        }
      }
    });

    // Enforce Non-Zero Delta Rule
    if (seen.size > 0 && nonZeroDeltaCount === 0) {
      errors.push(
        'Tồn kho thực tế của tất cả mặt hàng đều khớp với số dư trên hệ thống (delta = 0). Không có chênh lệch tồn kho nào cần điều chỉnh.'
      );
    }

    setClientErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fsm.state !== 'DRAFT') {
      if (fsm.state === 'CONFIRMED_SUCCESS' || fsm.state === 'CONFIRMED_FAILURE') {
        fsm.resetToDraft();
      } else {
        setClientErrors([`Chỉ có thể phát lệnh khi phiếu ở trạng thái DRAFT. Trạng thái hiện tại: ${fsm.state}`]);
        return;
      }
    }
    if (fsm.isSubmitting) return;
    if (!validateForm()) return;

    if (isOperationBlocked) {
      if (!adjustmentEnabled) {
        setClientErrors(['Nghiệp vụ Điều chỉnh kho (ADJUSTMENT) đang bị khóa độc lập do chưa có phê duyệt riêng.']);
      } else if (!isRoleAllowed) {
        setClientErrors(['Bạn không có quyền thực hiện nghiệp vụ Điều chỉnh kho. Nghiệp vụ yêu cầu vai trò ADMIN hoặc LAB_MANAGER.']);
      } else {
        setClientErrors(['Thao tác ghi kho bị khóa do cấu hình hệ thống (Write Flag = false).']);
      }
      return;
    }

    const payload: AdjustStockInput = {
      locationId: headerLocationId || undefined,
      reason: reason.trim(),
      notes: notes.trim() || null,
      items: lines.map((l) => ({
        itemId: l.itemId,
        locationId: l.locationId || headerLocationId || undefined,
        actualOnHand: Number(l.actualOnHand),
        reason: l.reason?.trim() || null,
        notes: l.notes?.trim() || null,
      })),
    };

    await fsm.submit(payload, async (pl, key) => {
      return await stockTransactionsService.adjustStock(pl, key);
    });
  };

  return (
    <div
      {...backdropDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto"
      data-testid="stock-adjustment-modal"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-yellow-50/50 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-600 text-white shadow-md shadow-yellow-500/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Kiểm Kê & Điều Chỉnh Tồn Kho (ADJUSTMENT)</h3>
              <p className="text-xs text-slate-500">
                Hiệu chỉnh sai lệch giữa tồn sổ sách và tồn thực tế sau kiểm kê
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={fsm.isSubmitting}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
            {/* Independent Adjustment Feature Gate Banner */}
            {!adjustmentEnabled && (
              <div
                className="rounded-xl border border-yellow-300 bg-yellow-50 p-3.5 text-xs text-yellow-800 flex items-start space-x-2"
                data-testid="adjustment-feature-gate-banner"
              >
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold">Khóa an toàn độc lập: </span>
                  Nghiệp vụ Điều chỉnh kho (ADJUSTMENT) đang bị khóa độc lập (chưa hoàn thiện Snapshot V2 và chưa phê duyệt riêng).
                </div>
              </div>
            )}

            {/* Snapshot Stale Warning */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-900 flex items-start space-x-2">
              <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold">Thời điểm lấy dữ liệu sổ sách: </span>
                <span className="font-mono text-blue-800" data-testid="snapshot-time-display">
                  {snapshotTimestamp}
                </span>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Lưu ý: Nếu số dư tồn kho thay đổi do giao dịch khác trước khi xác nhận, máy chủ sẽ kiểm tra lại tính hợp lệ bằng row-level lock.
                </p>
              </div>
            </div>

            {/* Ambiguous State Banner */}
            {fsm.isAmbiguous && (
              <div
                className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 space-y-2"
                data-testid="ambiguous-state-banner"
              >
                <div className="flex items-center space-x-2 font-bold">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span>KẾT QUẢ CHƯA XÁC NHẬN (AMBIGUOUS OUTCOME)</span>
                </div>
                {fsm.errorMessage && (
                  <p className="font-semibold text-amber-900 bg-amber-100/80 p-2 rounded border border-amber-200" data-testid="ambiguous-error-detail">
                    {fsm.errorMessage}
                  </p>
                )}
                <p>
                  Yêu cầu điều chỉnh đã được gửi với khóa <code className="font-mono font-bold">{fsm.idempotencyKey}</code> nhưng kết nối mạng bị gián đoạn.
                </p>
                <div className="flex items-center space-x-3 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      fsm.retryAmbiguous((pl, key) => stockTransactionsService.adjustStock(pl, key))
                    }
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition"
                    data-testid="btn-retry-ambiguous"
                  >
                    Thử lại an toàn với cùng khóa
                  </button>
                  <button
                    type="button"
                    onClick={fsm.requestReconciliation}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                  >
                    Yêu cầu Đối chiếu / Thay đổi
                  </button>
                </div>
              </div>
            )}

            {/* Reconciliation Required Banner */}
            {fsm.isReconciliationRequired && (
              <div
                className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 space-y-3"
                data-testid="reconciliation-banner"
              >
                <div className="flex items-center space-x-2 font-bold text-red-700">
                  <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <span>CẢNH BÁO BẮT BUỘC ĐỐI CHIẾU (RECONCILIATION REQUIRED)</span>
                </div>
                {fsm.errorMessage && (
                  <p className="font-semibold text-red-800 bg-red-100/80 p-2 rounded border border-red-200" data-testid="reconciliation-error-detail">
                    {fsm.errorMessage}
                  </p>
                )}
                <p className="text-red-800">
                  Giao dịch chưa được xác nhận hoàn tất hoặc phát hiện xung đột dữ liệu Idempotency. Vui lòng đối chiếu với trang Lịch sử giao dịch hoặc cơ sở dữ liệu trước khi tiếp tục. Không tự ý tạo phiếu mới nếu giao dịch cũ đã được thực thi.
                </p>

                <div className="bg-white/80 border border-red-200 rounded-lg p-3 space-y-2.5">
                  <div className="font-semibold text-gray-800">Biên bản đối soát có thẩm quyền:</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="reconcile-outcome-adjustment"
                        value="TRANSACTION_CONFIRMED_UNEXECUTED"
                        checked={reconcileOutcome === 'TRANSACTION_CONFIRMED_UNEXECUTED'}
                        onChange={() => setReconcileOutcome('TRANSACTION_CONFIRMED_UNEXECUTED')}
                        className="text-red-600 focus:ring-red-500"
                        data-testid="radio-reconcile-unexecuted"
                      />
                      <span className="text-gray-700">Xác nhận giao dịch CHƯA được thực thi (Cần Audit Ticket)</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="reconcile-outcome-adjustment"
                        value="TRANSACTION_ALREADY_SUCCEEDED"
                        checked={reconcileOutcome === 'TRANSACTION_ALREADY_SUCCEEDED'}
                        onChange={() => setReconcileOutcome('TRANSACTION_ALREADY_SUCCEEDED')}
                        className="text-red-600 focus:ring-red-500"
                        data-testid="radio-reconcile-succeeded"
                      />
                      <span className="text-gray-700">Giao dịch ĐÃ thành công trên hệ thống</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-gray-700 mb-1">Mã biên bản đối soát (auditTicketId):</label>
                      <input
                        type="text"
                        value={reconcileAuditTicket}
                        onChange={(e) => setReconcileAuditTicket(e.target.value)}
                        placeholder="VD: AUDIT-20261014-0001"
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        data-testid="input-reconcile-auditticket"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-gray-700 mb-1">Người duyệt đối soát (authorizedBy):</label>
                      <input
                        type="text"
                        value={reconcileAuthorizedBy}
                        onChange={(e) => setReconcileAuthorizedBy(e.target.value)}
                        placeholder="VD: supervisor-admin-id"
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        data-testid="input-reconcile-authorizedby"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Mã chứng thực đối soát (authorizationSecretOrToken - tối thiểu 16 ký tự):</label>
                    <input
                      type="password"
                      value={reconcileToken}
                      onChange={(e) => setReconcileToken(e.target.value)}
                      placeholder="Nhập mã chứng thực thẩm quyền (tối thiểu 16 ký tự)..."
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                      data-testid="input-reconcile-token"
                    />
                  </div>

                  {reconcileOutcome === 'TRANSACTION_ALREADY_SUCCEEDED' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Transaction UUID (id):</label>
                        <input
                          type="text"
                          value={reconcileTxId}
                          onChange={(e) => setReconcileTxId(e.target.value)}
                          placeholder="UUID (VD: 11111111-1111-4111-8111-111111111111)..."
                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                          data-testid="input-reconcile-txid"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Mã chứng từ (transactionNumber):</label>
                        <input
                          type="text"
                          value={reconcileTxNumber}
                          onChange={(e) => setReconcileTxNumber(e.target.value)}
                          placeholder="VD: ADJ-20261014-001..."
                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                          data-testid="input-reconcile-txnumber"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Căn cứ sổ cái kiểm kê thực tế (evidenceDetails - tối thiểu 20 ký tự):</label>
                    <input
                      type="text"
                      value={reconcileEvidence}
                      onChange={(e) => setReconcileEvidence(e.target.value)}
                      placeholder="Ghi rõ chi tiết sổ cái và căn cứ thực tế (không dùng 404 thuần túy)..."
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                      data-testid="input-reconcile-evidence"
                    />
                  </div>

                  {reconcileError && (
                    <p className="text-red-600 font-semibold" data-testid="reconcile-error-msg">
                      {reconcileError}
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={handleResolveReconciliation}
                    className="rounded-lg bg-red-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition"
                    data-testid="btn-resolve-reconciliation"
                  >
                    Xác nhận kết quả đối chiếu
                  </button>
                </div>
              </div>
            )}

            {/* Server Error */}
            {fsm.errorMessage && !fsm.isAmbiguous && !fsm.isReconciliationRequired && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-start space-x-2"
                data-testid="adjustment-error-banner"
              >
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold">Lỗi từ máy chủ: </span>
                  {fsm.errorMessage}
                </div>
              </div>
            )}

            {/* Client Validation Errors */}
            {clientErrors.length > 0 && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 space-y-1"
                data-testid="client-validation-errors"
              >
                <div className="font-bold">Vui lòng kiểm tra lại thông tin:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {clientErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Header Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vị trí kiểm kê chung (Tùy chọn)
                </label>
                <select
                  value={headerLocationId}
                  onChange={(e) => setHeaderLocationId(e.target.value)}
                  disabled={fsm.isSubmitting || fsm.isAmbiguous}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-yellow-500 focus:outline-none"
                  data-testid="header-location-select"
                >
                  <option value="">-- Chọn riêng từng dòng --</option>
                  {activeLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      [{loc.type}] {loc.code} - {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý do điều chỉnh kiểm kê <span className="text-red-500">* (tối thiểu 5 ký tự)</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={fsm.isSubmitting || fsm.isAmbiguous}
                  placeholder="Ví dụ: Kiểm kê định kỳ quý 4/2026 / Bù trừ sai lệch thực tế"
                  minLength={5}
                  maxLength={500}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                  data-testid="adjustment-reason-input"
                />
              </div>
            </div>

            {/* Line items table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Bảng đối chiếu kiểm kê ({lines.length}/100)
                </label>
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={lines.length >= 100 || fsm.isSubmitting || fsm.isAmbiguous}
                  className="inline-flex items-center space-x-1 rounded-lg border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800 hover:bg-yellow-100 transition"
                  data-testid="btn-add-line"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm dòng</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 w-8 text-center">#</th>
                      <th className="py-2.5 px-3 min-w-[180px]">Linh kiện</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Vị trí kho</th>
                      <th className="py-2.5 px-3 w-20 text-center">Tồn sổ sách</th>
                      <th className="py-2.5 px-3 w-20 text-center">Cam kết</th>
                      <th className="py-2.5 px-3 w-28">Tồn thực tế</th>
                      <th className="py-2.5 px-3 w-20 text-center">Delta (Δ)</th>
                      <th className="py-2.5 px-3">Ghi chú dòng</th>
                      <th className="py-2.5 px-3 w-10 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {lines.map((line, idx) => {
                      const loc = line.locationId || headerLocationId;
                      const { onHand, committed } = getBalanceInfo(line.itemId, loc);
                      const delta = Number(line.actualOnHand) - onHand;
                      const isCommittedViolated = delta < 0 && Number(line.actualOnHand) < committed;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50" data-testid={`line-row-${idx}`}>
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <select
                              value={line.itemId}
                              onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                              disabled={fsm.isSubmitting || fsm.isAmbiguous}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-yellow-500 focus:outline-none"
                              data-testid={`select-item-${idx}`}
                            >
                              <option value="">-- Chọn linh kiện --</option>
                              {activeItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  [{item.code}] {item.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={line.locationId || ''}
                              onChange={(e) => handleLineChange(idx, 'locationId', e.target.value)}
                              disabled={fsm.isSubmitting || fsm.isAmbiguous}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-yellow-500 focus:outline-none"
                              data-testid={`select-location-${idx}`}
                            >
                              <option value="">
                                {headerLocationId ? '-- Dùng vị trí đầu phiếu --' : '-- Chọn vị trí --'}
                              </option>
                              {activeLocations.map((l) => (
                                <option key={l.id} value={l.id}>
                                  [{l.type}] {l.code}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-700" data-testid={`onhand-display-${idx}`}>
                            {onHand}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-500" data-testid={`committed-display-${idx}`}>
                            {committed}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={line.actualOnHand}
                              onChange={(e) =>
                                handleLineChange(idx, 'actualOnHand', parseInt(e.target.value, 10) || 0)
                              }
                              disabled={fsm.isSubmitting || fsm.isAmbiguous}
                              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-mono font-bold focus:outline-none ${
                                isCommittedViolated
                                  ? 'border-red-500 bg-red-50 text-red-700'
                                  : 'border-slate-200 text-slate-900 focus:border-yellow-500'
                              }`}
                              data-testid={`input-actual-onhand-${idx}`}
                            />
                            {isCommittedViolated && (
                              <span
                                className="text-[10px] text-red-600 block mt-0.5"
                                data-testid={`committed-violation-error-${idx}`}
                              >
                                Thấp hơn cam kết ({committed})!
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-xs ${
                                delta > 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : delta < 0
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                              data-testid={`delta-badge-${idx}`}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={line.notes || ''}
                              onChange={(e) => handleLineChange(idx, 'notes', e.target.value)}
                              disabled={fsm.isSubmitting || fsm.isAmbiguous}
                              placeholder="Nguyên nhân chênh lệch"
                              maxLength={500}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-yellow-500 focus:outline-none"
                              data-testid={`input-notes-${idx}`}
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              disabled={lines.length <= 1 || fsm.isSubmitting || fsm.isAmbiguous}
                              className="text-slate-400 hover:text-red-600 disabled:opacity-30 transition"
                              data-testid={`btn-remove-line-${idx}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={fsm.isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={fsm.isSubmitting || fsm.isAmbiguous || fsm.isReconciliationRequired}
              className="inline-flex items-center space-x-2 rounded-lg bg-yellow-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-yellow-500/20 hover:bg-yellow-700 disabled:opacity-50 transition"
              data-testid="btn-submit-adjustment"
            >
              {fsm.isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Đang xử lý giao dịch...</span>
                </>
              ) : (
                <span>Xác nhận Điều chỉnh</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
