import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, ShieldAlert, Power } from 'lucide-react';
import { LocationResponse } from '@acm/shared';
import { isLocationWriteEnabled } from '../../config/features';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface LocationStatusModalProps {
  isOpen: boolean;
  location: LocationResponse | any;
  targetActive: boolean;
  onClose: () => void;
  onConfirm: (data: { isActive: boolean; reason?: string }) => Promise<void>;
  isSubmitting?: boolean;
  serverError?: string | null;
}

export const LocationStatusModal: React.FC<LocationStatusModalProps> = ({
  isOpen,
  location,
  targetActive,
  onClose,
  onConfirm,
  isSubmitting = false,
  serverError = null,
}) => {
  const isWriteEnabled = isLocationWriteEnabled();
  const [reason, setReason] = useState('');
  const [localServerError, setLocalServerError] = useState<string | null>(null);

  const backdropDismiss = useModalDismiss(
    isOpen && Boolean(location),
    onClose,
    isSubmitting
  );

  if (!isOpen || !location) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalServerError(null);

    if (!isWriteEnabled) {
      setLocalServerError(
        'Chức năng thay đổi trạng thái vị trí kho đang tạm khóa ở giai đoạn thử nghiệm (VITE_ENABLE_LOCATION_WRITES=false).'
      );
      return;
    }

    try {
      await onConfirm({
        isActive: targetActive,
        reason: reason.trim() || undefined,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Đã xảy ra lỗi khi thay đổi trạng thái vị trí kho.';
      setLocalServerError(msg);
    }
  };

  const isDeactivating = !targetActive;

  return (
    <div
      {...backdropDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl transition-all border border-slate-100 overflow-hidden">
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b px-6 py-4 ${
            isDeactivating
              ? 'border-amber-100 bg-amber-50/60'
              : 'border-emerald-100 bg-emerald-50/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                isDeactivating
                  ? 'border-amber-200 bg-amber-100 text-amber-700'
                  : 'border-emerald-200 bg-emerald-100 text-emerald-700'
              }`}
            >
              {isDeactivating ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 id="status-modal-title" className="text-sm font-bold text-slate-900 sm:text-base">
                {isDeactivating ? 'Xác Nhận Vô Hiệu Hóa Vị Trí' : 'Xác Nhận Kích Hoạt Vị Trí'}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {location.code} – {location.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feature Flag Disabled Banner */}
        {!isWriteEnabled && (
          <div className="bg-amber-50 px-6 py-3 border-b border-amber-200/80 flex items-start space-x-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <span className="font-semibold">Chế độ Thử nghiệm (Feature Flag OFF):</span> Chức năng thay đổi trạng thái đang bị khóa tại runtime.
            </div>
          </div>
        )}

        {/* Server Error Alert */}
        {(localServerError || serverError) && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-200/80 flex items-start space-x-2.5">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs font-semibold text-rose-800">
              {localServerError || serverError}
            </div>
          </div>
        )}

        {/* Modal Body */}
        <form onSubmit={handleConfirm} className="px-6 py-5 space-y-4">
          {/* Target Location Details */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Mã vị trí:</span>
              <span className="font-mono font-bold text-slate-800">{location.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tên vị trí:</span>
              <span className="font-medium text-slate-800">{location.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cấp phân cấp:</span>
              <span className="font-medium text-slate-800">{location.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Trạng thái hiện tại:</span>
              <span
                className={`font-semibold ${
                  location.isActive ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {location.isActive ? 'Đang hoạt động' : 'Đang ngưng'}
              </span>
            </div>
          </div>

          {/* Business Warning Messages */}
          {isDeactivating ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 space-y-2 leading-relaxed">
              <p className="font-semibold text-amber-800">Quy tắc an toàn kho nội bộ:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-700">
                <li>Vị trí bị vô hiệu hóa sẽ không hiển thị khi tạo phiếu nhập/xuất/điều chuyển kho.</li>
                <li>
                  <strong>Điều kiện bắt buộc:</strong> Máy chủ sẽ <strong>TỪ CHỐI</strong> nếu vị trí vẫn còn tồn kho vật lý hoặc số lượng đang giữ chỗ/cách ly/gán Kit/mượn, hoặc còn vị trí con đang hoạt động.
                </li>
                <li>Hệ thống <strong>không tự động</strong> xóa hay chuyển kho linh kiện.</li>
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900 space-y-2 leading-relaxed">
              <p className="font-semibold text-emerald-800">Kích hoạt lại vị trí kho:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-700">
                <li>Vị trí sẽ hoạt động trở lại và có thể tiếp nhận lưu trữ linh kiện.</li>
                <li>
                  <strong>Điều kiện bắt buộc:</strong> Vị trí cha trực tiếp (nếu có) phải đang ở trạng thái hoạt động.
                </li>
              </ul>
            </div>
          )}

          {/* Optional Reason Input */}
          <div>
            <label htmlFor="status-reason" className="block text-xs font-bold text-slate-700">
              Lý do thay đổi trạng thái <span className="text-slate-400 font-normal">(Tùy chọn)</span>
            </label>
            <div className="mt-1">
              <input
                id="status-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={255}
                disabled={isSubmitting || !isWriteEnabled}
                placeholder="VD: Kiểm kê định kỳ, nâng cấp kệ, bảo trì thiết bị..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end space-x-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isWriteEnabled}
              className={`inline-flex items-center space-x-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed ${
                isDeactivating
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <Power className="h-4 w-4" />
                  <span>
                    {isDeactivating ? 'Xác nhận vô hiệu hóa' : 'Xác nhận kích hoạt'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
