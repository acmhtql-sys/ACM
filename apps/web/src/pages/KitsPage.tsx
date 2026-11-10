import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
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

interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface LocationOption {
  id: string;
  code: string;
  name: string;
}

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

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createFormData, setCreateFormData] = useState<{
    code: string;
    name: string;
    description: string;
    locationId: string;
    items: { itemId: string; quantity: number; notes: string }[];
  }>({
    code: '',
    name: '',
    description: '',
    locationId: '',
    items: [{ itemId: '', quantity: 1, notes: '' }],
  });

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
      const [itemsRes, locsRes] = await Promise.all([
        apiClient.get('/items', { params: { limit: 100 } }),
        apiClient.get('/locations', { params: { limit: 100 } }),
      ]);
      if (itemsRes.data?.success) {
        const items = Array.isArray(itemsRes.data.data)
          ? itemsRes.data.data
          : itemsRes.data.data?.items || [];
        setItemsList(items);
      }
      if (locsRes.data?.success) {
        const locs = Array.isArray(locsRes.data.data)
          ? locsRes.data.data
          : locsRes.data.data?.items || [];
        setLocationsList(locs);
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
          quantity: Number(i.quantity),
          notes: i.notes.trim() || undefined,
        })),
      };

      const res = await apiClient.post('/kits', payload);
      if (res.data?.success) {
        setStatusMessage({ type: 'success', text: 'Tạo hộp kit thực hành thành công' });
        setIsCreateModalOpen(false);
        setCreateFormData({
          code: '',
          name: '',
          description: '',
          locationId: '',
          items: [{ itemId: '', quantity: 1, notes: '' }],
        });
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
      items: [...prev.items, { itemId: '', quantity: 1, notes: '' }],
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
      updated[index] = { ...updated[index], [field]: value };
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
              onClick={() => setIsCreateModalOpen(true)}
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
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên kit..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchKits()}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9.5 pr-3.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Tạo hộp kit thực hành mới</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Mã hộp Kit *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: KIT-IOT-001"
                    value={createFormData.code}
                    onChange={(e) => setCreateFormData({ ...createFormData, code: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Tên hộp Kit *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Kit vi điều khiển IoT"
                    value={createFormData.name}
                    onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Vị trí lưu kho</label>
                <select
                  value={createFormData.locationId}
                  onChange={(e) => setCreateFormData({ ...createFormData, locationId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chọn vị trí kho lưu trữ (Bắt buộc) --</option>
                  {locationsList.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Mô tả bài thực hành</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả mục đích sử dụng hộp kit..."
                  value={createFormData.description}
                  onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Component Items List */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between pb-2">
                  <label className="text-[11px] font-bold text-slate-700">Danh sách linh kiện trong kit *</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    + Thêm linh kiện
                  </button>
                </div>

                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {createFormData.items.map((row, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <select
                        required
                        value={row.itemId}
                        onChange={(e) => updateItemRow(idx, 'itemId', e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">-- Chọn linh kiện --</option>
                        {itemsList.map((itm) => (
                          <option key={itm.id} value={itm.id}>
                            {itm.code} - {itm.name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        required
                        value={row.quantity}
                        onChange={(e) => updateItemRow(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs text-center focus:border-blue-500 focus:outline-none"
                        placeholder="SL"
                      />

                      {createFormData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Tạo hộp kit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
