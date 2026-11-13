import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  User,
  AlertCircle,
  Package,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Camera,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { DatePickerVi } from '../common/DatePickerVi';
import { CameraBorrowModal } from '../camera/CameraBorrowModal';

export interface CreateBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  totalAvailable: number;
  category?: { name: string };
  imageUrl?: string | null;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
  studentOrStaffId?: string | null;
  department?: string | null;
}

interface BorrowItemRow {
  itemId: string;
  quantity: number;
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

export const CreateBorrowModal: React.FC<CreateBorrowModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'LAB_MANAGER' || user?.role === 'TECHNICIAN';

  const COMMON_PURPOSES = [
    'Thực hành môn học',
    'Nghiên cứu / Đồ án',
    'Thi đấu Robotics & AI',
    'Hoạt động CLB Robotics',
  ];
  const purposeInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [borrowerId, setBorrowerId] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Default dates: borrow today, return 7 days later
  const todayStr = useMemo(() => getLocalDateString(), []);
  const defaultReturnStr = useMemo(() => addDaysToIso(getLocalDateString(), 7), []);

  const [expectedBorrowDate, setExpectedBorrowDate] = useState<string>(todayStr);
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>(defaultReturnStr);

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

  // Selected items list
  const [itemsList, setItemsList] = useState<BorrowItemRow[]>([
    { itemId: '', quantity: 1 },
  ]);

  // Catalog & user data
  const [catalogItems, setCatalogItems] = useState<ItemOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Camera AI Scanning & Live Proof state
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [liveProofPhoto, setLiveProofPhoto] = useState<{
    dataUrl: string;
    timestamp: string;
  } | null>(null);

  const handleApplyCameraItems = useCallback(
    (
      scannedItems: Array<{ itemId: string; quantity: number }>,
      liveProof?: { dataUrl: string; timestamp: string }
    ) => {
      setItemsList((prev) => {
        const currentValid = prev.filter((r) => r.itemId);
        const map = new Map<string, number>();
        for (const row of currentValid) {
          map.set(row.itemId, row.quantity);
        }
        for (const scan of scannedItems) {
          map.set(scan.itemId, Math.max(map.get(scan.itemId) || 0, scan.quantity));
        }
        return Array.from(map.entries()).map(([itemId, quantity]) => ({
          itemId,
          quantity,
        }));
      });

      if (liveProof) {
        setLiveProofPhoto(liveProof);
        setNotes((prev) => {
          const stamp = `[Ảnh chụp bàn giao lúc ${liveProof.timestamp} - Live Camera Verified]`;
          return prev ? `${prev}\n${stamp}` : stamp;
        });
      }
    },
    []
  );

  // Load active catalog items and users on open
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    setPurpose('');
    setNotes('');
    setLiveProofPhoto(null);
    setIsCameraModalOpen(false);
    setExpectedBorrowDate(todayStr);
    setExpectedReturnDate(defaultReturnStr);
    setItemsList([{ itemId: '', quantity: 1 }]);
    setBorrowerId(user?.id || '');

