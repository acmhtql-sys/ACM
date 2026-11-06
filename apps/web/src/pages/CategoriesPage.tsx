import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  Package,
  Layers,
  CheckCircle2,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { CategoryModal, type Category } from '../components/categories/CategoryModal';

export const CategoriesPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LAB_MANAGER';

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);

  // Delete State
  const [deleteCandidate, setDeleteCandidate] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/categories');
      if (res.data?.success) {
        setCategories(res.data.data);
      }
    } catch (err: any) {
      setErrorBanner('Không thể tải danh sách danh mục từ máy chủ. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpenCreate = () => {
    setCategoryToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setCategoryToEdit(cat);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (cat: Category) => {
    setDeleteWarning(null);
    const itemCount = cat._count?.items ?? 0;
    const childrenCount = cat._count?.children ?? 0;

    if (itemCount > 0) {
      setDeleteWarning(
        `Không thể xóa danh mục '${cat.name}' vì đang có ${itemCount} linh kiện trực thuộc. Vui lòng chuyển các linh kiện sang danh mục khác trước khi thực hiện xóa.`
      );
      setDeleteCandidate(null);
      return;
    }

    if (childrenCount > 0) {
      setDeleteWarning(
        `Không thể xóa danh mục '${cat.name}' vì đang có ${childrenCount} danh mục con trực thuộc. Vui lòng điều chỉnh hoặc xóa danh mục con trước.`
      );
      setDeleteCandidate(null);
      return;
    }

    setDeleteCandidate(cat);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;

    setIsDeleting(true);
    setDeleteWarning(null);
    try {
      await apiClient.delete(`/categories/${deleteCandidate.id}`);
      setSuccessBanner(`Đã xóa danh mục '${deleteCandidate.name}' thành công.`);
      setDeleteCandidate(null);
      await fetchCategories();
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        'Không thể xóa danh mục. Vui lòng kiểm tra lại ràng buộc dữ liệu.';
      setDeleteWarning(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Danh mục Linh kiện (Categories)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Cấu trúc phân loại theo nhóm phần cứng và mục đích đào tạo phòng Lab ACM
          </p>
        </div>

        {canManage ? (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tạo danh mục mới</span>
          </button>
        ) : (
          <div className="inline-flex items-center space-x-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500 border border-slate-200">
            <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
            <span>Chế độ Xem (Chỉ Admin / Lab Manager có quyền sửa)</span>
          </div>
        )}
      </div>

      {/* Success Notification */}
      {successBanner && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Global Error Notification */}
      {errorBanner && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Guarded Delete Warning Banner */}
      {deleteWarning && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 flex items-start justify-between space-x-2">
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Ràng buộc an toàn khi xóa danh mục</p>
              <p className="mt-0.5 text-amber-800">{deleteWarning}</p>
            </div>
          </div>
          <button
            onClick={() => setDeleteWarning(null)}
            className="text-amber-600 hover:text-amber-800 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Categories Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-2 text-xs text-slate-500">Đang tải danh mục linh kiện...</span>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <FolderTree className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Chưa có danh mục nào</p>
          <p className="mt-1 text-xs text-slate-500">Hãy tạo danh mục đầu tiên để bắt đầu phân loại linh kiện.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs hover:border-blue-300 transition-all"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {cat.code}
                  </span>
                  <div className="flex items-center space-x-1">
                    {canManage && (
                      <>
                        <button
                          onClick={() => handleOpenEdit(cat)}
                          title="Chỉnh sửa danh mục"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(cat)}
                          title="Xóa danh mục"
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <FolderTree className="h-4 w-4 text-slate-400 ml-1" />
                  </div>
                </div>

                <h3 className="mt-3 text-sm font-bold text-slate-900">{cat.name}</h3>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                  {cat.description || 'Chưa có mô tả chi tiết'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Trực thuộc:</span>
                  <span className="font-medium text-slate-700 truncate max-w-[140px]" title={cat.parent?.name}>
                    {cat.parent ? cat.parent.name : 'Danh mục gốc'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center space-x-1 text-slate-600">
                    <Package className="h-3 w-3 text-slate-400" />
                    <span>{cat._count?.items ?? 0} linh kiện</span>
                  </span>
                  <span className="inline-flex items-center space-x-1 text-slate-600">
                    <Layers className="h-3 w-3 text-slate-400" />
                    <span>{cat._count?.children ?? 0} mục con</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Create/Edit Modal */}
      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchCategories();
          setSuccessBanner(
            categoryToEdit ? 'Đã cập nhật danh mục thành công.' : 'Đã tạo danh mục linh kiện mới thành công.'
          );
          setTimeout(() => setSuccessBanner(null), 4000);
        }}
        categoryToEdit={categoryToEdit}
        allCategories={categories}
      />

      {/* Guarded Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác nhận Xóa Danh mục</h3>
                <p className="text-xs text-slate-500">Chính sách bảo vệ toàn vẹn dữ liệu kho</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa danh mục{' '}
              <span className="font-bold text-slate-900">
                {deleteCandidate.code} - {deleteCandidate.name}
              </span>
              ?
            </p>

            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Số lượng linh kiện trực thuộc:</span>
                <span className="font-semibold text-emerald-600">{deleteCandidate._count?.items ?? 0} (Đủ điều kiện)</span>
              </div>
              <div className="flex justify-between">
                <span>Số lượng danh mục con trực thuộc:</span>
                <span className="font-semibold text-emerald-600">{deleteCandidate._count?.children ?? 0} (Đủ điều kiện)</span>
              </div>
              <p className="text-slate-400 pt-1 text-[10px]">
                * Thao tác xóa sẽ được lưu trữ tự động vào Nhật ký kiểm toán (AuditLog).
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <span>Xác nhận Xóa</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
