import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Search,
  RefreshCw,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import {
  InventoryReportItem,
  BorrowReturnReportResponse,
  LowStockAlertItem,
  generateSafeCsv,
} from '@acm/shared';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'inventory' | 'borrowReturn' | 'lowStock'>('inventory');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab 1: Inventory state
  const [inventoryData, setInventoryData] = useState<InventoryReportItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');

  // Tab 2: Borrow-Return state
  const [borrowReport, setBorrowReport] = useState<BorrowReturnReportResponse | null>(null);

  // Tab 3: Low stock alerts state
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertItem[]>([]);

  useEffect(() => {
    if (isAdmin) {
      fetchReportData();
    }
  }, [activeTab, isAdmin]);

  async function fetchReportData() {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'inventory') {
        const res = await apiClient.get('/reports/inventory');
        if (res.data?.success && res.data.data) {
          setInventoryData(res.data.data);
        }
      } else if (activeTab === 'borrowReturn') {
        const res = await apiClient.get('/reports/borrow-return');
        if (res.data?.success && res.data.data) {
          setBorrowReport(res.data.data);
        }
      } else if (activeTab === 'lowStock') {
        const res = await apiClient.get('/reports/low-stock');
        if (res.data?.success && res.data.data) {
          setLowStockAlerts(res.data.data);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể tải dữ liệu báo cáo. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  // Safe browser download helper
  function triggerCsvDownload(filename: string, csvContent: string) {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportInventoryCsv() {
    const headers = [
      'Mã linh kiện',
      'Tên linh kiện',
      'Danh mục',
      'Đơn vị',
      'Loại tài sản',
      'Tồn vật lý (OnHand)',
      'Khả dụng (Available)',
      'Giữ chỗ (Reserved)',
      'Đang mượn (Borrowed)',
      'Gán Kit (KitAllocated)',
      'Cách ly (Quarantined)',
      'Ngưỡng cảnh báo tối thiểu',
      'Trạng thái tồn kho',
    ];
    const rows = filteredInventory.map((item) => [
      item.code,
      item.name,
      item.categoryName,
      item.unit,
      item.type,
      item.onHand,
      item.available,
      item.reserved,
      item.borrowed,
      item.kitAllocated,
      item.quarantined,
      item.minStockAlert,
      item.stockStatus,
    ]);
    const csv = generateSafeCsv(headers, rows);
    triggerCsvDownload(`ACM_Kiem_Ke_Ton_Kho_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function exportOverdueCsv() {
    if (!borrowReport?.overdueList) return;
    const headers = [
      'Mã phiếu mượn',
      'Người mượn',
      'Email',
      'Số điện thoại',
      'Mục đích',
      'Ngày hẹn trả',
      'Số ngày quá hạn',
      'Danh sách linh kiện',
    ];
    const rows = borrowReport.overdueList.map((loan) => [
      loan.requestNumber,
      loan.borrowerName || '—',
      loan.borrowerEmail || '—',
      loan.borrowerPhone || '—',
      loan.purpose || '—',
      new Date(loan.expectedReturnDate).toLocaleDateString('vi-VN'),
      loan.daysOverdue,
      loan.items.map((i) => `${i.code || ''} ${i.name || ''} (Cần trả: ${i.quantity - i.returnedQuantity}/${i.quantity})`).join('; '),
    ]);
    const csv = generateSafeCsv(headers, rows);
    triggerCsvDownload(`ACM_Danh_Sach_Qua_Han_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function exportLowStockCsv() {
    const headers = [
      'Mã linh kiện',
      'Tên linh kiện',
      'Danh mục',
      'Đơn vị',
      'Tồn vật lý (OnHand)',
      'Khả dụng (Available)',
      'Ngưỡng tối thiểu',
      'Tỷ lệ khẩn cấp',
      'Trạng thái',
    ];
    const rows = lowStockAlerts.map((alert) => [
      alert.code,
      alert.name,
      alert.categoryName,
      alert.unit,
      alert.onHand,
      alert.available,
      alert.minStockAlert,
      Math.round(alert.urgencyRatio * 100) + '%',
      alert.stockStatus,
    ]);
    const csv = generateSafeCsv(headers, rows);
    triggerCsvDownload(`ACM_Canh_Bao_Ton_Kho_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const filteredInventory = inventoryData.filter((i) => {
    if (!inventorySearch.trim()) return true;
    const q = inventorySearch.toLowerCase();
    return (
      i.code.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.categoryName.toLowerCase().includes(q)
    );
  });

  // Strict RBAC Gate for Non-Admin Users
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
        <h2 className="mt-3 text-base font-bold text-rose-900">Truy cập bị từ chối (403 Forbidden)</h2>
        <p className="mt-1 text-xs text-rose-700">
          Chỉ Quản trị viên (ADMIN) mới có quyền truy cập Báo cáo & Thống kê theo phân quyền hệ thống.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Báo cáo & Thống kê (Reports & Analytics)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Tổng hợp dữ liệu tồn kho, phân bổ linh kiện và vận hành mượn trả thời gian thực
          </p>
        </div>

        <button
          onClick={() => fetchReportData()}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center space-x-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'inventory'
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Kiểm kê tồn kho</span>
        </button>

        <button
          onClick={() => setActiveTab('borrowReturn')}
          className={`flex items-center space-x-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'borrowReturn'
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Mượn - Trả & Quá hạn</span>
        </button>

        <button
          onClick={() => setActiveTab('lowStock')}
          className={`flex items-center space-x-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'lowStock'
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Cảnh báo tồn tối thiểu</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchReportData()}
            className="font-semibold text-rose-700 underline hover:text-rose-900"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Tab 1: Inventory Valuation Report */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex flex-col justify-between space-y-3 sm:flex-row sm:items-center sm:space-y-0">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã, tên, danh mục..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={exportInventoryCsv}
              disabled={filteredInventory.length === 0}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Xuất CSV Kiểm kê</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Mã linh kiện</th>
                    <th className="px-4 py-3">Tên linh kiện</th>
                    <th className="px-4 py-3">Danh mục</th>
                    <th className="px-4 py-3">Đơn vị</th>
                    <th className="px-4 py-3 text-right">Tồn vật lý</th>
                    <th className="px-4 py-3 text-right text-emerald-600 font-bold">Khả dụng</th>
                    <th className="px-4 py-3 text-right">Giữ chỗ</th>
                    <th className="px-4 py-3 text-right">Đang mượn</th>
                    <th className="px-4 py-3 text-right">Gán Kit</th>
                    <th className="px-4 py-3 text-right">Cách ly</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        <RefreshCw className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                        <span className="mt-2 block">Đang tổng hợp báo cáo kiểm kê...</span>
                      </td>
                    </tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        Không có linh kiện nào khớp với tiêu chí tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{item.code}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-2.5 text-slate-600">{item.categoryName}</td>
                        <td className="px-4 py-2.5 text-slate-500">{item.unit}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{item.onHand}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{item.available}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600">{item.reserved}</td>
                        <td className="px-4 py-2.5 text-right text-indigo-600">{item.borrowed}</td>
                        <td className="px-4 py-2.5 text-right text-teal-600">{item.kitAllocated}</td>
                        <td className="px-4 py-2.5 text-right text-rose-600">{item.quarantined}</td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge status={item.stockStatus} variant="stockStatus" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Borrow-Return Operations & Overdue Loans */}
      {activeTab === 'borrowReturn' && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500">Tổng phiếu</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{borrowReport?.summary.totalRequests ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-blue-600">Đã duyệt</div>
              <div className="mt-1 text-lg font-bold text-blue-700">{borrowReport?.summary.approvedCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-indigo-600">Đang mượn</div>
              <div className="mt-1 text-lg font-bold text-indigo-700">{borrowReport?.summary.handedOverCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-emerald-600">Đã trả đủ</div>
              <div className="mt-1 text-lg font-bold text-emerald-700">{borrowReport?.summary.returnedCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-cyan-600">Trả 1 phần</div>
              <div className="mt-1 text-lg font-bold text-cyan-700">{borrowReport?.summary.partiallyReturnedCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-rose-600">Quá hạn</div>
              <div className="mt-1 text-lg font-bold text-rose-700">{borrowReport?.summary.overdueCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-amber-600">Hỏng / Mất</div>
              <div className="mt-1 text-lg font-bold text-amber-700">{borrowReport?.summary.damagedOrLostCount ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium text-purple-600">Tỷ lệ trả</div>
              <div className="mt-1 text-lg font-bold text-purple-700">{borrowReport?.summary.returnRatePercent ?? 100}%</div>
            </div>
          </div>

          {/* Overdue Loans List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Danh sách phiếu mượn quá hạn ({borrowReport?.overdueList.length ?? 0})
              </h3>
              <button
                onClick={exportOverdueCsv}
                disabled={!borrowReport || borrowReport.overdueList.length === 0}
                className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Xuất CSV Phiếu quá hạn</span>
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Mã phiếu</th>
                      <th className="px-4 py-3">Người mượn</th>
                      <th className="px-4 py-3">Mục đích</th>
                      <th className="px-4 py-3">Hạn trả</th>
                      <th className="px-4 py-3 text-center">Quá hạn</th>
                      <th className="px-4 py-3">Chi tiết linh kiện</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          <RefreshCw className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                          <span className="mt-2 block">Đang nạp dữ liệu mượn trả...</span>
                        </td>
                      </tr>
                    ) : !borrowReport || borrowReport.overdueList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Tuyệt vời! Hiện không có phiếu mượn nào bị quá hạn.
                        </td>
                      </tr>
                    ) : (
                      borrowReport.overdueList.map((loan) => (
                        <tr key={loan.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{loan.requestNumber}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-900">{loan.borrowerName || '—'}</div>
                            <div className="text-[11px] text-slate-400">{loan.borrowerEmail || '—'}</div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{loan.purpose || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {new Date(loan.expectedReturnDate).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex items-center rounded bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                              {loan.daysOverdue} ngày
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {loan.items.map((itm, idx) => (
                              <div key={idx} className="text-[11px]">
                                <span className="font-medium">{itm.name || itm.code}</span>: {itm.returnedQuantity}/{itm.quantity}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Low Stock Alerts */}
      {activeTab === 'lowStock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Danh sách các mặt hàng có tồn kho khả dụng chạm hoặc thấp hơn ngưỡng cảnh báo tối thiểu (minStockAlert).
            </p>
            <button
              onClick={exportLowStockCsv}
              disabled={lowStockAlerts.length === 0}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Xuất CSV Cảnh báo tồn</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Mã linh kiện</th>
                    <th className="px-4 py-3">Tên linh kiện</th>
                    <th className="px-4 py-3">Danh mục</th>
                    <th className="px-4 py-3 text-right">Tồn vật lý</th>
                    <th className="px-4 py-3 text-right text-emerald-600 font-bold">Khả dụng</th>
                    <th className="px-4 py-3 text-right text-amber-600 font-bold">Ngưỡng tối thiểu</th>
                    <th className="px-4 py-3 text-center">Tỷ lệ khẩn cấp</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                        <span className="mt-2 block">Đang kiểm tra ngưỡng tồn kho...</span>
                      </td>
                    </tr>
                  ) : lowStockAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Tuyệt vời! Tất cả các linh kiện đều đang ở trên ngưỡng an toàn.
                      </td>
                    </tr>
                  ) : (
                    lowStockAlerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{alert.code}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{alert.name}</td>
                        <td className="px-4 py-2.5 text-slate-600">{alert.categoryName}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{alert.onHand} {alert.unit}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-rose-600">{alert.available} {alert.unit}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{alert.minStockAlert} {alert.unit}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {Math.round(alert.urgencyRatio * 100)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge status={alert.stockStatus} variant="stockStatus" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
