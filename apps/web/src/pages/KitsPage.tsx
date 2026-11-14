import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Boxes,
  Plus,
  Package,
  Search,
  RefreshCw,
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Minus,
  Check,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { apiClient } from '../services/api';
import { KitStatus } from '@acm/shared';

interface KitItemComponent {
  id: string;
  itemId: string;
  item?: { id: string; code: string; name: string; unit: string; type: string };
  quantity: number;
  notes?: string | null;
}

interface KitRecord {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  locationId?: string | null;
  location?: { id: string; code: string; name: string } | null;
  createdById?: string | null;
  createdBy?: { id: string; fullName: string; email: string } | null;
  items: KitItemComponent[];
  totalItems: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemStockBalance {
  locationId: string;
  available: number;
  onHand: number;
  reserved?: number;
  quarantined?: number;
  kitAllocated?: number;
  location?: { id: string; code: string; name: string };
}

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryId?: string;
  categoryName?: string;
  category?: { id: string; code: string; name: string };
  totalOnHand?: number;
  available?: number;
  stockBalances?: ItemStockBalance[];
}

interface LocationOption {
  id: string;
  code: string;
  name: string;
}

export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const STOP_WORDS = new Set([
  'KIT',
  'HOP',
  'BO',
  'THUC',
  'HANH',
  'BAI',
  'CHU',
  'DE',
  'MON',
  'LOP',
  'PHONG',
  'LAB',
  'CUA',
  'CHO',
  'THE',
  'VA',
  'VAO',
]);

export function extractKitTag(name: string): string {
  if (!name || !name.trim()) return 'KIT';

  const clean = removeVietnameseTones(name.trim())
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .toUpperCase();

  const allWords = clean.split(/\s+/).filter(Boolean);
  // Filter out pure numbers and common stop words
  const textWords = allWords.filter((w) => !/^\d+$/.test(w) && !STOP_WORDS.has(w));

  if (textWords.length === 0) {
    const fallback = allWords.filter((w) => !/^\d+$/.test(w));
    if (fallback.length > 0) return fallback[0].slice(0, 4);
    return 'KIT';
  }

  // If 2 or more words (e.g. AI FANTASY ZOO -> AFZ, Vi dieu khien -> VDK):
  if (textWords.length >= 2) {
    const initials = textWords.map((w) => w[0]).join('');
    if (initials.length >= 2 && initials.length <= 5) {
      return initials;
    }
    return initials.slice(0, 4);
  }

  // 1 word only
  const single = textWords[0];
  if (single.length <= 5) return single;
  return single.slice(0, 4);
}

export function extractKitNumber(name: string): number | null {
  if (!name) return null;
  const clean = removeVietnameseTones(name).toLowerCase();

  const patterns = [
    /(?:chu\s*de|bai|hop|tap|so|part|vol|cd|#)\s*(\d+)/i,
    /(?:^|\s|-|_|v)(\d+)(?:\s*$)/,
    /\b(\d+)\b/,
  ];

  for (const regex of patterns) {
    const m = clean.match(regex);
    if (m && m[1]) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > 0 && num < 1000) {
        return num;
      }
    }
  }

  return null;
}

export function generateKitCode(
  name: string,
  existingCodes: string[] | Set<string> = []
): string {
  if (!name || !name.trim()) return '';

  const tag = extractKitTag(name);
  const explicitNum = extractKitNumber(name);

  const codeSet =
    existingCodes instanceof Set
      ? existingCodes
      : new Set(existingCodes.map((c) => c.toUpperCase()));

  let seq = explicitNum !== null ? explicitNum : 1;

  const formatCode = (t: string, s: number) => {
    const pad = s < 100 ? String(s).padStart(2, '0') : String(s);
    return t === 'KIT' ? `KIT-${pad}` : `KIT-${t}-${pad}`;
  };

  let candidate = formatCode(tag, seq);

  // Auto-increment seq until candidate is unique among existingCodes
  while (codeSet.has(candidate.toUpperCase())) {
    seq += 1;
    candidate = formatCode(tag, seq);
  }

  return candidate;
}

interface KitItemComboboxProps {
  value: string;
  onChange: (itemId: string) => void;
  itemsList: ItemOption[];
  groupedItems: { categoryName: string; items: ItemOption[] }[];
}

