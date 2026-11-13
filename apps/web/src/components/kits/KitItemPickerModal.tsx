import React, { useState, useMemo } from 'react';
import { Search, X, Check, Plus, Minus, Layers, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface ItemStockBalance {
  locationId: string;
  available: number;
  onHand: number;
  location?: { id: string; code: string; name: string };
}

export interface KitPickerItemOption {
  id: string;
  code: string;
  name: string;
  unit?: string;
  categoryId?: string;
  categoryName?: string;
  category?: { id: string; code: string; name: string };
  totalOnHand?: number;
  available?: number;
  stockBalances?: ItemStockBalance[];
}

export interface KitItemPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: KitPickerItemOption[];
  selectedLocationId?: string;
  selectedLocationName?: string;
  alreadySelectedIds: Set<string>;
  onAddItems: (itemsToAdd: Array<{ itemId: string; quantity: number; notes?: string }>) => void;
}

function removeTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export const KitItemPickerModal: React.FC<KitItemPickerModalProps> = ({
  isOpen,
  onClose,
  items,
  selectedLocationId,
  selectedLocationName,
  alreadySelectedIds,
  onAddItems,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('ALL');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [selectedMap, setSelectedMap] = useState<Map<string, number>>(new Map());

  const backdropDismiss = useModalDismiss(isOpen, onClose);

  // Group categories from items list
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const item of items) {
      const catId = item.categoryId || item.category?.id || 'other';
      const catName = item.category?.name || item.categoryName || 'Khác / Chưa phân loại';
      const existing = map.get(catId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(catId, { id: catId, name: catName, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [items]);

  // Compute available stock helper
  const getAvailableStock = (item: KitPickerItemOption): number => {
    if (!selectedLocationId || !item.stockBalances) return 0;
    const b = item.stockBalances.find((bal) => bal.locationId === selectedLocationId);
    return b ? b.available : 0;
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    const termClean = removeTones(searchTerm.trim());
    return items.filter((item) => {
      // Category filter
      if (selectedCatId !== 'ALL') {
        const itemCatId = item.categoryId || item.category?.id || 'other';
        if (itemCatId !== selectedCatId) return false;
      }

      // Stock filter
      if (onlyInStock && selectedLocationId) {
        const avail = getAvailableStock(item);
        if (avail <= 0) return false;
      }

      // Search term filter
      if (termClean) {
        const codeClean = removeTones(item.code || '');
        const nameClean = removeTones(item.name || '');
        if (!codeClean.includes(termClean) && !nameClean.includes(termClean)) {
          return false;
        }
      }

      return true;
    });
  }, [items, searchTerm, selectedCatId, onlyInStock, selectedLocationId]);

  if (!isOpen) return null;

  const handleToggleItem = (itemId: string) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.set(itemId, 1);
      }
      return next;
    });
  };

  const handleUpdateQty = (itemId: string, qty: number) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      next.set(itemId, Math.max(1, qty));
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      for (const it of filteredItems) {
        if (!alreadySelectedIds.has(it.id) && !next.has(it.id)) {
          next.set(it.id, 1);
        }
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedMap(new Map());
  };

  const handleConfirm = () => {
    const toAdd: Array<{ itemId: string; quantity: number; notes?: string }> = [];
    selectedMap.forEach((qty, itemId) => {
      toAdd.push({ itemId, quantity: qty });
    });
    if (toAdd.length > 0) {
      onAddItems(toAdd);
      setSelectedMap(new Map());
      onClose();
    }
  };

  const selectedCount = selectedMap.size;
  const totalUnits = Array.from(selectedMap.values()).reduce((sum, q) => sum + q, 0);

  return (
    <div
      {...backdropDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-6 py-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Tìm & Chọn linh kiện thêm vào Kit thực hành
              </h3>
              <p className="text-[11px] text-slate-500">
                {selectedLocationName ? (
                  <span>
                    Kho đã chọn: <strong className="text-slate-700">{selectedLocationName}</strong> (Tồn kho hiển thị theo vị trí này)
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center space-x-1">
                    <AlertCircle className="h-3 w-3 inline" />
                    <span>Chưa chọn vị trí kho. Hãy chọn vị trí kho để kiểm tra tồn kho chính xác.</span>
                  </span>
                )}
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

        {/* Filter & Search Bar */}
        <div className="border-b border-slate-200 p-4 space-y-3 bg-white">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên linh kiện hoặc mã SKU (vd: ESP32, Servo, IR, MAIN...)..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-9 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Toggle In-Stock */}
            {selectedLocationId && (
              <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 shrink-0">
                <input
                  type="checkbox"
                  checked={onlyInStock}
                  onChange={(e) => setOnlyInStock(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-[11px]">Chỉ hiện món còn tồn kho ({'>'} 0)</span>
              </label>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setSelectedCatId('ALL')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                selectedCatId === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({items.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCatId(cat.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  selectedCatId === cat.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.name} ({cat.count})
              </button>
            ))}
          </div>

          {/* Quick select buttons */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>
              Tìm thấy <strong className="text-slate-800">{filteredItems.length}</strong> linh kiện phù hợp
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
              >
                + Chọn tất cả đang lọc
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Bỏ chọn hết
              </button>
            </div>
          </div>
        </div>

        {/* Items Table / List */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Layers className="h-10 w-10 text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-600">Không tìm thấy linh kiện phù hợp</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {filteredItems.map((item) => {
                const isAlreadyInKit = alreadySelectedIds.has(item.id);
                const isChecked = selectedMap.has(item.id);
                const quantity = selectedMap.get(item.id) || 1;
                const availStock = selectedLocationId ? getAvailableStock(item) : (item.totalOnHand ?? item.available ?? 0);

                return (
                  <div
                    key={item.id}
                    onClick={() => !isAlreadyInKit && handleToggleItem(item.id)}
                    className={`flex items-center justify-between p-3 transition-colors ${
                      isAlreadyInKit
                        ? 'bg-slate-50/80 opacity-60 cursor-not-allowed'
                        : isChecked
                        ? 'bg-blue-50/70 hover:bg-blue-50 cursor-pointer'
                        : 'bg-white hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    {/* Left: Checkbox & Name */}
                    <div className="flex items-center space-x-3 min-w-0 pr-3">
                      <div className="shrink-0 text-slate-400">
                        {isAlreadyInKit ? (
                          <Check className="h-4 w-4 text-slate-400" />
                        ) : isChecked ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">
                            {item.code}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {item.name}
                          </span>
                          {isAlreadyInKit && (
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              Đã có trong kit
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center space-x-2 text-[11px] text-slate-400">
                          <span>{item.category?.name || item.categoryName || 'Linh kiện'}</span>
                          <span>•</span>
                          <span>ĐVT: {item.unit || 'cái'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Stock Badge & Stepper */}
                    <div
                      className="flex items-center space-x-3 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Stock Badge */}
                      <div className="text-right">
                        {selectedLocationId ? (
                          availStock > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                              Còn {availStock} {item.unit || 'cái'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                              Hết hàng (0)
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            Kho: {availStock} {item.unit || 'cái'}
                          </span>
                        )}
                      </div>

                      {/* Stepper if checked */}
                      {isChecked && !isAlreadyInKit && (
                        <div className="flex items-center space-x-1 bg-white rounded-lg border border-slate-300 p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.id, quantity - 1)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) =>
                              handleUpdateQty(item.id, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-12 text-center text-xs font-bold text-slate-800 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.id, quantity + 1)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/75 px-6 py-3.5">
          <div className="text-xs text-slate-600">
            {selectedCount > 0 ? (
              <span>
                Đã chọn <strong className="text-blue-600">{selectedCount}</strong> loại linh kiện (Tổng{' '}
                <strong className="text-slate-900">{totalUnits}</strong> món)
              </span>
            ) : (
              <span className="text-slate-400">Chưa chọn linh kiện nào</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirm}
              className={`inline-flex items-center space-x-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-soft transition-all cursor-pointer ${
                selectedCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
                  : 'bg-slate-300 opacity-60 cursor-not-allowed'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              <span>Thêm {selectedCount > 0 ? `${selectedCount} linh kiện` : ''} vào Kit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
