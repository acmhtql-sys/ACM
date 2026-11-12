import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Save, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../../services/api';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface Category {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  parent?: { id: string; code: string; name: string } | null;
  _count?: { items: number; children: number };
}

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categoryToEdit?: Category | null;
  allCategories: Category[];
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  categoryToEdit,
  allCategories,
}) => {
  const isEdit = !!categoryToEdit;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string>('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (categoryToEdit) {
      setCode(categoryToEdit.code);
      setName(categoryToEdit.name);
      setDescription(categoryToEdit.description || '');
      setParentId(categoryToEdit.parentId || '');
    } else {
      setCode('');
      setName('');
      setDescription('');
      setParentId('');
    }
    setValidationError(null);
    setApiError(null);
  }, [categoryToEdit, isOpen]);

  const backdropDismiss = useModalDismiss(isOpen, onClose, isSubmitting);

  if (!isOpen) return null;

  // Filter out the category itself from parent selection to prevent immediate cycle
  const availableParents = allCategories.filter((cat) => cat.id !== categoryToEdit?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setApiError(null);

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanDesc = description.trim();

    // Client-side validation
    if (!cleanCode || cleanCode.length < 2) {
      setValidationError('Mã danh mục phải có ít nhất 2 ký tự.');
      return;
    }
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      setValidationError('Mã danh mục chỉ được chứa chữ in hoa, chữ số, dấu gạch nối và gạch dưới (VD: CAT-DEV-KIT).');
      return;
    }
    if (!cleanName || cleanName.length < 2) {
      setValidationError('Tên danh mục phải có ít nhất 2 ký tự.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && categoryToEdit) {
        await apiClient.patch(`/categories/${categoryToEdit.id}`, {
          code: cleanCode,
          name: cleanName,
          description: cleanDesc || null,
          parentId: parentId ? parentId : null,
        });
      } else {
        await apiClient.post('/categories', {
          code: cleanCode,
          name: cleanName,
          description: cleanDesc || null,
          parentId: parentId ? parentId : null,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.details?.[0]?.message ||
        'Đã xảy ra lỗi khi lưu thông tin danh mục. Vui lòng thử lại.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      {...backdropDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal border border-slate-100 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-100/60">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isEdit ? 'Chỉnh sửa Danh mục Linh kiện' : 'Tạo Danh mục Linh kiện Mới'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEdit
                  ? `Cập nhật thông tin phân loại cho mã ${categoryToEdit?.code}`
                  : 'Khai báo nhóm linh kiện mới vào danh mục hệ thống'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alerts */}
        {(validationError || apiError) && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs text-rose-700 flex items-start space-x-2.5 shadow-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed font-medium">{validationError || apiError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Mã danh mục (Code) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="VD: CAT-DEV-KIT"
              disabled={isSubmitting}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono uppercase text-slate-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Quy chuẩn: In hoa, chữ số và dấu gạch nối (tối đa 30 ký tự, duy nhất).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Tên danh mục <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Bo mạch vi điều khiển & Phát triển"
              disabled={isSubmitting}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Danh mục cha (Parent Category)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={isSubmitting}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 transition-all cursor-pointer"
            >
              <option value="">-- Danh mục gốc (Root Category) --</option>
              {availableParents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.code} - {parent.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Mô tả chi tiết
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú về nhóm linh kiện, mục đích sử dụng hoặc tiêu chuẩn kỹ thuật..."
              disabled={isSubmitting}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
          </div>

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-end space-x-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-brand-600 px-4.5 py-2.5 text-xs font-semibold text-white shadow-soft hover:bg-brand-700 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{isEdit ? 'Lưu thay đổi' : 'Tạo danh mục'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
