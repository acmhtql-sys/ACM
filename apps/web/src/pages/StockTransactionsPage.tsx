import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Search,
  ArrowLeftRight,
  Sliders,
  AlertTriangle,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ShieldAlert,
  Layers,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { inventoryService } from '../services/inventory.service';
import { stockTransactionsService } from '../services/stock-transactions.service';
import { stockMovementsService } from '../services/stock-movements.service';
import { isStockTransactionWriteEnabled, isStockAdjustmentEnabled } from '../config/features';
import {
  canPerformStockMutation,
  canReadStockTransactions,
  canReadStockMovements,
  isStockForbiddenRole,
} from '../services/stock-rbac';
import {
  StockTransactionType,
  TransactionStatus,
  StockTransactionSortField,
  StockMovementSortField,
  SortOrder,
  ItemResponse,
  LocationResponse,
  StockBalanceResponse,
} from '@acm/shared';
import {
  StockTransactionSummary,
  StockMovementItem,
} from '../types/stock-transactions';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorAlert } from '../components/common/ErrorAlert';
import { EmptyState } from '../components/common/EmptyState';
import { ToastContainer, ToastMessage } from '../components/Toast';

// Modals
import { StockTransactionDetailModal } from '../components/stock-transactions/StockTransactionDetailModal';
import { StockImportModal } from '../components/stock-transactions/StockImportModal';
import { StockExportModal } from '../components/stock-transactions/StockExportModal';
import { StockTransferModal } from '../components/stock-transactions/StockTransferModal';
import { StockAdjustmentModal } from '../components/stock-transactions/StockAdjustmentModal';

