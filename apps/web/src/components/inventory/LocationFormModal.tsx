import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, Save, Plus, Layers, Warehouse, Grid, Box } from 'lucide-react';
import { LocationType, LocationResponse, LocationNode } from '@acm/shared';
import { isLocationWriteEnabled } from '../../config/features';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface LocationFormModalProps {
  isOpen: boolean;
  mode: 'CREATE' | 'EDIT';
  initialLocation?: LocationResponse | any;
  defaultParentId?: string;
  existingLocations: LocationResponse[] | LocationNode[];
  onClose: () => void;
  onSubmit: (data: {
    code: string;
    name: string;
    type: LocationType;
    parentId?: string | null;
  }) => Promise<void>;
  isSubmitting?: boolean;
  serverError?: string | null;
}

// Helper to flatten recursive tree nodes if tree is provided
function flattenLocations(nodes: Array<LocationResponse | LocationNode>): LocationResponse[] {
  const result: LocationResponse[] = [];
  const traverse = (items: any[]) => {
    for (const item of items) {
      result.push({
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        parentId: item.parentId,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      if (item.children && Array.isArray(item.children) && item.children.length > 0) {
        traverse(item.children);
      }
    }
  };
  traverse(nodes);
  return result;
}

// Helper to collect all descendant IDs of a location (for anti-loop check)
function getDescendantIds(locationId: string, all: LocationResponse[]): Set<string> {
  const descendantIds = new Set<string>();
  const queue = [locationId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const loc of all) {
      if (loc.parentId === currentId && !descendantIds.has(loc.id)) {
        descendantIds.add(loc.id);
        queue.push(loc.id);
      }
    }
  }

  return descendantIds;
}

export const LocationFormModal: React.FC<LocationFormModalProps> = ({
  isOpen,
  mode,
  initialLocation,
  defaultParentId,
  existingLocations,
  onClose,
  onSubmit,
  isSubmitting = false,
  serverError = null,
}) => {
  const isWriteEnabled = isLocationWriteEnabled();

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<LocationType>(LocationType.WAREHOUSE);
  const [parentId, setParentId] = useState<string>('');

  // Field error states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localServerError, setLocalServerError] = useState<string | null>(null);

  // Flattened list of existing locations
  const flatLocations = useMemo(() => {
    return flattenLocations(existingLocations);
  }, [existingLocations]);

  // Set of forbidden parent IDs in EDIT mode (self + descendants)
  const forbiddenParentIds = useMemo(() => {
    if (mode !== 'EDIT' || !initialLocation) return new Set<string>();
    const forbidden = getDescendantIds(initialLocation.id, flatLocations);
    forbidden.add(initialLocation.id); // Cannot be parent of itself
    return forbidden;
  }, [mode, initialLocation, flatLocations]);

  // Initialize form fields when modal opens or initialLocation changes
  useEffect(() => {
    if (isOpen) {
      setErrors({});
      setLocalServerError(null);

      if (mode === 'EDIT' && initialLocation) {
        setCode(initialLocation.code || '');
        setName(initialLocation.name || '');
        setType(initialLocation.type || LocationType.WAREHOUSE);
        setParentId(initialLocation.parentId || '');
      } else {
        // CREATE mode
        setCode('');
        setName('');
        // If a defaultParentId is given, infer type based on parent's type
        if (defaultParentId) {
          const parentLoc = flatLocations.find((l) => l.id === defaultParentId);
          if (parentLoc) {
            setParentId(defaultParentId);
            if (parentLoc.type === LocationType.WAREHOUSE) {
              setType(LocationType.RACK);
            } else if (parentLoc.type === LocationType.RACK) {
              setType(LocationType.SHELF);
            } else if (parentLoc.type === LocationType.SHELF) {
              setType(LocationType.BIN);
            } else {
              setType(LocationType.BIN);
            }
          } else {
            setType(LocationType.WAREHOUSE);
            setParentId('');
          }
        } else {
          setType(LocationType.WAREHOUSE);
          setParentId('');
        }
      }
    }
  }, [isOpen, mode, initialLocation, defaultParentId, flatLocations]);

  // Filter eligible parent locations based on selected child type
  const eligibleParents = useMemo(() => {
    if (type === LocationType.WAREHOUSE) {
      return []; // Warehouse must be root
    }

    return flatLocations.filter((loc) => {
      // Must not be forbidden in EDIT mode (anti-loop)
      if (forbiddenParentIds.has(loc.id)) {
        return false;
      }
      // Must be active
      if (!loc.isActive) {
        return false;
      }

      // Hierarchy rules:
      // RACK -> parent must be WAREHOUSE
      if (type === LocationType.RACK) {
        return loc.type === LocationType.WAREHOUSE;
      }
      // SHELF -> parent must be RACK
      if (type === LocationType.SHELF) {
        return loc.type === LocationType.RACK;
      }
      // BIN -> parent must be SHELF or RACK (both 3-level and 4-level supported)
      if (type === LocationType.BIN) {
        return loc.type === LocationType.SHELF || loc.type === LocationType.RACK;
      }

      return false;
    });
  }, [type, flatLocations, forbiddenParentIds]);

  // Handle Type Change: auto-adjust parentId if current selection is invalid
  const handleTypeChange = (newType: LocationType) => {
    setType(newType);
    setErrors((prev) => ({ ...prev, type: '', parentId: '' }));

    if (newType === LocationType.WAREHOUSE) {
      setParentId('');
    } else {
      // Check if current parentId is eligible for the new type
      const isCurrentParentEligible = flatLocations.some((loc) => {
        if (loc.id !== parentId || !loc.isActive || forbiddenParentIds.has(loc.id)) {
          return false;
        }
        if (newType === LocationType.RACK) return loc.type === LocationType.WAREHOUSE;
        if (newType === LocationType.SHELF) return loc.type === LocationType.RACK;
        if (newType === LocationType.BIN) {
          return loc.type === LocationType.SHELF || loc.type === LocationType.RACK;
        }
        return false;
      });

      if (!isCurrentParentEligible) {
        // Pick first eligible parent if available
        const firstEligible = flatLocations.find((loc) => {
          if (!loc.isActive || forbiddenParentIds.has(loc.id)) return false;
          if (newType === LocationType.RACK) return loc.type === LocationType.WAREHOUSE;
          if (newType === LocationType.SHELF) return loc.type === LocationType.RACK;
          if (newType === LocationType.BIN) {
            return loc.type === LocationType.SHELF || loc.type === LocationType.RACK;
          }
          return false;
        });
        setParentId(firstEligible?.id || '');
      }
    }
  };

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    // Code validation
    if (!trimmedCode) {
      newErrors.code = 'Mã vị trí kho không được để trống';
    } else if (trimmedCode.length < 2) {
      newErrors.code = 'Mã vị trí phải có ít nhất 2 ký tự';
    } else if (trimmedCode.length > 50) {
      newErrors.code = 'Mã vị trí không được vượt quá 50 ký tự';
    } else if (!/^[A-Za-z0-9_-]+$/.test(trimmedCode)) {
      newErrors.code = 'Mã vị trí chỉ được chứa chữ cái, số, dấu gạch ngang (-) và gạch dưới (_)';
    }

    // Name validation
    if (!trimmedName) {
      newErrors.name = 'Tên vị trí kho không được để trống';
    } else if (trimmedName.length < 2) {
      newErrors.name = 'Tên vị trí phải có ít nhất 2 ký tự';
    } else if (trimmedName.length > 100) {
      newErrors.name = 'Tên vị trí không được vượt quá 100 ký tự';
    }

    // Hierarchy validation
    if (type === LocationType.WAREHOUSE) {
      if (parentId) {
        newErrors.parentId = 'Vị trí Kho tổng (WAREHOUSE) là vị trí gốc cao nhất, không thể có vị trí cha';
      }
    } else {
      if (!parentId) {
        newErrors.parentId = `Vị trí loại '${type}' bắt buộc phải chọn vị trí cha`;
      } else {
        const parentLoc = flatLocations.find((l) => l.id === parentId);
        if (!parentLoc) {
          newErrors.parentId = 'Vị trí cha được chọn không tồn tại';
        } else if (!parentLoc.isActive) {
          newErrors.parentId = 'Không thể chọn vị trí cha đang bị vô hiệu hóa';
        } else {
          // Level checks
          if (type === LocationType.RACK && parentLoc.type !== LocationType.WAREHOUSE) {
            newErrors.parentId = 'Vị trí Kệ (RACK) phải trực thuộc Kho tổng (WAREHOUSE)';
          } else if (type === LocationType.SHELF && parentLoc.type !== LocationType.RACK) {
            newErrors.parentId = 'Vị trí Tầng kệ (SHELF) phải trực thuộc Kệ (RACK)';
          } else if (
            type === LocationType.BIN &&
            parentLoc.type !== LocationType.SHELF &&
            parentLoc.type !== LocationType.RACK
          ) {
            newErrors.parentId = 'Vị trí Khay/Hộp (BIN) phải trực thuộc Tầng kệ (SHELF) hoặc Kệ (RACK)';
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalServerError(null);

    if (!isWriteEnabled) {
      setLocalServerError(
        'Chức năng ghi vị trí kho đang tạm khóa ở giai đoạn thử nghiệm (VITE_ENABLE_LOCATION_WRITES=false).'
      );
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        parentId: type === LocationType.WAREHOUSE ? null : parentId || null,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Đã xảy ra lỗi khi lưu thông tin vị trí kho.';
      setLocalServerError(msg);
    }
  };

  const backdropDismiss = useModalDismiss(isOpen, onClose, isSubmitting);

  if (!isOpen) return null;

  return (
    <div
      {...backdropDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl transition-all border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              {mode === 'CREATE' ? <Plus className="h-5 w-5" /> : <Save className="h-5 w-5" />}
            </div>
            <div>
              <h3 id="location-modal-title" className="text-sm font-bold text-slate-900 sm:text-base">
                {mode === 'CREATE' ? 'Thêm Mới Vị Trí Kho' : 'Chỉnh Sửa Vị Trí Kho'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {mode === 'CREATE'
                  ? 'Thiết lập cấu trúc lưu trữ và phân cấp kho'
                  : `Cập nhật thông tin cho vị trí ${initialLocation?.code || ''}`}
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
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <span className="font-semibold">Chế độ Thử nghiệm (Feature Flag OFF):</span> Chức năng ghi vị trí đang bị tạm khóa để bảo vệ an toàn dữ liệu. Thao tác không thể gửi yêu cầu ghi thật.
            </div>
          </div>
        )}

        {/* Server Error Alert */}
        {(localServerError || serverError) && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-200/80 flex items-start space-x-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs font-medium text-rose-800">
              {localServerError || serverError}
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Location Code */}
          <div>
            <label htmlFor="location-code" className="block text-xs font-bold text-slate-700">
              Mã vị trí kho <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1">
              <input
                id="location-code"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setErrors((prev) => ({ ...prev, code: '' }));
                }}
                disabled={isSubmitting || !isWriteEnabled}
                placeholder="VD: WH-MAIN, RACK-A, BIN-A1"
                className={`w-full rounded-lg border px-3 py-2 text-xs font-mono font-semibold text-slate-900 transition-colors focus:outline-none focus:ring-1 ${
                  errors.code
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/20'
                    : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500'
                } disabled:bg-slate-50 disabled:text-slate-500`}
              />
              {errors.code && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.code}</p>
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Chỉ bao gồm chữ cái in hoa, số, dấu gạch ngang (-) hoặc gạch dưới (_). Tối đa 50 ký tự.
            </p>
          </div>

          {/* Location Name */}
          <div>
            <label htmlFor="location-name" className="block text-xs font-bold text-slate-700">
              Tên vị trí kho <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1">
              <input
                id="location-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: '' }));
                }}
                disabled={isSubmitting || !isWriteEnabled}
                placeholder="VD: Kho Tổng Lab, Kệ Linh Kiện A, Khay A1"
                className={`w-full rounded-lg border px-3 py-2 text-xs text-slate-900 transition-colors focus:outline-none focus:ring-1 ${
                  errors.name
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/20'
                    : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500'
                } disabled:bg-slate-50 disabled:text-slate-500`}
              />
              {errors.name && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.name}</p>
              )}
            </div>
          </div>

          {/* Location Type */}
          <div>
            <label htmlFor="location-type" className="block text-xs font-bold text-slate-700">
              Loại vị trí <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1">
              <select
                id="location-type"
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as LocationType)}
                disabled={isSubmitting || !isWriteEnabled}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value={LocationType.WAREHOUSE}>Kho tổng (WAREHOUSE) – Gốc cao nhất</option>
                <option value={LocationType.RACK}>Kệ chứa đồ (RACK) – Thuộc Kho</option>
                <option value={LocationType.SHELF}>Tầng kệ (SHELF) – Thuộc Kệ (Tùy chọn)</option>
                <option value={LocationType.BIN}>Khay/Hộp linh kiện (BIN) – Thuộc Kệ hoặc Tầng kệ</option>
              </select>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Cây phân cấp hỗ trợ cả mô hình 3 cấp (Kho → Kệ → Khay) và 4 cấp (Kho → Kệ → Tầng kệ → Khay).
            </p>
          </div>

          {/* Parent Location Dropdown */}
          <div>
            <label htmlFor="location-parent" className="block text-xs font-bold text-slate-700">
              Vị trí trực thuộc (Cha){' '}
              {type !== LocationType.WAREHOUSE && <span className="text-rose-500">*</span>}
            </label>
            <div className="mt-1">
              {type === LocationType.WAREHOUSE ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 italic">
                  Không có (Kho tổng là vị trí gốc cao nhất)
                </div>
              ) : (
                <select
                  id="location-parent"
                  value={parentId}
                  onChange={(e) => {
                    setParentId(e.target.value);
                    setErrors((prev) => ({ ...prev, parentId: '' }));
                  }}
                  disabled={isSubmitting || !isWriteEnabled}
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors focus:outline-none focus:ring-1 ${
                    errors.parentId
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/20'
                      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500'
                  } disabled:bg-slate-50 disabled:text-slate-500`}
                >
                  <option value="">-- Chọn vị trí cha hợp lệ --</option>
                  {eligibleParents.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.type}] {p.code} – {p.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.parentId && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.parentId}</p>
              )}
            </div>
            {type !== LocationType.WAREHOUSE && eligibleParents.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">
                Chưa có vị trí cha phù hợp ({type === LocationType.RACK ? 'cần tạo WAREHOUSE trước' : type === LocationType.SHELF ? 'cần tạo RACK trước' : 'cần tạo RACK hoặc SHELF trước'}).
              </p>
            )}
          </div>

          {/* Modal Actions */}
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
              className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  {mode === 'CREATE' ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  <span>{mode === 'CREATE' ? 'Tạo vị trí' : 'Lưu thay đổi'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
