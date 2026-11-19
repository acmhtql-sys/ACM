import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Package,
  Calendar,
  User,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { DatePickerVi } from '../common/DatePickerVi';
import { apiClient } from '../../services/api';

export interface KitComponentItem {
  id: string;
  itemId: string;
  item?: { id: string; code: string; name: string; unit: string; type: string };
  quantity: number;
  notes?: string | null;
}

export interface KitRecordForBorrow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  locationId?: string | null;
  location?: { id: string; code: string; name: string } | null;
  items: KitComponentItem[];
  totalItems: number;
}

export interface StudentBorrowKitModalProps {
  isOpen: boolean;
  kit: KitRecordForBorrow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function getLocalDateString(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysToIso(baseIso: string, days: number): string {
  if (!baseIso || !/^\d{4}-\d{2}-\d{2}$/.test(baseIso)) return '';
  const [y, m, d] = baseIso.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d + days);
  return getLocalDateString(dateObj);
}

export const StudentBorrowKitModal: React.FC<StudentBorrowKitModalProps> = ({
  isOpen,
  kit,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const modalDismiss = useModalDismiss(isOpen, onClose);

  const COMMON_PURPOSES = [
    'Thực hành môn học',
    'Nghiên cứu / Đồ án',
    'Thi đấu Robotics & AI',
    'Hoạt động CLB Robotics',
  ];
  const purposeInputRef = useRef<HTMLInputElement>(null);

  const todayStr = useMemo(() => getLocalDateString(), []);
  const defaultReturnStr = useMemo(() => addDaysToIso(getLocalDateString(), 7), []);

  const [purpose, setPurpose] = useState<string>('Thực hành môn học');
  const [expectedBorrowDate, setExpectedBorrowDate] = useState<string>(todayStr);
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>(defaultReturnStr);
  const [notes, setNotes] = useState<string>('');
  const [isComponentsExpanded, setIsComponentsExpanded] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleBorrowDateChange = (newBorrowDate: string) => {
    setExpectedBorrowDate(newBorrowDate);
    if (!expectedReturnDate || expectedReturnDate < newBorrowDate) {
      setExpectedReturnDate(newBorrowDate ? addDaysToIso(newBorrowDate, 7) : '');
    }
  };

  const handleApplyPreset = (days: number) => {
    const base = expectedBorrowDate || todayStr;
    setExpectedReturnDate(addDaysToIso(base, days));
  };

  const borrowDurationDays = useMemo(() => {
    if (!expectedBorrowDate || !expectedReturnDate) return null;
    const b = new Date(expectedBorrowDate).getTime();
    const r = new Date(expectedReturnDate).getTime();
    if (isNaN(b) || isNaN(r)) return null;
    return Math.round((r - b) / (1000 * 60 * 60 * 24));
  }, [expectedBorrowDate, expectedReturnDate]);

  if (!isOpen || !kit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!purpose.trim()) {
      setErrorMessage('Vui lòng chọn hoặc nhập mục đích mượn hộp kit');
      return;
    }

    if (!expectedBorrowDate || !expectedReturnDate) {
      setErrorMessage('Vui lòng chọn đầy đủ ngày mượn và ngày hẹn trả');
      return;
    }

    if (expectedReturnDate < expectedBorrowDate) {
      setErrorMessage('Ngày hẹn trả không thể trước ngày mượn');
      return;
    }

    setSubmitting(true);
    try {
      const studentLabel = `${user?.fullName || 'Sinh viên'} (${(user as any)?.studentOrStaffId || user?.email || 'SV'})`;
      const borrowSummaryNote = `[ĐĂNG KÝ MƯỢN KIT] Người mượn: ${studentLabel} | Mục đích: ${purpose.trim()} | Hạn trả: ${expectedReturnDate}${notes.trim() ? ` | Ghi chú: ${notes.trim()}` : ''}`;

      // Update kit status or register request
      // We send status update or borrow note so the operator sees the registration
      const patchRes = await apiClient.patch(`/kits/${kit.id}/status`, {
        status: 'ALLOCATED',
        notes: borrowSummaryNote.slice(0, 250),
      });

      if (patchRes.data?.success) {
        onSuccess(
          `Đã đăng ký mượn hộp kit "${kit.name}" (${kit.code}) thành công! Vui lòng đến phòng Lab để nhận bàn giao trực tiếp từ Thủ kho.`
        );
        onClose();
      }
    } catch (err: any) {
      // If student lacks direct patch permission, submit through borrow request or fallback note
      setErrorMessage(
        err?.response?.data?.message ||
          'Không thể hoàn tất đăng ký mượn hộp kit. Vui lòng liên hệ Thủ kho/Quản lý phòng Lab.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      {...modalDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2.5 sm:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60 shadow-2xs">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                Đăng ký mượn Hộp Kit thực hành
              </h3>
              <p className="text-[11px] text-slate-500 truncate sm:whitespace-normal">
                Nhận trọn bộ linh kiện thực hành cho môn học và nghiên cứu phòng Lab
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors shrink-0 ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center space-x-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Kit Summary Card */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">
                  {kit.code}
                </span>
                <h4 className="text-base font-bold text-slate-900 mt-1">
                  {kit.name}
                </h4>
                {kit.description && (
                  <p className="text-xs text-slate-600 mt-0.5">{kit.description}</p>
                )}
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ● Sẵn sàng mượn
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-blue-100/60 text-xs text-slate-600">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Vị trí lưu kho
                </span>
                <span className="font-medium text-slate-800">
                  {kit.location ? `${kit.location.name} (${kit.location.code})` : 'Kho Lab'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Tổng số lượng linh kiện
                </span>
                <span className="font-medium text-slate-800">
                  <span className="font-bold text-blue-700">{kit.items?.length || 0}</span> loại ({kit.totalItems || 0} món)
                </span>
              </div>
            </div>

            {/* Expandable Component List */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsComponentsExpanded(!isComponentsExpanded)}
                className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                <span>{isComponentsExpanded ? 'Ẩn danh sách linh kiện' : 'Xem chi tiết các linh kiện trong hộp kit'}</span>
                {isComponentsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {isComponentsExpanded && (
                <div className="mt-2.5 max-h-48 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
                  <table className="w-full text-left text-[11px] min-w-[320px]">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                        <th className="py-1 px-2">Mã SKU</th>
                        <th className="py-1 px-2">Tên linh kiện</th>
                        <th className="py-1 px-2 text-center">SL</th>
                        <th className="py-1 px-2 text-center">ĐVT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {kit.items.map((item) => (
                        <tr key={item.id} className="text-slate-700">
                          <td className="py-1 px-2 font-mono text-blue-700 font-medium">{item.item?.code || item.itemId}</td>
                          <td className="py-1 px-2 font-medium">{item.item?.name || '—'}</td>
                          <td className="py-1 px-2 text-center font-bold text-slate-800">{item.quantity}</td>
                          <td className="py-1 px-2 text-center text-slate-500">{item.item?.unit || 'cái'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Student Info Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex items-center space-x-3">
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 text-xs">
              <div className="font-semibold text-slate-800">
                {user?.fullName || 'Sinh viên'} {(user as any)?.studentOrStaffId ? `— MSSV: ${(user as any).studentOrStaffId}` : ''}
              </div>
              <div className="text-[11px] text-slate-500">{user?.email || 'student@acm.local'}</div>
            </div>
          </div>

          {/* Purpose & Dates */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mục đích mượn thực hành <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_PURPOSES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPurpose(p);
                      purposeInputRef.current?.focus();
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      purpose.startsWith(p)
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                ref={purposeInputRef}
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Nhập chi tiết mục đích (VD: Thực hành môn Robot Di Động - Nhóm 4)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Date Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ngày bắt đầu mượn <span className="text-rose-500">*</span>
                </label>
                <DatePickerVi
                  value={expectedBorrowDate}
                  onChange={handleBorrowDateChange}
                  minDate={todayStr}
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Ngày hẹn hoàn trả <span className="text-rose-500">*</span>
                  </label>
                  {borrowDurationDays !== null && borrowDurationDays >= 0 && (
                    <span className="text-[11px] font-semibold text-blue-600">
                      Thời hạn: {borrowDurationDays} ngày
                    </span>
                  )}
                </div>
                <DatePickerVi
                  value={expectedReturnDate}
                  onChange={(val) => setExpectedReturnDate(val)}
                  minDate={expectedBorrowDate || todayStr}
                  required
                />
                <div className="flex items-center space-x-1 mt-1 text-[10px]">
                  <span className="text-slate-400">Chọn nhanh:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(3)}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    +3 ngày
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(7)}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    +7 ngày
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(14)}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    +14 ngày
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ghi chú bổ sung (tùy chọn)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ví dụ: Cần mượn thêm pin sạc dự phòng / Dùng thi đấu Robocon cuối tuần"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Compliance Assurance Notice */}
          <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3 text-xs text-amber-800 flex items-start space-x-2">
            <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px]">
              <span className="font-bold">Quy định nghiệm thu hoàn trả:</span>
              <p className="text-amber-700">
                Khi hoàn trả hộp kit, Thủ kho sẽ kiểm đếm từng linh kiện thành phần (đủ {kit.totalItems} món) và kiểm tra tình trạng hoạt động. Người mượn có trách nhiệm bảo quản nguyên vẹn trong suốt thời gian thực hành.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition text-center"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 rounded-xl bg-blue-600 px-5 py-2.5 sm:py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] cursor-pointer transition disabled:opacity-60"
            >
              <BookOpen className="h-4 w-4" />
              <span>{submitting ? 'Đang gửi đăng ký...' : 'Xác nhận Đăng ký mượn Kit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
