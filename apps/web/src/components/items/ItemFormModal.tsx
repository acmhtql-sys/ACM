import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Save, Info } from 'lucide-react';
import { apiClient } from '../../services/api';
import { ItemType, ItemResponse } from '@acm/shared';

interface CategoryOption {
  id: string;
  code: string;
  name: string;
}

interface ItemFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  item: ItemResponse | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  mode,
  item,
  categories,
  onClose,
  onSuccess,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('Cái');
  const [type, setType] = useState<ItemType>(ItemType.CONSUMABLE);
  const [categoryId, setCategoryId] = useState('');
  const [minStockAlert, setMinStockAlert] = useState(5);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setErrors({});
      setApiError(null);
      if (mode === 'edit' && item) {
        setCode(item.code);
        setName(item.name);
        setUnit(item.unit);
        setType(item.type);
        setCategoryId(item.categoryId);
        setMinStockAlert(item.minStockAlert);
        setDescription(item.description || '');
        setImageUrl(item.imageUrl || '');
      } else {
        // Reset defaults for create mode
        setCode('');
        setName('');
        setUnit('Cái');
        setType(ItemType.CONSUMABLE);
        setCategoryId(categories.length > 0 ? categories[0].id : '');
        setMinStockAlert(5);
        setDescription('');
        setImageUrl('');
      }
    }
  }, [isOpen, mode, item, categories]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!code.trim() || code.trim().length < 2) {
      newErrors.code = 'Mã SKU phải có ít nhất 2 ký tự và không chỉ chứa khoảng trắng';
    }
    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Tên linh kiện/thiết bị phải có ít nhất 2 ký tự';
    }
    if (!unit.trim()) {
      newErrors.unit = 'Đơn vị tính là bắt buộc';
    }
    if (!categoryId) {
      newErrors.categoryId = 'Vui lòng chọn danh mục quản lý';
    }
    if (minStockAlert < 0 || !Number.isInteger(Number(minStockAlert))) {
      newErrors.minStockAlert = 'Mức cảnh báo tồn kho tối thiểu phải là số nguyên không âm';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setApiError(null);

    try {
      if (mode === 'create') {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          unit: unit.trim(),
          type,
          categoryId,
          minStockAlert: Number(minStockAlert),
          imageUrl: imageUrl.trim() || null,
        };

        const res = await apiClient.post('/items', payload);
        if (res.data?.success) {
          onSuccess(`Đã tạo thành công linh kiện: ${code.trim()}`);
          onClose();
        }
      } else if (mode === 'edit' && item) {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          unit: unit.trim(),
          type,
          categoryId,
          minStockAlert: Number(minStockAlert),
          imageUrl: imageUrl.trim() || null,
        };

        const res = await apiClient.put(`/items/${item.id}`, payload);
        if (res.data?.success) {
          onSuccess(`Đã cập nhật linh kiện: ${item.code}`);
          onClose();
        }
      }
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 409) {
        setApiError(`Mã SKU "${code.trim()}" đã tồn tại trong hệ thống. Vui lòng sử dụng mã khác.`);
      } else if (status === 422) {
        const details = data?.details;
        if (Array.isArray(details) && details.length > 0) {
          setApiError(details.map((d: any) => d.message || `${d.field}: lỗi`).join(', '));
        } else {
          setApiError(data?.message || 'Dữ liệu nhập không hợp lệ');
        }
      } else if (status === 403) {
        setApiError('Bạn không có quyền thực hiện thao tác này (yêu cầu ADMIN hoặc LAB_MANAGER)');
      } else if (status === 404) {
        setApiError('Không tìm thấy bản ghi hoặc danh mục yêu cầu');
      } else {
        setApiError(data?.message || 'Đã xảy ra lỗi khi lưu thông tin linh kiện');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {mode === 'create' ? 'Thêm mới Linh kiện / Thiết bị' : `Chỉnh sửa Linh kiện: ${item?.code}`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'create'
                ? 'Nhập thông tin nhận diện và phân loại danh mục'
                : 'Cập nhật thuộc tính mô tả và quy cách quản lý'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {apiError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 flex items-start space-x-2.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Stock Invariant Notice */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 flex items-start space-x-2 text-[11px] text-blue-800">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              <strong className="font-semibold">Quy tắc nghiệp vụ:</strong> Tồn kho thực tế (On-hand)
              được nhập xuất độc lập qua <em>Phiếu Giao Dịch</em>, không cho phép chỉnh sửa trực tiếp số
              lượng tại form thông tin linh kiện này.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SKU Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã SKU / Mã quản lý <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="VD: STM32-F401, ESP32-WROOM"
                className={`w-full rounded-lg border px-3 py-2 text-xs font-mono transition-colors focus:bg-white focus:outline-none focus:ring-1 ${
                  errors.code
                    ? 'border-rose-300 bg-rose-50 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-500'
                }`}
              />
              {errors.code && <p className="mt-1 text-[11px] text-rose-600">{errors.code}</p>}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên linh kiện / thiết bị <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Mạch nạp ST-Link V2"
                className={`w-full rounded-lg border px-3 py-2 text-xs transition-colors focus:bg-white focus:outline-none focus:ring-1 ${
                  errors.name
                    ? 'border-rose-300 bg-rose-50 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-500'
                }`}
              />
              {errors.name && <p className="mt-1 text-[11px] text-rose-600">{errors.name}</p>}
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Danh mục quản lý <span className="text-rose-500">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-xs transition-colors focus:bg-white focus:outline-none focus:ring-1 ${
                  errors.categoryId
                    ? 'border-rose-300 bg-rose-50 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-500'
                }`}
              >
                <option value="">-- Chọn danh mục --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.categoryId}</p>
              )}
            </div>

            {/* Item Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loại phân loại (Item Type) <span className="text-rose-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ItemType)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={ItemType.CONSUMABLE}>CONSUMABLE (Tiêu hao: LED, Điện trở...)</option>
                <option value={ItemType.TRACKED_ASSET}>TRACKED_ASSET (Theo dõi Barcode: Kit, Sensor...)</option>
                <option value={ItemType.EQUIPMENT}>EQUIPMENT (Máy móc/Thiết bị Lab)</option>
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đơn vị tính <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Cái, Chiếc, Cuộn, Gói, Bộ..."
                className={`w-full rounded-lg border px-3 py-2 text-xs transition-colors focus:bg-white focus:outline-none focus:ring-1 ${
                  errors.unit
                    ? 'border-rose-300 bg-rose-50 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-500'
                }`}
              />
              {errors.unit && <p className="mt-1 text-[11px] text-rose-600">{errors.unit}</p>}
            </div>

            {/* Min Stock Alert */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngưỡng cảnh báo thiếu tồn kho (Min Alert)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {errors.minStockAlert && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.minStockAlert}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mô tả chi tiết / Thông số kỹ thuật
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Thông số điện áp, dòng điện, hãng sản xuất, ghi chú bảo quản..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Image URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Đường dẫn hình ảnh minh họa (URL)
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/item.jpg"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{submitting ? 'Đang lưu...' : mode === 'create' ? 'Tạo linh kiện' : 'Lưu cập nhật'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
