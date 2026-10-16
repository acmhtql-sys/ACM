import React from 'react';
import { X, ShieldAlert, FileText, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { StockTransactionSummary } from '../../types/stock-transactions';
import { stockTransactionsService } from '../../services/stock-transactions.service';
import { EmptyState } from '../common/EmptyState';

interface StockTransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: StockTransactionSummary | null;
  transactionId?: string;
}

export const StockTransactionDetailModal: React.FC<StockTransactionDetailModalProps> = ({
  isOpen,
  onClose,
  transaction,
  transactionId,
}) => {
  const txId = transaction?.id || transactionId;

  // Fetch full details if details array is not loaded and itemCount indicates items exist
  const shouldFetch =
    isOpen &&
    !!txId &&
    (!transaction?.details || transaction.details.length === 0) &&
    (transaction?.itemCount === undefined || transaction.itemCount > 0);

  const { data: fetchedTx, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-transactions', 'detail', txId],
    queryFn: () => stockTransactionsService.getTransactionById(txId!),
    enabled: shouldFetch,
  });

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (isLoading && !transaction && !fetchedTx) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto"
        data-testid="transaction-detail-modal-loading"
      >
        <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">Đang nạp chi tiết chứng từ...</h3>
          <p className="text-xs text-slate-500 mt-1">Đang truy vấn dữ liệu từ máy chủ</p>
        </div>
      </div>
    );
  }

  if (isError && !transaction && !fetchedTx) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto"
        data-testid="transaction-detail-modal-error"
      >
        <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600 mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Không thể tải chi tiết chứng từ</h3>
            <p className="text-xs text-slate-500 mt-1">
              {(error as any)?.message || 'Đã xảy ra lỗi khi truy vấn thông tin giao dịch từ máy chủ.'}
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
              data-testid="btn-retry-detail-fetch"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              <span>Thử tải lại</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              data-testid="btn-close-detail-error"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!transaction && !fetchedTx) return null;

  const currentTx = fetchedTx || transaction!;
  const details = currentTx.details || [];
  const hasDetails = details.length > 0;

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'IMPORT':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'EXPORT':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'TRANSFER':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'ADJUSTMENT':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto"
      data-testid="transaction-detail-modal"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100/80 text-blue-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 font-mono" data-testid="detail-tx-number">
                  {currentTx.transactionNumber}
                </h3>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getTypeBadgeColor(
                    currentTx.type
                  )}`}
                  data-testid="detail-tx-type"
                >
                  {currentTx.type}
                </span>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {currentTx.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Chi tiết chứng từ kho và danh sách mặt hàng ghi sổ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 transition"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Người lập phiếu:</span>
              <span className="text-slate-800 font-semibold mt-0.5 block" data-testid="detail-creator-name">
                {currentTx.creatorName || currentTx.createdBy?.fullName || 'N/A'}
              </span>
              {currentTx.createdBy?.email && (
                <span className="text-slate-400 text-[11px] block">{currentTx.createdBy.email}</span>
              )}
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Thời gian lập:</span>
              <span className="text-slate-800 font-semibold mt-0.5 block" data-testid="detail-created-at">
                {new Date(currentTx.createdAt).toLocaleString('vi-VN')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Số dòng mặt hàng:</span>
              <span className="text-slate-800 font-bold mt-0.5 block font-mono text-sm" data-testid="detail-item-count">
                {currentTx.itemCount ?? details.length} dòng
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Tổng số lượng:</span>
              <span className="text-blue-700 font-bold mt-0.5 block font-mono text-sm" data-testid="detail-total-qty">
                {currentTx.totalQuantity ?? 0}
              </span>
            </div>
            {currentTx.notes && (
              <div className="col-span-full border-t border-slate-200/60 pt-2 mt-1">
                <span className="text-slate-400 block font-medium">Ghi chú / Lý do nghiệp vụ:</span>
                <p className="text-slate-700 mt-0.5">{currentTx.notes}</p>
              </div>
            )}
          </div>

          {/* Line items section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Danh sách Mặt hàng trong Phiếu ({details.length})
              </h4>
            </div>

            {isLoading ? (
              <div
                className="flex flex-col items-center justify-center py-12 space-y-2 text-slate-500"
                data-testid="detail-loading-state"
              >
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                <span className="text-xs">Đang tải chi tiết danh sách mặt hàng...</span>
              </div>
            ) : hasDetails ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">STT</th>
                      <th className="py-2.5 px-3">Linh kiện / Thiết bị</th>
                      <th className="py-2.5 px-3">
                        {currentTx.type === 'TRANSFER' ? 'Vị trí nguồn' : 'Vị trí kho'}
                      </th>
                      {currentTx.type === 'TRANSFER' && (
                        <th className="py-2.5 px-3">Vị trí đích</th>
                      )}
                      <th className="py-2.5 px-3 text-right">Số lượng</th>
                      {currentTx.type === 'IMPORT' && (
                        <th className="py-2.5 px-3 text-right">Đơn giá (VNĐ)</th>
                      )}
                      <th className="py-2.5 px-3">Ghi chú dòng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {details.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">
                            {item.item?.name || item.itemId}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {item.item?.code} {item.item?.unit ? `(${item.item.unit})` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-slate-800 font-medium">
                            {item.location?.code || item.locationId}
                          </span>
                          {item.location?.name && (
                            <span className="text-slate-400 text-[11px] block">{item.location.name}</span>
                          )}
                        </td>
                        {currentTx.type === 'TRANSFER' && (
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-slate-800 font-medium">
                              {item.toLocation?.code || item.toLocationId || '-'}
                            </span>
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        {currentTx.type === 'IMPORT' && (
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {item.unitCost != null ? item.unitCost.toLocaleString('vi-VN') : '-'}
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-slate-500 italic">
                          {item.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Safe EmptyState for 96 Historical Orphan Headers */
              <div
                className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-6 text-center"
                data-testid="detail-empty-orphan-notice"
              >
                <AlertCircle className="mx-auto h-8 w-8 text-amber-500 mb-2" />
                <h5 className="text-xs font-bold text-amber-900 uppercase">
                  Chứng từ lịch sử không có chi tiết dòng mặt hàng (0 dòng)
                </h5>
                <p className="mt-1 text-xs text-amber-700 max-w-md mx-auto">
                  Chứng từ lịch sử này không có chi tiết dòng mặt hàng nào được ghi nhận trên hệ thống.
                  Hệ thống bảo toàn nguyên vẹn tiêu đề chứng từ mà không thay đổi cấu trúc dữ liệu.
                </p>
              </div>
            )}
          </div>

          {/* Ledger Notice */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
            <div className="flex items-center space-x-2 font-semibold text-slate-800">
              <ShieldAlert className="h-4 w-4 text-slate-500" />
              <span>Nhật ký Sổ cái Biến động Kho (Stock Movements Ledger):</span>
            </div>
            <p className="text-[11px] text-slate-500 pl-6">
              Các biến động kho phát sinh từ chứng từ này được ghi nhận và đối chiếu tại tab Sổ Nhật ký Biến động kho.
            </p>
          </div>

          {/* Immutability Notice */}
          <div className="text-center text-[11px] text-slate-400 italic">
            Chứng từ kho đã hoàn tất và ghi sổ có tính chất bất biến vĩnh viễn (405 Method Not Allowed đối với PUT / DELETE).
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
