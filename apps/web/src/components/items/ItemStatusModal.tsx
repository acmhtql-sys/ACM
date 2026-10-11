import React, { useState } from 'react';
import { X, Power, AlertTriangle } from 'lucide-react';
import { apiClient } from '../../services/api';
import { ItemResponse } from '@acm/shared';

interface ItemStatusModalProps {
  isOpen: boolean;
  item: ItemResponse | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ItemStatusModal: React.FC<ItemStatusModalProps> = ({
  isOpen,
  item,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const targetIsActive = !item.isActive;
  const actionLabel = targetIsActive ? 'Kích hoạt lại' : 'Vô hiệu hóa';

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await apiClient.patch(`/items/${item.id}/status`, {
        isActive: targetIsActive,
        reason: reason.trim() || undefined,
      });

      if (res.data?.success) {
        onSuccess(`Đã ${actionLabel.toLowerCase()} thành công linh kiện: ${item.code}`);
        setReason('');
        onClose();
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || `Không thể thay đổi trạng thái linh kiện ${item.code}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <Power className={`h-5 w-5 ${targetIsActive ? 'text-emerald-600' : 'text-rose-600'}`} />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Xác nhận {actionLabel} linh kiện
              </h3>
              <p className="text-xs text-slate-500">Mã: {item.code}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start space-x-2 text-xs text-rose-800">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div
            className={`rounded-xl border p-4 text-xs space-y-2 ${
              targetIsActive
                ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                : 'border-amber-200 bg-amber-50/60 text-amber-900'
            }`}
          >
            <p className="font-semibold">
              {targetIsActive
                ? 'Linh kiện sẽ được hiển thị trở lại cho sinh viên và có thể mượn trả bình thường.'
                : 'Linh kiện sẽ bị ẩn khỏi danh sách của sinh viên (Student) và không thể tạo phiếu mượn mới.'}
            </p>
            <p className="opacity-90">
              Thao tác này sử dụng cơ chế Soft Deactivation để bảo toàn lịch sử dữ liệu và các giao dịch tồn kho.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lý do thay đổi trạng thái (Tùy chọn, tối đa 255 ký tự)
            </label>
            <textarea
              rows={2}
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Hết hàng tạm thời / Đang bảo dưỡng / Linh kiện lỗi thời..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className={`inline-flex items-center space-x-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50 ${
                targetIsActive
                  ? 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700'
                  : 'bg-rose-600 shadow-rose-500/20 hover:bg-rose-700'
              }`}
            >
              <span>{submitting ? 'Đang xử lý...' : `Xác nhận ${actionLabel}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
