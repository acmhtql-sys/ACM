import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertCircle,
  Save,
  Info,
  UploadCloud,
  ImageOff,
  CheckCircle,
} from 'lucide-react';
import { apiClient } from '../../services/api';
import { ItemType, ItemResponse } from '@acm/shared';

function buildSafeFileName(originalName: string, mimeType: string): string {
  const ext =
    mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const dotIdx = originalName.lastIndexOf('.');
  const rawBase = dotIdx > 0 ? originalName.slice(0, dotIdx) : originalName;
  const cleanBase = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeBase = cleanBase.length >= 3 ? cleanBase.slice(0, 80) : `item_${cleanBase || 'img'}`;
  return `${safeBase}.${ext}`;
}

async function compressImageFile(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return file;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 800;
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          resolve(file);
          return;
        }
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const toBlob = (mime: string, quality: number) =>
          new Promise<Blob | null>((res) => {
            try {
              canvas.toBlob((b) => res(b), mime, quality);
            } catch {
              res(null);
            }
          });

        // Prefer WebP (preserves alpha & compresses well); fall back to JPEG
        let blob = await toBlob('image/webp', 0.82);
        if (!blob || blob.type !== 'image/webp') {
          // Fill white background before JPEG to avoid black transparency artifact
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          blob = await toBlob('image/jpeg', 0.82);
        }

        if (blob && blob.size > 120 * 1024) {
          const smaller = await toBlob(blob.type, 0.65);
          if (smaller && smaller.size < blob.size) {
            blob = smaller;
          }
        }

        if (!blob || (blob.size >= file.size && file.size <= 150 * 1024)) {
          resolve(file);
          return;
        }

        const safeName = buildSafeFileName(file.name, blob.type);
        resolve(new File([blob], safeName, { type: blob.type }));
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewError, setPreviewError] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setErrors({});
      setApiError(null);
      setSelectedFile(null);
      setPreviewError(false);
      setUploadSuccess(false);
      setUploadingImage(false);
      if (mode === 'edit' && item) {
        setCode(item.code);
        setName(item.name);
        setUnit(item.unit);
        setType(item.type);
        setCategoryId(item.categoryId);
        setMinStockAlert(item.minStockAlert);
        setDescription(item.description || '');
        setImageUrl(item.imageUrl || '');
        setPreviewUrl(item.imageUrl || '');
        setActiveTab(
          item.imageUrl && !item.imageUrl.startsWith('data:') && !item.imageUrl.includes('/zua6n3a3/')
            ? 'url'
            : 'upload'
        );
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
        setPreviewUrl('');
        setActiveTab('upload');
      }
    }
  }, [isOpen, mode, item, categories]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setApiError('Định dạng hình ảnh không hợp lệ. Chỉ chấp nhận PNG, JPEG, WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setApiError('Dung lượng tệp vượt quá giới hạn 5 MB.');
      return;
    }

    setApiError(null);
    setPreviewError(false);
    setUploadSuccess(false);
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const uploadFileToBackend = async (itemId: string, file: File): Promise<string> => {
    setUploadingImage(true);
    try {
      const optimizedFile = await compressImageFile(file);
      const safeFileName = buildSafeFileName(optimizedFile.name, optimizedFile.type);
      const buffer = await optimizedFile.arrayBuffer();
      const res = await apiClient.post(`/items/${itemId}/image`, buffer, {
        headers: {
          'Content-Type': optimizedFile.type,
          'x-file-name': encodeURIComponent(safeFileName),
        },
      });
      const cdnUrl = res.data?.data?.imageUrl;
      if (cdnUrl) {
        setImageUrl(cdnUrl);
        setPreviewUrl(cdnUrl);
        setPreviewError(false);
      }
      setUploadSuccess(true);
      return cdnUrl;
    } finally {
      setUploadingImage(false);
    }
  };

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
        const initialImageUrl = selectedFile ? null : imageUrl.trim() || null;
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          unit: unit.trim(),
          type,
          categoryId,
          minStockAlert: Number(minStockAlert),
          imageUrl: initialImageUrl,
        };

        const res = await apiClient.post('/items', payload);
        if (res.data?.success) {
          const newItemId = res.data?.data?.id;
          let uploadWarning = '';
          if (selectedFile && newItemId) {
            try {
              await uploadFileToBackend(newItemId, selectedFile);
            } catch (uploadErr: any) {
              const errMsg =
                uploadErr?.response?.data?.message || uploadErr?.message || 'Lỗi máy chủ lưu trữ';
              uploadWarning = ` (Lưu ý: Lỗi tải ảnh: ${errMsg})`;
            }
          }
          onSuccess(`Đã tạo thành công linh kiện: ${code.trim()}${uploadWarning}`);
          onClose();
        }
      } else if (mode === 'edit' && item) {
        let uploadedViaEndpoint = false;
        if (selectedFile && item.id) {
          await uploadFileToBackend(item.id, selectedFile);
          uploadedViaEndpoint = true;
        }
        const trimmedUrl = imageUrl.trim();
        const urlChanged = !uploadedViaEndpoint && trimmedUrl !== (item.imageUrl || '');
        const payload: Record<string, any> = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          unit: unit.trim(),
          type,
          categoryId,
          minStockAlert: Number(minStockAlert),
        };
        if (urlChanged) {
          payload.imageUrl = trimmedUrl || null;
        }
        const res = await apiClient.put(`/items/${item.id}`, payload);
        if (res.data?.success) {
          onSuccess(`Đã cập nhật linh kiện: ${code.trim()}`);
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

          {/* Image Upload & Management */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Hình ảnh minh họa linh kiện
              </label>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`px-2.5 py-0.5 rounded-md transition-all ${
                    activeTab === 'upload' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'hover:text-slate-900'
                  }`}
                >
                  Tải ảnh lên
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('url')}
                  className={`px-2.5 py-0.5 rounded-md transition-all ${
                    activeTab === 'url' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'hover:text-slate-900'
                  }`}
                >
                  Nhập link URL
                </button>
              </div>
            </div>

            {activeTab === 'upload' ? (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="relative flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {previewError ? (
                      <div className="w-24 aspect-[4/3] rounded-lg border border-amber-200 bg-amber-50 text-amber-600 flex flex-col items-center justify-center shrink-0">
                        <ImageOff className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="w-24 aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100 shrink-0">
                        <img
                          src={previewUrl}
                          alt="Xem trước linh kiện"
                          onError={() => setPreviewError(true)}
                          className="w-full h-full object-cover object-center"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {selectedFile
                          ? selectedFile.name
                          : previewError
                            ? 'Ảnh cũ không khả dụng (hãy tải lại ảnh)'
                            : 'Ảnh hiện tại của linh kiện'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {selectedFile
                          ? `${(selectedFile.size / 1024).toFixed(1)} KB • Sẵn sàng tải lên`
                          : previewError
                            ? 'Đường dẫn ảnh cũ bị lỗi hoặc chưa được đồng bộ'
                            : imageUrl.startsWith('data:')
                              ? 'Đã lưu trữ trực tiếp trong hệ thống'
                              : 'Đã lưu trên Cloud Storage'}
                      </p>
                      <div className="flex items-center space-x-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 underline"
                        >
                          Chọn ảnh khác
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setPreviewUrl('');
                            setPreviewError(false);
                            setImageUrl('');
                          }}
                          className="text-[11px] font-medium text-rose-600 hover:text-rose-700 underline"
                        >
                          Gỡ ảnh
                        </button>
                      </div>
                    </div>
                    {uploadSuccess && (
                      <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200 shrink-0">
                        <CheckCircle className="h-3 w-3" />
                        <span>Đã đồng bộ</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-4 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer group"
                  >
                    <div className="rounded-full bg-blue-50 p-2 text-blue-600 group-hover:scale-110 transition-transform">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-slate-700">
                      Nhấn để chọn tệp hình ảnh từ máy tính
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Định dạng PNG, JPG, WebP (Tối đa 5 MB) • Tự động tối ưu & lưu an toàn
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={imageUrl.startsWith('data:') ? '' : imageUrl}
                  onChange={(e) => {
                    setSelectedFile(null);
                    setPreviewError(false);
                    setImageUrl(e.target.value);
                    setPreviewUrl(e.target.value);
                  }}
                  placeholder="https://example.com/hinh-anh-linh-kien.jpg"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400">
                  Dán đường dẫn HTTPS trực tiếp của hình ảnh linh kiện (nếu có sẵn link ngoài)
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || uploadingImage}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              <Save className="h-3.5 w-3.5" />
              <span>
                {uploadingImage
                  ? 'Đang tải ảnh lên...'
                  : submitting
                    ? 'Đang lưu...'
                    : mode === 'create'
                      ? 'Tạo linh kiện'
                      : 'Lưu cập nhật'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