    async function loadData() {
      setLoadingData(true);
      try {
        const itemRes = await apiClient.get('/items?limit=100&isActive=true');
        if (itemRes.data?.success && Array.isArray(itemRes.data.data)) {
          setCatalogItems(itemRes.data.data);
        }

        if (isPrivileged) {
          try {
            const userRes = await apiClient.get('/users');
            if (userRes.data?.success && Array.isArray(userRes.data.data)) {
              setUsers(userRes.data.data);
            }
          } catch {
            // Ignore if user listing is not allowed for non-admin
          }
        }
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.message || 'Không thể tải danh mục linh kiện khả dụng. Vui lòng thử lại.'
        );
      } finally {
        setLoadingData(false);
      }
    }

    loadData();
  }, [isOpen, todayStr, defaultReturnStr, user?.id, isPrivileged]);

  const backdropDismiss = useModalDismiss(isOpen, onClose, submitting);

  if (!isOpen) return null;

  // Helpers for item row manipulation
  const handleAddItemRow = () => {
    setItemsList((prev) => [...prev, { itemId: '', quantity: 1 }]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItemsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, itemId: string) => {
    setItemsList((prev) =>
      prev.map((row, i) => (i === index ? { ...row, itemId, quantity: 1 } : row))
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setItemsList((prev) =>
      prev.map((row, i) => (i === index ? { ...row, quantity: Math.max(1, qty) } : row))
    );
  };

  // Find item details
  const getItemById = (id: string) => catalogItems.find((it) => it.id === id);

  // Form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic validation
    if (!purpose.trim() || purpose.trim().length < 3) {
      setErrorMessage('Vui lòng nhập mục đích mượn (tối thiểu 3 ký tự).');
      return;
    }

    if (new Date(expectedReturnDate).getTime() < new Date(expectedBorrowDate).getTime()) {
      setErrorMessage('Ngày trả dự kiến phải bằng hoặc sau ngày mượn dự kiến.');
      return;
    }

    const validItems = itemsList.filter((it) => it.itemId && it.quantity > 0);
    if (validItems.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 linh kiện/thiết bị hợp lệ cần mượn.');
      return;
    }

    // Check availability limit
    for (const row of validItems) {
      const item = getItemById(row.itemId);
      if (item && row.quantity > item.totalAvailable) {
        setErrorMessage(
          `Linh kiện "${item.name}" chỉ còn khả dụng ${item.totalAvailable} ${item.unit}. Số lượng yêu cầu (${row.quantity}) vượt quá tồn kho.`
        );
        return;
      }
    }

    // Aggregate duplicate items
    const aggregated = new Map<string, number>();
    for (const row of validItems) {
      aggregated.set(row.itemId, (aggregated.get(row.itemId) || 0) + row.quantity);
    }

    const payload = {
      borrowerId: isPrivileged && borrowerId ? borrowerId : user?.id,
      purpose: purpose.trim(),
      notes: notes.trim() || null,
      expectedBorrowDate,
      expectedReturnDate,
      items: Array.from(aggregated.entries()).map(([itemId, quantity]) => ({
        itemId,
        quantity,
      })),
    };

    setSubmitting(true);
    try {
      const res = await apiClient.post('/borrow-requests', payload);
      if (res.data?.success) {
        onSuccess();
      } else {
        setErrorMessage(res.data?.message || 'Không thể tạo phiếu mượn.');
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ||
          'Đã xảy ra lỗi khi tạo phiếu mượn. Vui lòng kiểm tra lại số lượng tồn kho khả dụng.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      {...backdropDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
    >
      <div className="relative w-full max-w-3xl my-8 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Tạo phiếu mượn linh kiện & thiết bị</h3>
              <p className="text-xs text-slate-500">Đăng ký mượn thiết bị phục vụ học tập, nghiên cứu và dự án</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Error banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-2.5">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Section 1: Borrower & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Borrower */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Người mượn <span className="text-rose-500">*</span>
              </label>
              {isPrivileged && users.length > 0 ? (
                <div className="relative">
                  <select
                    value={borrowerId}
                    onChange={(e) => setBorrowerId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  >
                    <option value="">-- Chọn người mượn --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role}) {u.studentOrStaffId ? `- MSSV: ${u.studentOrStaffId}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">{user?.fullName || 'Người dùng hiện tại'}</span>
                  <span className="text-xs text-slate-400">({user?.role})</span>
                </div>
              )}
            </div>

            {/* Purpose */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Mục đích mượn <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Gợi ý nhanh hoặc tự nhập</span>
              </div>

              {/* Quick Preset Purpose Chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_PURPOSES.map((p) => {
                  const isSelected = purpose.startsWith(p);
                  return (
                    <button
                      type="button"
                      key={p}
                      onClick={() => {
                        setPurpose(p);
                        purposeInputRef.current?.focus();
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    if (COMMON_PURPOSES.some((p) => purpose.startsWith(p))) {
                      setPurpose('');
                    }
                    purposeInputRef.current?.focus();
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    purpose && !COMMON_PURPOSES.some((p) => purpose.startsWith(p))
                      ? 'bg-blue-50 text-blue-700 border border-blue-300 font-semibold'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                  }`}
                >
                  Khác...
                </button>
              </div>

              <input
                ref={purposeInputRef}
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="VD: Thực hành Vi điều khiển, Đồ án tốt nghiệp..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            {/* Expected borrow date */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  <span>Ngày mượn dự kiến <span className="text-rose-500">*</span></span>
                </label>
                <span className="text-[10px] text-slate-400">Định dạng: Ngày/Tháng/Năm</span>
              </div>
              <DatePickerVi
                value={expectedBorrowDate}
                minDate={todayStr}
                onChange={handleBorrowDateChange}
                required
                testId="borrow-date-picker"
              />
            </div>

            {/* Expected return date */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>Hạn trả dự kiến <span className="text-rose-500">*</span></span>
                </label>
                <span className="text-[10px] text-slate-400">Định dạng: Ngày/Tháng/Năm</span>
              </div>
              <DatePickerVi
                value={expectedReturnDate}
                minDate={expectedBorrowDate || todayStr}
                onChange={(val) => setExpectedReturnDate(val)}
                required
                testId="return-date-picker"
              />
            </div>
          </div>

          {/* Quick Presets & Duration Summary Toolbar */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center space-x-1">
                <Zap className="h-3 w-3 text-amber-500" />
                <span>Hạn trả nhanh:</span>
              </span>
              {[
                { label: 'Trong ngày', days: 0 },
                { label: '3 ngày', days: 3 },
                { label: '1 tuần', days: 7 },
                { label: '2 tuần', days: 14 },
                { label: '1 tháng', days: 30 },
              ].map((preset) => {
                const isActive = borrowDurationDays === preset.days;
                return (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => handleApplyPreset(preset.days)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Duration indicator pill */}
            {borrowDurationDays !== null && (
              <div
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold font-mono ${
                  borrowDurationDays < 0
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : borrowDurationDays === 0
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : borrowDurationDays > 14
                    ? 'bg-orange-50 text-orange-700 border border-orange-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                <span>
                  {borrowDurationDays < 0
                    ? '⚠️ Ngày trả không hợp lệ (trước ngày mượn)'
                    : borrowDurationDays === 0
                    ? '⚡ Mượn trong ngày (0 ngày)'
                    : `📅 Thời lượng: ${borrowDurationDays} ngày`}
                </span>
              </div>
            )}
          </div>

          {/* Section 2: Items List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center space-x-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Danh sách linh kiện / thiết bị yêu cầu ({itemsList.length})
                </h4>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Quét Camera AI</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm linh kiện</span>
                </button>
              </div>
            </div>

            {loadingData ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Đang tải dữ liệu danh mục linh kiện...
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-500">
                Hiện chưa có linh kiện nào khả dụng trong kho để mượn.
              </div>
            ) : (
              <div className="space-y-3">
                {itemsList.map((row, index) => {
                  const selectedItem = getItemById(row.itemId);
                  const maxQty = selectedItem ? selectedItem.totalAvailable : 1;

                  return (
                    <div
                      key={index}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center gap-3"
                    >
                      {/* Item Selector */}
                      <div className="flex-1">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Linh kiện #{index + 1}
                        </label>
                        <select
                          value={row.itemId}
                          onChange={(e) => handleItemChange(index, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
                          required
                        >
                          <option value="">-- Chọn linh kiện từ danh mục --</option>
                          {catalogItems.map((it) => (
                            <option
                              key={it.id}
                              value={it.id}
                              disabled={it.totalAvailable <= 0}
                            >
                              [{it.code}] {it.name} (Khả dụng: {it.totalAvailable} {it.unit})
                              {it.totalAvailable <= 0 ? ' - HẾT HÀNG' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Stock availability indicator */}
                      {selectedItem && (
                        <div className="w-full md:w-36 text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                          <span className="text-[11px] text-slate-400 block">Tồn kho khả dụng:</span>
                          <span
                            className={`font-semibold ${
                              selectedItem.totalAvailable > 0
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {selectedItem.totalAvailable} {selectedItem.unit}
                          </span>
                        </div>
                      )}

                      {/* Quantity input */}
                      <div className="w-full md:w-32">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Số lượng mượn
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={maxQty}
                          value={row.quantity}
                          onChange={(e) =>
                            handleQuantityChange(index, parseInt(e.target.value) || 1)
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
                          required
                        />
                      </div>

                      {/* Remove row button */}
                      {itemsList.length > 1 && (
                        <div className="self-end md:self-center pt-2 md:pt-4">
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(index)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Xóa linh kiện này"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span>Ghi chú thêm (tùy chọn)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú thêm về điều kiện sử dụng, giáo viên phụ trách môn học..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Live Proof Photo Preview */}
          {liveProofPhoto && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span className="flex items-center space-x-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Bằng chứng ảnh chụp bàn giao thực tế (Live Camera)</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {liveProofPhoto.timestamp}
                </span>
              </div>
              <div className="relative rounded-lg overflow-hidden border border-emerald-300 max-h-44 flex items-center justify-center bg-black/5">
                <img
                  src={liveProofPhoto.dataUrl}
                  alt="Live Borrow Evidence"
                  className="max-h-44 object-contain rounded"
                />
              </div>
              <p className="text-[11px] text-emerald-700 flex items-center space-x-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Đã xác thực ảnh chụp trực tiếp tại chỗ. Hệ thống lưu kèm dấu thời gian thực chống gian lận.</span>
              </p>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || loadingData}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang tạo phiếu...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Xác nhận tạo phiếu mượn</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Camera Borrow Scanner Modal */}
      {isCameraModalOpen && (
        <CameraBorrowModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          catalogItems={catalogItems}
          onApplyBorrowItems={handleApplyCameraItems}
        />
      )}
    </div>
  );
};