export const StockTransactionsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // RBAC Permission checks aligned with Backend Express middleware
  const isAuthorized = canReadStockTransactions(user?.role);
  const canWrite = canPerformStockMutation(user?.role);
  const isForbidden = isStockForbiddenRole(user?.role);
  const writeEnabled = isStockTransactionWriteEnabled();
  const isAdjustmentEnabled = isStockAdjustmentEnabled();

  // Active Tab state: 'transactions' | 'movements'
  const activeTab = (searchParams.get('tab') as 'transactions' | 'movements') || 'transactions';

  // Filters State derived from URL
  const [searchInput, setSearchInput] = useState<string>(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchParams.get('search') || '');
  const selectedType = (searchParams.get('type') as StockTransactionType) || undefined;
  const selectedStatus = (searchParams.get('status') as TransactionStatus) || undefined;
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const sortBy = (searchParams.get('sortBy') as StockTransactionSortField) || StockTransactionSortField.CREATED_AT;
  const sortOrder = (searchParams.get('sortOrder') as SortOrder) || SortOrder.DESC;
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = 20;

  // Modal States
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<StockTransactionSummary | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);

  // Toast State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = (type: 'success' | 'error' | 'warning', message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, title: message }]);
  };

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Synchronize search params to URL
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      newParams.set('search', debouncedSearch);
    } else {
      newParams.delete('search');
    }
    if ((searchParams.get('search') || '') !== debouncedSearch) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams, { replace: true });
  }, [debouncedSearch]);

  const updateParam = (key: string, val: string | undefined) => {
    const newParams = new URLSearchParams(searchParams);
    if (val) {
      newParams.set(key, val);
    } else {
      newParams.delete(key);
    }

    if (key === 'page') {
      const pageNum = parseInt(val || '1', 10);
      newParams.set('page', isNaN(pageNum) || pageNum < 1 ? '1' : pageNum.toString());
    } else {
      // Any filter or search parameter change resets page to 1
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  };

  const handleOpenModal = (modalSetter: (open: boolean) => void) => {
    if (!writeEnabled || !canWrite) {
      showToast('warning', 'Chế độ an toàn S2C-3A: Thao tác ghi kho đang tạm khóa để bảo vệ toàn vẹn dữ liệu.');
      return;
    }
    modalSetter(true);
  };

  const handleTabChange = (tab: 'transactions' | 'movements') => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  // 1. Query: Stock Transactions List (GET only)
  const transactionsQuery = useQuery({
    queryKey: [
      'stock-transactions',
      'list',
      {
        search: debouncedSearch,
        type: selectedType,
        status: selectedStatus,
        startDate,
        endDate,
        sortBy,
        sortOrder,
        page,
        limit,
      },
    ],
    queryFn: () =>
      stockTransactionsService.listTransactions({
        search: debouncedSearch || undefined,
        type: selectedType,
        status: selectedStatus,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sortBy,
        sortOrder,
        page,
        limit,
      }),
    enabled: isAuthorized && activeTab === 'transactions',
    staleTime: 15000,
  });

  // 2. Query: Stock Movements Ledger (GET only)
  const movementsQuery = useQuery({
    queryKey: [
      'stock-movements',
      'list',
      {
        search: debouncedSearch,
        type: selectedType,
        startDate,
        endDate,
        page,
        limit,
      },
    ],
    queryFn: () =>
      stockMovementsService.listMovements({
        search: debouncedSearch || undefined,
        type: selectedType,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      }),
    enabled: isAuthorized && activeTab === 'movements',
    staleTime: 15000,
  });

  // Active Items & Locations & Balances for modal dropdowns
  const itemsQuery = useQuery<ItemResponse[]>({
    queryKey: ['items', 'active-list'],
    queryFn: async () => {
      const res = await apiClient.get('/items', { params: { limit: 100, status: 'active' } });
      return res.data?.data || [];
    },
    enabled: isAuthorized,
    staleTime: 60000,
  });

  const locationsQuery = useQuery<LocationResponse[]>({
    queryKey: ['locations', 'list'],
    queryFn: () => inventoryService.getLocations(100),
    enabled: isAuthorized,
    staleTime: 60000,
  });

  const balancesQuery = useQuery<StockBalanceResponse[]>({
    queryKey: ['inventory', 'balances', 'all'],
    queryFn: async () => {
      const res = await inventoryService.getBalances({ limit: 100 });
      return res.balances || [];
    },
    enabled: isAuthorized,
    staleTime: 30000,
  });

  const handleMutationSuccess = (actionName: string, result: any) => {
    queryClient.invalidateQueries({ queryKey: ['stock-transactions', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'balances'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['locations', 'tree'] });
    queryClient.invalidateQueries({ queryKey: ['locations', 'list'] });

    showToast('success', `${actionName} thành công: ${result?.transactionNumber || 'Giao dịch đã ghi sổ'}`);
  };

  // RBAC 403 Forbidden Screen for STUDENT / Unauthorized
  if (isForbidden || !isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4" data-testid="rbac-forbidden-screen">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">403 - Quyền Truy Cập Bị Từ Chối</h2>
        <p className="mt-2 text-sm text-slate-500 text-center max-w-md">
          Chức năng Quản lý Giao dịch Kho chỉ dành riêng cho Quản lý phòng thí nghiệm, Quản trị viên và Kỹ thuật viên.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition"
        >
          Quay lại Trang Chủ
        </button>
      </div>
    );
  }

  const transactions = transactionsQuery.data?.transactions || [];
  const txMeta = transactionsQuery.data?.meta;

  const movements = movementsQuery.data?.movements || [];
  const movMeta = movementsQuery.data?.meta;

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'IMPORT':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'EXPORT':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'TRANSFER':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'ADJUSTMENT':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6" data-testid="stock-transactions-page">
      <ToastContainer toasts={toasts} onDismiss={(id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Top Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl flex items-center space-x-2">
            <FileText className="h-6 w-6 text-blue-600" />
            <span>Giao dịch Kho (Stock Transactions)</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Lịch sử và nhật ký biến động kho đối với các phiếu nhập, xuất, chuyển kho và kiểm kê
          </p>
        </div>

        {/* Action Buttons Toolbar with UI Safety & Read-Only indicator */}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2" data-testid="write-actions-toolbar">
            {!writeEnabled && (
              <div
                className="inline-flex items-center space-x-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800"
                data-testid="read-only-safety-badge"
                title="Chế độ giám sát Read-Only S2C-2: Thao tác ghi bị khóa để bảo đảm toàn vẹn dữ liệu"
              >
                <Lock className="h-3.5 w-3.5 text-amber-600" />
                <span>Chế độ Giám sát Read-Only (S2C-2)</span>
              </div>
            )}
            <button
              onClick={() => handleOpenModal(setIsImportOpen)}
              disabled={!writeEnabled}
              className={`inline-flex items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                writeEnabled
                  ? 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title={writeEnabled ? 'Nhập kho' : 'Thao tác ghi kho đang tạm khóa (Chế độ Read-Only S2C-2)'}
              data-testid="btn-open-import"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nhập kho</span>
            </button>
            <button
              onClick={() => handleOpenModal(setIsExportOpen)}
              disabled={!writeEnabled}
              className={`inline-flex items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                writeEnabled
                  ? 'bg-amber-600 text-white shadow-amber-500/20 hover:bg-amber-700 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title={writeEnabled ? 'Xuất kho' : 'Thao tác ghi kho đang tạm khóa (Chế độ Read-Only S2C-2)'}
              data-testid="btn-open-export"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Xuất kho</span>
            </button>
            <button
              onClick={() => handleOpenModal(setIsTransferOpen)}
              disabled={!writeEnabled}
              className={`inline-flex items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                writeEnabled
                  ? 'bg-purple-600 text-white shadow-purple-500/20 hover:bg-purple-700 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title={writeEnabled ? 'Điều chuyển' : 'Thao tác ghi kho đang tạm khóa (Chế độ Read-Only S2C-2)'}
              data-testid="btn-open-transfer"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>Điều chuyển</span>
            </button>
            <button
              onClick={() => handleOpenModal(setIsAdjustmentOpen)}
              disabled={!writeEnabled || !isAdjustmentEnabled}
              className={`inline-flex items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                writeEnabled && isAdjustmentEnabled
                  ? 'bg-yellow-600 text-white shadow-yellow-500/20 hover:bg-yellow-700 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title={
                !isAdjustmentEnabled
                  ? 'Nghiệp vụ Điều chỉnh kho (ADJUSTMENT) đang bị khóa độc lập (chưa phê duyệt riêng)'
                  : writeEnabled
                  ? 'Kiểm kê'
                  : 'Thao tác ghi kho đang tạm khóa (Chế độ Read-Only S2C-2)'
              }
              data-testid="btn-open-adjustment"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Kiểm kê</span>
            </button>
          </div>
        )}
      </div>

      {/* Two-Tab Navigation */}
      <div className="flex border-b border-slate-200 text-xs font-medium" data-testid="stock-view-tabs">
        <button
          onClick={() => handleTabChange('transactions')}
          className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-semibold transition ${
            activeTab === 'transactions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
          data-testid="tab-transactions"
        >
          <FileText className="h-4 w-4" />
          <span>Lịch sử Chứng từ (Transactions)</span>
          {txMeta && txMeta.totalItems > 0 && (
            <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              {txMeta.totalItems}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('movements')}
          className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-semibold transition ${
            activeTab === 'movements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
          data-testid="tab-movements"
        >
          <Layers className="h-4 w-4" />
          <span>Sổ Nhật ký Biến động kho (Movement Ledger)</span>
          {movMeta && movMeta.totalItems > 0 && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {movMeta.totalItems}
            </span>
          )}
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${activeTab === 'transactions' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={activeTab === 'transactions' ? 'Tìm mã phiếu, ghi chú...' : 'Tìm lý do, mã tham chiếu...'}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              data-testid="search-tx-input"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={selectedType || ''}
              onChange={(e) => updateParam('type', e.target.value || undefined)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              data-testid="filter-type-select"
            >
              <option value="">-- Tất cả loại phiếu --</option>
              <option value="IMPORT">Nhập kho (IMPORT)</option>
              <option value="EXPORT">Xuất kho (EXPORT)</option>
              <option value="TRANSFER">Điều chuyển (TRANSFER)</option>
              <option value="ADJUSTMENT">Kiểm kê (ADJUSTMENT)</option>
            </select>
          </div>

          {/* Status Filter (Only for Transactions) */}
          {activeTab === 'transactions' && (
            <div>
              <select
                value={selectedStatus || ''}
                onChange={(e) => updateParam('status', e.target.value || undefined)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                data-testid="filter-status-select"
              >
                <option value="">-- Tất cả trạng thái --</option>
                <option value="COMPLETED">COMPLETED (Hoàn tất)</option>
                <option value="CANCELLED">CANCELLED (Hủy bỏ)</option>
              </select>
            </div>
          )}

          {/* Date Range: Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => updateParam('startDate', e.target.value || undefined)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              data-testid="filter-start-date"
            />
          </div>

          {/* Date Range: End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => updateParam('endDate', e.target.value || undefined)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              data-testid="filter-end-date"
            />
          </div>
        </div>
      </div>

      {/* Main Table Content: TAB 1 (Transactions) */}
      {activeTab === 'transactions' && (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          {transactionsQuery.isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} />
            </div>
          ) : transactionsQuery.isError ? (
            <div className="p-6">
              <ErrorAlert
                title="Không thể nạp danh sách giao dịch kho"
                message={(transactionsQuery.error as any)?.message || 'Vui lòng kiểm tra lại kết nối API.'}
                onRetry={() => transactionsQuery.refetch()}
              />
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12">
              <EmptyState
                title="Không có giao dịch kho nào"
                description="Chưa có phiếu nhập, xuất hoặc điều chuyển nào phù hợp với bộ lọc tìm kiếm."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="stock-transactions-table">
                <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Mã chứng từ</th>
                    <th className="py-3 px-4">Loại giao dịch</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-4">Người lập</th>
                    <th className="py-3 px-4 text-center">Số dòng</th>
                    <th className="py-3 px-4 text-right">Tổng số lượng</th>
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4">Ghi chú</th>
                    <th className="py-3 px-4 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {transactions.map((tx) => {
                    const itemCount = typeof tx.itemCount === 'number' ? tx.itemCount : (tx.details?.length ?? 0);
                    const totalQty = typeof tx.totalQuantity === 'number' ? tx.totalQuantity : (tx.details?.reduce((s, d) => s + d.quantity, 0) ?? 0);

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-slate-50/50 transition cursor-pointer"
                        onClick={() => {
                          setSelectedTx(tx);
                          setSelectedTxId(tx.id);
                          setIsDetailOpen(true);
                        }}
                        data-testid={`tx-row-${tx.id}`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                          {tx.transactionNumber}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 font-semibold text-[11px] border ${getTypeBadgeColor(
                              tx.type
                            )}`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {tx.creatorName || tx.createdBy?.fullName || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {itemCount === 0 ? (
                            <span className="text-slate-400" title="Chứng từ lịch sử 0 dòng">
                              0
                            </span>
                          ) : (
                            itemCount
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                          {totalQty}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(tx.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={tx.notes || ''}>
                          {tx.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setSelectedTx(tx);
                              setSelectedTxId(tx.id);
                              setIsDetailOpen(true);
                            }}
                            className="inline-flex items-center space-x-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition"
                            title="Xem chi tiết"
                            data-testid={`btn-view-detail-${tx.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar for Transactions */}
          {txMeta && txMeta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600 bg-slate-50/50">
              <div>
                Hiển thị trang <span className="font-bold">{txMeta.page}</span> /{' '}
                <span className="font-bold">{txMeta.totalPages}</span> (Tổng số {txMeta.totalItems} chứng từ)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={!txMeta.hasPrevPage}
                  onClick={() => updateParam('page', (txMeta.page - 1).toString())}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                  data-testid="btn-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Trước
                </button>
                <button
                  disabled={!txMeta.hasNextPage}
                  onClick={() => updateParam('page', (txMeta.page + 1).toString())}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                  data-testid="btn-next-page"
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Table Content: TAB 2 (Movements Ledger) */}
      {activeTab === 'movements' && (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden" data-testid="stock-movements-section">
          {movementsQuery.isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} />
            </div>
          ) : movementsQuery.isError ? (
            <div className="p-6">
              <ErrorAlert
                title="Không thể nạp nhật ký biến động kho"
                message={(movementsQuery.error as any)?.message || 'Vui lòng kiểm tra lại kết nối API.'}
                onRetry={() => movementsQuery.refetch()}
              />
            </div>
          ) : movements.length === 0 ? (
            <div className="p-12">
              <EmptyState
                title="Không có biến động kho nào"
                description="Chưa có nhật ký biến động tồn kho nào phù hợp với bộ lọc tìm kiếm."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="stock-movements-table">
                <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4">Mã chứng từ tham chiếu</th>
                    <th className="py-3 px-4">Loại biến động</th>
                    <th className="py-3 px-4">Linh kiện / Thiết bị</th>
                    <th className="py-3 px-4">Vị trí lưu trữ</th>
                    <th className="py-3 px-4 text-center">Biến động On-Hand</th>
                    <th className="py-3 px-4 text-center">Tồn trước &rarr; sau</th>
                    <th className="py-3 px-4">Người ghi sổ</th>
                    <th className="py-3 px-4">Lý do</th>
                    <th className="py-3 px-4 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {movements.map((m: StockMovementItem) => {
                    const isPositive = m.quantityDelta > 0;
                    const isNegative = m.quantityDelta < 0;

                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-slate-50/50 transition cursor-pointer"
                        onClick={() => {
                          if (m.referenceId) {
                            setSelectedTx(null);
                            setSelectedTxId(m.referenceId);
                            setIsDetailOpen(true);
                          }
                        }}
                        data-testid={`movement-row-${m.id}`}
                      >
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4">
                          {m.referenceId ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTx(null);
                                setSelectedTxId(m.referenceId!);
                                setIsDetailOpen(true);
                              }}
                              className="font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1"
                              data-testid={`btn-movement-ref-${m.id}`}
                              title="Bấm để mở chi tiết chứng từ liên kết"
                            >
                              <span>{m.referenceType || 'TX'}</span>
                              <span className="text-[10px] text-slate-400">({m.referenceId.slice(0, 8)}...)</span>
                            </button>
                          ) : (
                            <span className="font-mono text-slate-400">{m.referenceType || '-'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 font-semibold text-[11px] border ${getTypeBadgeColor(
                              m.type
                            )}`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-semibold text-slate-900">{m.item?.name || 'N/A'}</div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {m.item?.code} {m.item?.unit ? `(${m.item.unit})` : ''}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <span className="font-semibold text-slate-800">{m.location?.name || 'N/A'}</span>
                            {m.location?.code && (
                              <span className="text-slate-400 font-mono text-[11px] ml-1">
                                [{m.location.code}]
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-mono font-bold text-sm ${
                              isPositive
                                ? 'text-emerald-600'
                                : isNegative
                                ? 'text-rose-600'
                                : 'text-slate-500'
                            }`}
                            data-testid={`delta-${m.id}`}
                          >
                            {isPositive ? `+${m.quantityDelta}` : m.quantityDelta}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-700 whitespace-nowrap">
                          <span>{m.onHandBefore}</span>
                          <ArrowRight className="inline h-3 w-3 text-slate-400 mx-1" />
                          <span className="font-semibold text-slate-900">{m.onHandAfter}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                          {m.creatorName || m.createdBy?.fullName || 'Hệ thống'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={m.reason || ''}>
                          {m.reason || '-'}
                        </td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {m.referenceId ? (
                            <button
                              onClick={() => {
                                setSelectedTx(null);
                                setSelectedTxId(m.referenceId!);
                                setIsDetailOpen(true);
                              }}
                              className="inline-flex items-center space-x-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition"
                              title="Xem chi tiết chứng từ"
                              data-testid={`btn-view-movement-detail-${m.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar for Movements */}
          {movMeta && movMeta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600 bg-slate-50/50" data-testid="movement-pagination">
              <div>
                Hiển thị trang <span className="font-bold">{movMeta.page}</span> /{' '}
                <span className="font-bold">{movMeta.totalPages}</span> (Tổng số {movMeta.totalItems} biến động)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={!movMeta.hasPrevPage}
                  onClick={() => updateParam('page', (movMeta.page - 1).toString())}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                  data-testid="btn-movement-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Trước
                </button>
                <button
                  disabled={!movMeta.hasNextPage}
                  onClick={() => updateParam('page', (movMeta.page + 1).toString())}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                  data-testid="btn-movement-next-page"
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transaction Detail Modal */}
      <StockTransactionDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTx(null);
          setSelectedTxId(null);
        }}
        transaction={selectedTx}
        transactionId={selectedTxId || undefined}
      />

      {/* Import Modal */}
      {writeEnabled && canWrite && (
        <StockImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          items={itemsQuery.data || []}
          locations={locationsQuery.data || []}
          userId={user?.id || 'demo-user'}
          userRole={user?.role}
          onSuccess={(res) => handleMutationSuccess('Nhập kho', res)}
        />
      )}

      {/* Export Modal */}
      {writeEnabled && canWrite && (
        <StockExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          items={itemsQuery.data || []}
          locations={locationsQuery.data || []}
          balances={balancesQuery.data || []}
          userId={user?.id || 'demo-user'}
          userRole={user?.role}
          onSuccess={(res) => handleMutationSuccess('Xuất kho', res)}
        />
      )}

      {/* Transfer Modal */}
      {writeEnabled && canWrite && (
        <StockTransferModal
          isOpen={isTransferOpen}
          onClose={() => setIsTransferOpen(false)}
          items={itemsQuery.data || []}
          locations={locationsQuery.data || []}
          balances={balancesQuery.data || []}
          userId={user?.id || 'demo-user'}
          userRole={user?.role}
          onSuccess={(res) => handleMutationSuccess('Điều chuyển', res)}
        />
      )}

      {/* Adjustment Modal (Kept strictly disabled and unmounted unless write flag and adjustment gate are both active) */}
      {writeEnabled && canWrite && isAdjustmentEnabled && (
        <StockAdjustmentModal
          isOpen={isAdjustmentOpen}
          onClose={() => setIsAdjustmentOpen(false)}
          items={itemsQuery.data || []}
          locations={locationsQuery.data || []}
          balances={balancesQuery.data || []}
          userId={user?.id || 'demo-user'}
          userRole={user?.role}
          onSuccess={(res) => handleMutationSuccess('Kiểm kê', res)}
        />
      )}
    </div>
  );
};