const KitItemCombobox: React.FC<KitItemComboboxProps> = ({
  value,
  onChange,
  itemsList,
  groupedItems,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => itemsList.find((it) => it.id === value), [itemsList, value]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter items and categories based on search
  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groupedItems;

    const result: { categoryName: string; items: ItemOption[] }[] = [];
    for (const grp of groupedItems) {
      const matchedItems = grp.items.filter(
        (it) =>
          it.code.toLowerCase().includes(q) ||
          it.name.toLowerCase().includes(q) ||
          (it.categoryName || '').toLowerCase().includes(q) ||
          (it.category?.name || '').toLowerCase().includes(q)
      );
      if (matchedItems.length > 0) {
        result.push({
          categoryName: grp.categoryName,
          items: matchedItems,
        });
      }
    }
    return result;
  }, [groupedItems, searchTerm]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      {selectedItem ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/40 hover:bg-blue-50/70 px-2.5 py-1.5 text-xs text-left transition shadow-2xs group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <div className="flex items-center space-x-2 min-w-0 flex-1 mr-1.5">
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-100 font-mono text-[10px] font-bold text-blue-800 border border-blue-200/60">
              {selectedItem.code}
            </span>
            <span className="truncate font-semibold text-slate-800 text-xs" title={selectedItem.name}>
              {selectedItem.name}
            </span>
          </div>
          <div className="flex items-center space-x-1 shrink-0 text-[10px] font-medium text-slate-400 group-hover:text-blue-600 transition">
            <span>Đổi</span>
            <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-blue-600 transition" />
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between rounded-lg border border-slate-300 bg-white hover:border-blue-400 px-2.5 py-1.5 text-xs text-slate-500 transition shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <div className="flex items-center space-x-1.5 text-slate-500">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <span>Chọn linh kiện...</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      )}

      {/* Selected Item Sub-badge */}
      {selectedItem && (
        <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-slate-500 font-medium pl-0.5">
          <span className="truncate max-w-[130px]" title={selectedItem.category?.name || selectedItem.categoryName || 'Linh kiện'}>
            🏷️ {selectedItem.category?.name || selectedItem.categoryName || 'Linh kiện'}
          </span>
          <span>•</span>
          <span>ĐVT: {selectedItem.unit || 'cái'}</span>
        </div>
      )}

      {/* Custom Floating Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-[330px] sm:w-[380px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Bar */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Gõ mã (VD: SEN, MAIN) hoặc tên..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Grouped Component List */}
          <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1 text-left custom-scrollbar">
            {filteredGroups.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Không tìm thấy linh kiện nào khớp với "<strong>{searchTerm}</strong>"
              </div>
            ) : (
              filteredGroups.map((grp) => (
                <div key={grp.categoryName} className="space-y-1">
                  <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs py-0.5 px-1 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <span className="flex items-center space-x-1">
                      <span>📁</span>
                      <span>{grp.categoryName}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-full font-semibold">
                      {grp.items.length} món
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {grp.items.map((itm) => {
                      const isSelected = itm.id === value;
                      const totalStock =
                        itm.totalOnHand ??
                        itm.available ??
                        itm.stockBalances?.reduce((sum, b) => sum + (b.available || 0), 0) ??
                        0;

                      return (
                        <button
                          key={itm.id}
                          type="button"
                          onClick={() => {
                            onChange(itm.id);
                            setIsOpen(false);
                            setSearchTerm('');
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200/80'
                              : 'hover:bg-slate-50 text-slate-800 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] font-bold text-slate-700 border border-slate-200/60">
                              {itm.code}
                            </span>
                            <span className="truncate text-xs">
                              {itm.name}
                            </span>
                          </div>

                          <div className="shrink-0 flex items-center space-x-1.5">
                            {totalStock > 0 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Sẵn có: {totalStock}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                Hết hàng
                              </span>
                            )}
                            {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const KitsPage: React.FC = () => {
  const { user } = useAuth();
  const isOperator = user?.role === 'ADMIN' || user?.role === 'LAB_MANAGER' || user?.role === 'TECHNICIAN';
  const canDelete = user?.role === 'ADMIN' || user?.role === 'LAB_MANAGER';

  const [kits, setKits] = useState<KitRecord[]>([]);
  const [itemsList, setItemsList] = useState<ItemOption[]>([]);
  const [locationsList, setLocationsList] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedKitId, setExpandedKitId] = useState<string | null>(null);

  const existingCodes = useMemo(
    () => new Set(kits.map((k) => (k.code || '').trim().toUpperCase())),
    [kits]
  );

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState<boolean>(false);

  const handleOpenCreateModal = () => {
    setIsCodeManuallyEdited(false);
    fetchOptions();
    setCreateFormData({
      code: '',
      name: '',
      description: '',
      locationId: locationsList[0]?.id || '',
      items: [{ itemId: '', quantity: 1, notes: '' }],
    });
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setIsCodeManuallyEdited(false);
  };

  const createBackdropDismiss = useModalDismiss(
    isCreateModalOpen,
    handleCloseCreateModal
  );
  const [createFormData, setCreateFormData] = useState<{
    code: string;
    name: string;
    description: string;
    locationId: string;
    items: { itemId: string; locationId?: string; quantity: number; notes: string }[];
  }>({
    code: '',
    name: '',
    description: '',
    locationId: '',
    items: [{ itemId: '', locationId: '', quantity: 1, notes: '' }],
  });

  // Auto-select first location when locationsList becomes available while modal is open
  useEffect(() => {
    if (isCreateModalOpen && locationsList.length > 0 && !createFormData.locationId) {
      setCreateFormData((prev) => ({
        ...prev,
        locationId: locationsList[0].id,
      }));
    }
  }, [isCreateModalOpen, locationsList]);

  // Group available categories from itemsList
  const availableCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const item of itemsList) {
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
  }, [itemsList]);

  // Group items by category for <optgroup> dropdown in each row
  const groupedItemsByCategory = useMemo(() => {
    const map = new Map<string, { categoryName: string; items: ItemOption[] }>();
    for (const item of itemsList) {
      const catName = (item.category?.name || item.categoryName || '').trim() || 'Linh kiện khác';
      const existing = map.get(catName);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(catName, { categoryName: catName, items: [item] });
      }
    }
    // Sort categories: standard categories alphabetically, 'Linh kiện khác' at the end
    const sortedCategories = Array.from(map.values()).sort((a, b) => {
      if (a.categoryName === 'Linh kiện khác') return 1;
      if (b.categoryName === 'Linh kiện khác') return -1;
      return a.categoryName.localeCompare(b.categoryName, 'vi');
    });

    // Within each category, sort items by code then name
    for (const grp of sortedCategories) {
      grp.items.sort((a, b) =>
        (a.code || '').localeCompare(b.code || '', 'vi') ||
        (a.name || '').localeCompare(b.name || '', 'vi')
      );
    }

    return sortedCategories;
  }, [itemsList]);

  // Stock availability helper at selected location
  const getItemStockAtLocation = (item: ItemOption | undefined, locationId: string): number => {
    if (!item || !locationId || !item.stockBalances) return 0;
    const bal = item.stockBalances.find((b) => b.locationId === locationId);
    return bal ? bal.available : 0;
  };

  // Helper: find stock of item at other locations
  const getOtherLocationsStockInfo = (item: ItemOption | undefined, currentLocationId: string) => {
    if (!item || !item.stockBalances) return { totalOther: 0, details: [] as string[] };
    const otherBals = item.stockBalances.filter(
      (b) => b.locationId !== currentLocationId && (b.available || 0) > 0
    );
    const details = otherBals.map((b) => {
      const locName = b.location?.name || locationsList.find((l) => l.id === b.locationId)?.name || b.location?.code || b.locationId;
      const avail = b.available || 0;
      return `• ${locName}: còn ${avail} ${item.unit || 'cái'}`;
    });
    const totalOther = otherBals.reduce((sum, b) => sum + (b.available || 0), 0);
    return { totalOther, details };
  };

  // Count items in kit exceeding available stock at chosen source location
  const insufficientStockItemsCount = useMemo(() => {
    return createFormData.items.filter((row) => {
      if (!row.itemId) return false;
      const itm = itemsList.find((it) => it.id === row.itemId);
      const effectiveLoc = row.locationId || createFormData.locationId;
      const avail = getItemStockAtLocation(itm, effectiveLoc);
      return avail < row.quantity;
    }).length;
  }, [createFormData.items, createFormData.locationId, itemsList]);

  // Handler: Batch add all items in a category
  const handleAddCategoryItems = (catId: string) => {
    if (!catId) return;
    const catItems = itemsList.filter(
      (it) => (it.categoryId || it.category?.id || 'other') === catId
    );
    if (catItems.length === 0) return;

    setCreateFormData((prev) => {
      const existingItemIds = new Set(prev.items.map((i) => i.itemId).filter(Boolean));
      const toAdd = catItems.filter((it) => !existingItemIds.has(it.id));
      if (toAdd.length === 0) return prev;

      const cleaned = prev.items.filter((i) => Boolean(i.itemId));
      const newLines = toAdd.map((it) => {
        let bestLocId = '';
        if (it.stockBalances && it.stockBalances.length > 0) {
          const kitLocBal = it.stockBalances.find((b) => b.locationId === prev.locationId && (b.available || 0) > 0);
          if (kitLocBal) {
            bestLocId = prev.locationId;
          } else {
            const firstStocked = it.stockBalances.find((b) => (b.available || 0) > 0);
            if (firstStocked) bestLocId = firstStocked.locationId;
          }
        }
        return {
          itemId: it.id,
          locationId: bestLocId || prev.locationId || '',
          quantity: 1,
          notes: '',
        };
      });

      return {
        ...prev,
        items: [...cleaned, ...newLines],
      };
    });
  };

  // Handler: Clear all items
  const handleClearItems = () => {
    if (createFormData.items.length <= 1 && !createFormData.items[0]?.itemId) return;
    if (window.confirm('Bạn có chắc chắn muốn xóa tất cả linh kiện khỏi kit này?')) {
      setCreateFormData((prev) => ({
        ...prev,
        items: [{ itemId: '', quantity: 1, notes: '' }],
      }));
    }
  };

  const fetchKits = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (activeTab !== 'ALL') params.status = activeTab;

      const res = await apiClient.get('/kits', { params });
      if (res.data?.success) {
        const rawData = res.data.data;
        const list = Array.isArray(rawData) ? rawData : rawData?.items || [];
        setKits(list);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Không thể tải danh sách hộp kit. Vui lòng thử lại.',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [itemsRes, locsRes] = await Promise.allSettled([
        apiClient.get('/items', { params: { limit: 100 } }),
        apiClient.get('/locations', { params: { limit: 100 } }),
      ]);

      if (itemsRes.status === 'fulfilled' && itemsRes.value.data?.success) {
        const raw = itemsRes.value.data.data;
        const items = Array.isArray(raw) ? raw : raw?.items || [];
        setItemsList(items);
      } else if (itemsRes.status === 'rejected') {
        console.error('Lỗi khi nạp danh sách linh kiện:', itemsRes.reason);
      }

      if (locsRes.status === 'fulfilled' && locsRes.value.data?.success) {
        const raw = locsRes.value.data.data;
        const locs = Array.isArray(raw) ? raw : raw?.locations || raw?.items || [];
        setLocationsList(locs);
      } else if (locsRes.status === 'rejected') {
        console.error('Lỗi khi nạp danh sách vị trí kho:', locsRes.reason);
      }
    } catch (err) {
      console.warn('Không thể nạp danh mục phụ trợ cho modal Kit', err);
    }
  };

  useEffect(() => {
    fetchKits();
  }, [activeTab]);

  useEffect(() => {
    if (isOperator) {
      fetchOptions();
    }
  }, [isOperator]);

  const handleStatusChange = async (kitId: string, targetStatus: KitStatus) => {
    setActionLoading(kitId);
    setStatusMessage(null);
    try {
      const res = await apiClient.patch(`/kits/${kitId}/status`, {
        status: targetStatus,
      });
      if (res.data?.success) {
        setStatusMessage({
          type: 'success',
          text: `Đã cập nhật trạng thái hộp kit sang '${targetStatus}' thành công`,
        });
        fetchKits();
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Không thể cập nhật trạng thái hộp kit',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteKit = async (kitId: string, kitCode: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa hộp kit '${kitCode}'? Thao tác này sẽ giải phóng linh kiện về kho.`)) {
      return;
    }
    setActionLoading(kitId);
    setStatusMessage(null);
    try {
      const res = await apiClient.delete(`/kits/${kitId}`);
      if (res.data?.success) {
        setStatusMessage({
          type: 'success',
          text: res.data?.message || `Đã xóa hộp kit '${kitCode}' thành công`,
        });
        fetchKits();
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Không thể xóa hộp kit',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // Frontend validation
    if (!createFormData.code.trim()) {
      setStatusMessage({ type: 'error', text: 'Mã hộp kit không được để trống' });
      return;
    }
    if (!createFormData.name.trim()) {
      setStatusMessage({ type: 'error', text: 'Tên hộp kit không được để trống' });
      return;
    }
    if (!createFormData.locationId) {
      setStatusMessage({ type: 'error', text: 'Vui lòng chọn vị trí kho lưu trữ cho hộp kit' });
      return;
    }
    const validItems = createFormData.items.filter((i) => i.itemId && i.quantity > 0);
    if (validItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'Vui lòng chọn ít nhất một linh kiện hợp lệ' });
      return;
    }

    const itemIds = validItems.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      setStatusMessage({ type: 'error', text: 'Danh sách linh kiện trong kit không được trùng lặp' });
      return;
    }

    try {
      const payload: any = {
        code: createFormData.code.trim().toUpperCase(),
        name: createFormData.name.trim(),
        description: createFormData.description.trim() || undefined,
        locationId: createFormData.locationId || undefined,
        items: validItems.map((i) => ({
          itemId: i.itemId,
          locationId: i.locationId || undefined,
          quantity: Number(i.quantity),
          notes: i.notes.trim() || undefined,
        })),
      };

      const res = await apiClient.post('/kits', payload);
      if (res.data?.success) {
        setStatusMessage({ type: 'success', text: 'Tạo hộp kit thực hành thành công' });
        handleCloseCreateModal();
        fetchKits();
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Không thể tạo hộp kit. Vui lòng kiểm tra tồn kho.',
      });
    }
  };

  const addItemRow = () => {
    setCreateFormData((prev) => ({
      ...prev,
      items: [...prev.items, { itemId: '', locationId: prev.locationId || '', quantity: 1, notes: '' }],
    }));
  };

  const removeItemRow = (index: number) => {
    setCreateFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItemRow = (index: number, field: string, value: any) => {
    setCreateFormData((prev) => {
      const updated = [...prev.items];
      if (field === 'itemId') {
        const selectedItm = itemsList.find((it) => it.id === value);
        let bestLocId = '';
        if (selectedItm && selectedItm.stockBalances && selectedItm.stockBalances.length > 0) {
          const kitLocBal = selectedItm.stockBalances.find((b) => b.locationId === prev.locationId && (b.available || 0) > 0);
          if (kitLocBal) {
            bestLocId = prev.locationId;
          } else {
            const firstStocked = selectedItm.stockBalances.find((b) => (b.available || 0) > 0);
            if (firstStocked) bestLocId = firstStocked.locationId;
          }
        }
        updated[index] = {
          ...updated[index],
          itemId: value,
          locationId: bestLocId || prev.locationId || '',
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return { ...prev, items: updated };
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedKitId(expandedKitId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60">
              <Boxes className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Hộp Kit thực hành (Practice Kits)
            </h1>
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200/60">
              {kits.length} bộ kit
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Quản lý vòng đời hộp kit, linh kiện thành phần và phân bổ tồn kho (KitAllocated)
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => fetchKits()}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-soft hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
            <span>Làm mới</span>
          </button>

          {isOperator && (
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-soft hover:bg-brand-700 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo hộp kit mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-xs shadow-xs ${
            statusMessage.type === 'success'
              ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200/80 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2.5 font-medium">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs & Search Filter */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-card flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'AVAILABLE', label: 'Sẵn sàng' },
            { id: 'ALLOCATED', label: 'Đang phân bổ' },
            { id: 'MAINTENANCE', label: 'Bảo trì' },
            { id: 'RETIRED', label: 'Thanh lý' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-brand-700 shadow-soft'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên kit..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchKits()}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-3.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>
      </div>

      {/* Main Kits Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Mã hộp Kit</th>
                <th className="px-4 py-3.5">Tên hộp Kit</th>
                <th className="px-4 py-3.5">Vị trí lưu kho</th>
                <th className="px-4 py-3.5">Số loại linh kiện</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2.5">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                      <span className="text-xs text-slate-500">Đang nạp danh sách hộp kit...</span>
                    </div>
                  </td>
                </tr>
              ) : kits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2.5">
                      <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400">
                        <Package className="h-6 w-6" />
                      </div>
                      <span className="font-semibold text-slate-700 text-sm">Không tìm thấy hộp kit thực hành nào</span>
                      <span className="text-slate-400 text-xs">Thử đổi trạng thái lọc hoặc tạo hộp kit mới.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                kits.map((k) => {
                  const isExpanded = expandedKitId === k.id;
                  return (
                    <React.Fragment key={k.id}>
                      <tr className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <button
                            onClick={() => toggleExpand(k.id)}
                            className="inline-flex items-center space-x-1.5 font-mono text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200/60 hover:bg-brand-100 transition-colors cursor-pointer"
                          >
                            <span>{k.code}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-brand-500" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-brand-500" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{k.name}</div>
                          {k.description && <div className="text-[11px] text-slate-400 truncate max-w-sm mt-0.5">{k.description}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {k.location ? `${k.location.name} (${k.location.code})` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="font-semibold text-slate-800">{k.items?.length || 0}</span> loại ({k.totalItems || 0} món)
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={k.status} variant="kitStatus" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Operator Status Transition Controls */}
                            {isOperator && (
                              <>
                                {k.status === 'AVAILABLE' && (
                                  <>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.ALLOCATED)}
                                      className="rounded-lg bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                                      title="Bàn giao sử dụng"
                                    >
                                      Bàn giao
                                    </button>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.MAINTENANCE)}
                                      className="rounded-lg bg-amber-50 border border-amber-200/60 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                                      title="Đưa vào bảo trì"
                                    >
                                      Bảo trì
                                    </button>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.RETIRED)}
                                      className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                                      title="Thanh lý / rã kit trả linh kiện"
                                    >
                                      Rã kit
                                    </button>
                                  </>
                                )}

                                {k.status === 'ALLOCATED' && (
                                  <>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.AVAILABLE)}
                                      className="rounded-lg bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                                      title="Thu hồi về sẵn sàng"
                                    >
                                      Thu hồi
                                    </button>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.MAINTENANCE)}
                                      className="rounded-lg bg-amber-50 border border-amber-200/60 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                                      title="Chuyển sang kiểm tra sửa chữa"
                                    >
                                      Bảo trì
                                    </button>
                                  </>
                                )}

                                {k.status === 'MAINTENANCE' && (
                                  <>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.AVAILABLE)}
                                      className="rounded-lg bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                                      title="Hoàn tất bảo trì, đưa lại sẵn sàng"
                                    >
                                      Sẵn sàng
                                    </button>
                                    <button
                                      disabled={actionLoading === k.id}
                                      onClick={() => handleStatusChange(k.id, KitStatus.RETIRED)}
                                      className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                                      title="Thanh lý do hỏng hóc"
                                    >
                                      Thanh lý
                                    </button>
                                  </>
                                )}

                                {k.status === 'RETIRED' && (
                                  <button
                                    disabled={actionLoading === k.id}
                                    onClick={() => handleStatusChange(k.id, KitStatus.AVAILABLE)}
                                    className="rounded-lg bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                                    title="Tái kích hoạt hộp kit và cấp phát lại linh kiện"
                                  >
                                    Tái cấp phát
                                  </button>
                                )}
                              </>
                            )}

                            {/* Safe Delete button */}
                            {canDelete && k.status !== 'ALLOCATED' && (
                              <button
                                disabled={actionLoading === k.id}
                                onClick={() => handleDeleteKit(k.id, k.code)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Xóa hộp kit"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Component Items Detail */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200/60">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                                <Package className="h-3.5 w-3.5 text-brand-600" />
                                <span>Linh kiện thành phần trong hộp kit:</span>
                              </h4>
                              {k.items && k.items.length > 0 ? (
                                <table className="mt-2.5 w-full text-left text-[11px]">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                                      <th className="py-1.5">Mã linh kiện</th>
                                      <th className="py-1.5">Tên linh kiện</th>
                                      <th className="py-1.5 text-center">Số lượng</th>
                                      <th className="py-1.5 text-center">Đơn vị</th>
                                      <th className="py-1.5">Ghi chú</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {k.items.map((item) => (
                                      <tr key={item.id} className="text-slate-700">
                                        <td className="py-1.5 font-mono font-medium text-brand-700">{item.item?.code || item.itemId}</td>
                                        <td className="py-1.5 font-medium text-slate-800">{item.item?.name || '—'}</td>
                                        <td className="py-1.5 text-center font-semibold text-slate-900">{item.quantity}</td>
                                        <td className="py-1.5 text-center text-slate-500">{item.item?.unit || 'cái'}</td>
                                        <td className="py-1.5 text-slate-400">{item.notes || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="mt-1 text-xs text-slate-400">Hộp kit chưa có linh kiện nào.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Kit Modal */}
      {isCreateModalOpen && (
        <div
          {...createBackdropDismiss}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-6 py-4">
              <div className="flex items-center space-x-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
                  <Boxes className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Tạo hộp kit thực hành mới</h3>
                  <p className="text-[11px] text-slate-500">
                    Đóng gói bộ linh kiện thực hành cho phòng Lab Robotics & AI
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseCreateModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Basic Info Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  1. Thông tin chung & Vị trí kho
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-semibold text-slate-700">Mã hộp Kit *</label>
                      {createFormData.name && (
                        <button
                          type="button"
                          onClick={() => {
                            const autoCode = generateKitCode(createFormData.name, existingCodes);
                            setCreateFormData((prev) => ({ ...prev, code: autoCode }));
                            setIsCodeManuallyEdited(false);
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-800 underline cursor-pointer"
                          title="Tạo lại mã tự động theo tên hộp kit"
                        >
                          Tạo lại theo tên
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="VD: KIT-AFZ-01"
                      value={createFormData.code}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        if (val.trim() === '') {
                          setIsCodeManuallyEdited(false);
                        } else {
                          setIsCodeManuallyEdited(true);
                        }
                        setCreateFormData({ ...createFormData, code: val });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-medium focus:border-blue-500 focus:outline-none"
                      data-testid="kit-code-input"
                    />
                    <p className="mt-0.5 text-[10px] text-slate-400">Tự động sinh từ tên hộp kit</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Tên hộp Kit *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: AI FANTASY ZOO - Chủ đề 1"
                      value={createFormData.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        if (!isCodeManuallyEdited || !createFormData.code) {
                          const autoCode = generateKitCode(newName, existingCodes);
                          setCreateFormData((prev) => ({
                            ...prev,
                            name: newName,
                            code: autoCode,
                          }));
                        } else {
                          setCreateFormData((prev) => ({
                            ...prev,
                            name: newName,
                          }));
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                      data-testid="kit-name-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Vị trí lưu kho *
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Nơi xuất tồn linh kiện
                      </span>
                    </div>
                    <select
                      required
                      value={createFormData.locationId}
                      onChange={(e) => setCreateFormData({ ...createFormData, locationId: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">
                        {locationsList.length === 0
                          ? '-- Đang tải vị trí kho hoặc chưa có kho --'
                          : '-- Chọn vị trí kho lưu trữ (Bắt buộc) --'}
                      </option>
                      {locationsList.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Mô tả bài thực hành</label>
                    <input
                      type="text"
                      placeholder="Mô tả mục đích sử dụng, chủ đề bài học..."
                      value={createFormData.description}
                      onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Component Items Section */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                      <Package className="h-4 w-4 text-blue-600" />
                      <span>2. Danh sách linh kiện trong kit *</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Tự động kết nối với Khay/Thùng chứa linh kiện tương ứng (hoặc chọn nguồn xuất tùy ý).
                    </p>
                  </div>

                  {/* Clean Action Toolbar */}
                  <div className="flex items-center space-x-2">
                    {/* Batch Add by Category */}
                    {availableCategories.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddCategoryItems(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="rounded-lg border border-dashed border-amber-300 bg-amber-50/80 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition cursor-pointer"
                        title="Thêm toàn bộ linh kiện của một danh mục vào kit"
                      >
                        <option value="" disabled>📁 + Thêm theo danh mục...</option>
                        {availableCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name} ({cat.count} món)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 min-h-[300px]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5">Linh kiện</th>
                        <th className="px-3 py-2.5">Khay/Thùng nguồn</th>
                        <th className="px-3 py-2.5 text-center">Tồn khả dụng</th>
                        <th className="px-3 py-2.5 text-center">Số lượng</th>
                        <th className="px-3 py-2.5">Ghi chú</th>
                        <th className="px-2 py-2.5 text-center w-10">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {createFormData.items.map((row, idx) => {
                        const selectedItem = itemsList.find((it) => it.id === row.itemId);
                        const effectiveLocId = row.locationId || createFormData.locationId;
                        const availStock =
                          selectedItem && effectiveLocId
                            ? getItemStockAtLocation(selectedItem, effectiveLocId)
                            : 0;
                        const otherStockInfo =
                          selectedItem && effectiveLocId
                            ? getOtherLocationsStockInfo(selectedItem, effectiveLocId)
                            : { totalOther: 0, details: [] };

                        return (
                          <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                            {/* Component Selector with Categories */}
                            <td className="px-3 py-2 min-w-[240px]">
                              {/* Modern Interactive Combobox */}
                              <KitItemCombobox
                                value={row.itemId}
                                onChange={(newId) => updateItemRow(idx, 'itemId', newId)}
                                itemsList={itemsList}
                                groupedItems={groupedItemsByCategory}
                              />

                              {/* Native select hidden for full DOM test compatibility and form validation */}
                              <select
                                required
                                value={row.itemId}
                                onChange={(e) => updateItemRow(idx, 'itemId', e.target.value)}
                                data-testid="item-row-select"
                                className="sr-only"
                                tabIndex={-1}
                                aria-hidden="true"
                              >
                                <option value="">-- Chọn linh kiện --</option>
                                {groupedItemsByCategory.map((grp) => (
                                  <optgroup key={grp.categoryName} label={`📁 ${grp.categoryName}`}>
                                    {grp.items.map((itm) => {
                                      const stockAtLoc = getItemStockAtLocation(itm, createFormData.locationId);
                                      const totalStock =
                                        itm.totalOnHand ??
                                        itm.available ??
                                        itm.stockBalances?.reduce((sum, b) => sum + (b.available || 0), 0) ??
                                        0;
                                      let statusTag = '';
                                      if (totalStock > 0) {
                                        if (stockAtLoc > 0 && stockAtLoc < totalStock) {
                                          statusTag = ` (Sẵn có: ${totalStock} ${itm.unit || 'cái'} • Tại kho kit: ${stockAtLoc})`;
                                        } else {
                                          statusTag = ` (Sẵn có: ${totalStock} ${itm.unit || 'cái'})`;
                                        }
                                      } else {
                                        statusTag = ` — [HẾT HÀNG]`;
                                      }

                                      return (
                                        <option key={itm.id} value={itm.id}>
                                          [{itm.code}] {itm.name}{statusTag}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                ))}
                              </select>
                            </td>

                            {/* Source Bin / Location Selector */}
                            <td className="px-3 py-2 min-w-[170px]">
                              {selectedItem ? (
                                selectedItem.stockBalances && selectedItem.stockBalances.length > 0 ? (
                                  <select
                                    value={row.locationId || ''}
                                    onChange={(e) => updateItemRow(idx, 'locationId', e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                                    title="Chọn khay/thùng nguồn chứa linh kiện này"
                                  >
                                    {selectedItem.stockBalances.map((b) => {
                                      const locObj = locationsList.find((l) => l.id === b.locationId) || b.location;
                                      const locName = locObj?.name || b.locationId;
                                      const isKitLoc = b.locationId === createFormData.locationId;
                                      return (
                                        <option key={b.locationId} value={b.locationId}>
                                          {b.available > 0 ? '📥 ' : '⚠️ '}
                                          {locName} {isKitLoc ? '(Kho kit)' : ''} ({b.available} {selectedItem.unit || 'cái'})
                                        </option>
                                      );
                                    })}
                                  </select>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Mặc định kho kit</span>
                                )
                              ) : (
                                <span className="text-slate-300 text-[11px]">—</span>
                              )}
                            </td>

                            {/* Stock Availability Badge */}
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              {selectedItem ? (
                                availStock >= row.quantity ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                    Còn {availStock} {selectedItem.unit || 'cái'} ✓
                                  </span>
                                ) : availStock > 0 ? (
                                  <span
                                    className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200"
                                    title={`Nguồn này chỉ còn ${availStock}, thiếu ${row.quantity - availStock}`}
                                  >
                                    Chỉ còn {availStock} (Thiếu {row.quantity - availStock}) ⚠️
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                                      Hết hàng tại nguồn (0) ✕
                                    </span>
                                    {otherStockInfo.totalOther > 0 && (
                                      <span
                                        className="mt-1 text-[10px] text-blue-600 font-medium cursor-help"
                                        title={`Các khay/thùng khác đang có:\n${otherStockInfo.details.join('\n')}`}
                                      >
                                        💡 Còn {otherStockInfo.totalOther} {selectedItem.unit || 'cái'} ở nguồn khác
                                      </span>
                                    )}
                                  </div>
                                )
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>

                            {/* Quantity Stepper */}
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <div className="inline-flex items-center space-x-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateItemRow(
                                      idx,
                                      'quantity',
                                      Math.max(1, (Number(row.quantity) || 1) - 1)
                                    )
                                  }
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  required
                                  value={row.quantity}
                                  onChange={(e) =>
                                    updateItemRow(
                                      idx,
                                      'quantity',
                                      parseInt(e.target.value, 10) || 1
                                    )
                                  }
                                  className="w-12 text-center text-xs font-bold text-slate-800 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateItemRow(
                                      idx,
                                      'quantity',
                                      (Number(row.quantity) || 1) + 1
                                    )
                                  }
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>

                            {/* Notes */}
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.notes || ''}
                                onChange={(e) => updateItemRow(idx, 'notes', e.target.value)}
                                placeholder="Ghi chú (tùy chọn)..."
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                              />
                            </td>

                            {/* Remove Line */}
                            <td className="px-2 py-2 text-center">
                              {createFormData.items.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeItemRow(idx)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Xóa linh kiện này"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Add Line Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50/50 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                    data-testid="btn-add-item-row"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Thêm dòng linh kiện mới</span>
                  </button>
                </div>

                {/* Table Summary & Warning */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2 pt-1">
                  <div className="flex items-center space-x-3">
                    <span>
                      Số loại:{' '}
                      <strong className="text-slate-900">
                        {createFormData.items.filter((i) => i.itemId).length}
                      </strong>{' '}
                      loại
                    </span>
                    <span>•</span>
                    <span>
                      Tổng số lượng:{' '}
                      <strong className="text-blue-600">
                        {createFormData.items.reduce(
                          (s, i) => s + (Number(i.quantity) || 0),
                          0
                        )}
                      </strong>{' '}
                      món
                    </span>
                  </div>

                  {createFormData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearItems}
                      className="text-xs text-slate-400 hover:text-rose-600 self-start sm:self-auto cursor-pointer"
                    >
                      Xóa tất cả ({createFormData.items.length} dòng)
                    </button>
                  )}
                </div>

                {/* Insufficient Stock Warning */}
                {insufficientStockItemsCount > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5 shadow-2xs">
                    <div className="flex items-center space-x-1.5 font-semibold text-amber-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>
                        Có {insufficientStockItemsCount} linh kiện chưa đủ tồn kho tại khay/thùng nguồn đã chọn.
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed pl-5.5">
                      Vui lòng giảm số lượng hoặc chọn khay/thùng nguồn khác còn hàng ở cột &quot;Khay/Thùng nguồn&quot;.
                    </p>
                  </div>
                ) : (
                  createFormData.items.some((i) => Boolean(i.itemId)) && (
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-2.5 text-xs text-emerald-800 flex items-center space-x-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        Tất cả linh kiện đã được tự động kết nối với khay/thùng nguồn có sẵn hàng và sẵn sàng tạo hộp kit.
                      </span>
                    </div>
                  )
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/75 -mx-6 -mb-6 px-6 py-3.5 mt-6">
                <span className="text-xs text-slate-500">
                  {createFormData.locationId ? (
                    <span>
                      Kho:{' '}
                      <strong>
                        {locationsList.find((l) => l.id === createFormData.locationId)?.name ||
                          'Đã chọn'}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-amber-600">⚠️ Vui lòng chọn vị trí kho lưu trữ</span>
                  )}
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCloseCreateModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center space-x-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-soft hover:bg-blue-700 active:scale-[0.99] cursor-pointer transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Tạo hộp kit</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
