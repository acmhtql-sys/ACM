import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Package,
  Calendar,
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  Send,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { DatePickerVi } from '../common/DatePickerVi';
import { apiClient } from '../../services/api';
import type { KitRecordForBorrow } from './StudentBorrowKitModal';

export interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
  studentOrStaffId?: string | null;
  department?: string | null;
}

export interface KitHandoverModalProps {
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

export const KitHandoverModal: React.FC<KitHandoverModalProps> = ({
  isOpen,
  kit,
  onClose,
  onSuccess,
}) => {
  const modalDismiss = useModalDismiss(isOpen, onClose);

  const todayStr = useMemo(() => getLocalDateString(), []);
  const defaultReturnStr = useMemo(() => addDaysToIso(getLocalDateString(), 7), []);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [manualBorrowerName, setManualBorrowerName] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('Thực hành môn học');
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>(defaultReturnStr);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load users list
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setManualBorrowerName('');
    setSelectedUserId('');
    setPurpose('Thực hành môn học');
    setExpectedReturnDate(defaultReturnStr);
    setNotes('');

    apiClient
      .get('/users?limit=100')
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setUsers(res.data.data);
        }
      })
      .catch(() => {
        // Fallback to manual entry if users endpoint is restricted
      });
  }, [isOpen, defaultReturnStr]);

  if (!isOpen || !kit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const chosenUser = users.find((u) => u.id === selectedUserId);
    const borrowerText = chosenUser
      ? `${chosenUser.fullName} (${chosenUser.studentOrStaffId || chosenUser.email})`
      : manualBorrowerName.trim();

    if (!borrowerText) {
      setErrorMessage('Vui lòng chọn hoặc nhập tên/MSSV sinh viên nhận bàn giao');
      return;
    }

    if (!expectedReturnDate) {
      setErrorMessage('Vui lòng chọn ngày hẹn hoàn trả hộp kit');
      return;
    }

    setSubmitting(true);
    try {
      const handoverNote = `[BÀN GIAO] Người nhận: ${borrowerText} | Mục đích: ${purpose} | Hạn trả: ${expectedReturnDate}${notes.trim() ? ` | Ghi chú: ${notes.trim()}` : ''}`;

      const res = await apiClient.patch(`/kits/${kit.id}/status`, {
        status: 'ALLOCATED',
        notes: handoverNote.slice(0, 250),
      });

      if (res.data?.success) {
        onSuccess(
          `Đã bàn giao hộp kit "${kit.name}" (${kit.code}) cho ${borrowerText}. Trạng thái kit chuyển sang "Đang phân bổ".`
        );
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || 'Không thể bàn giao hộp kit. Vui lòng thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      {...modalDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-6 py-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 shadow-2xs">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Bàn giao Hộp Kit thực hành
              </h3>
              <p className="text-[11px] text-slate-500">
                Giao trọn bộ kit cho sinh viên / người mượn thực hành
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center space-x-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Kit Info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/60">
                {kit.code}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {kit.items?.length || 0} loại ({kit.totalItems || 0} món)
              </span>
            </div>
            <div className="font-bold text-slate-900 text-sm">{kit.name}</div>
            <div className="text-[11px] text-slate-500">
              Kho lưu trữ: {kit.location?.name || 'Kho phòng Lab'}
            </div>
          </div>

          {/* Borrower Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Sinh viên / Người nhận bàn giao <span className="text-rose-500">*</span>
            </label>
            {users.length > 0 ? (
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  if (e.target.value) setManualBorrowerName('');
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Chọn sinh viên từ danh sách tài khoản --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} {u.studentOrStaffId ? `(${u.studentOrStaffId})` : `(${u.email})`} - {u.role}
                  </option>
                ))}
              </select>
            ) : null}

            <div>
              <span className="text-[11px] text-slate-400 block mb-1">
                Hoặc nhập trực tiếp Tên / Mã sinh viên:
              </span>
              <input
                type="text"
                value={manualBorrowerName}
                onChange={(e) => {
                  setManualBorrowerName(e.target.value);
                  if (e.target.value) setSelectedUserId('');
                }}
                placeholder="VD: Nguyễn Văn B (SV2026002 - Lớp Robotics 22)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Purpose & Return Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mục đích thực hành <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="VD: Thực hành môn học"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hạn hoàn trả <span className="text-rose-500">*</span>
              </label>
              <DatePickerVi
                value={expectedReturnDate}
                onChange={(val) => setExpectedReturnDate(val)}
                minDate={todayStr}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú bàn giao
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: Đã kiểm tra đủ dây cáp và ốc vít trước khi giao"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.99] cursor-pointer transition disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? 'Đang bàn giao...' : 'Xác nhận Bàn giao Kit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
