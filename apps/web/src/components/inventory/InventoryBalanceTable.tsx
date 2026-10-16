import React from 'react';
import {
  Search,
  Filter,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Warehouse,
  Package,
} from 'lucide-react';
import {
  StockBalanceResponse,
  PaginationMeta,
  LocationResponse,
  StockBalanceSortField,
  SortOrder,
} from '@acm/shared';
import { TableSkeleton } from '../common/LoadingSkeleton';
import { ErrorAlert } from '../common/ErrorAlert';
import { EmptyState } from '../common/EmptyState';
import { StatusBadge } from '../StatusBadge';

interface InventoryBalanceTableProps {
  balances: StockBalanceResponse[];
  meta: PaginationMeta;
  locations: LocationResponse[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  // Search & Filter
  searchInput: string;
  onSearchChange: (value: string) => void;
  selectedLocationId: string;
  onLocationChange: (locationId: string) => void;
  isLowStockOnly: boolean;
  onLowStockToggle: (checked: boolean) => void;
  // Sort
  sortBy: StockBalanceSortField;
  sortOrder: SortOrder;
  onSortChange: (field: StockBalanceSortField) => void;
  // Pagination
  page: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export const InventoryBalanceTable: React.FC<InventoryBalanceTableProps> = ({
  balances,
  meta,
  locations,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  searchInput,
  onSearchChange,
  selectedLocationId,
  onLocationChange,
  isLowStockOnly,
  onLowStockToggle,
  sortBy,
  sortOrder,
  onSortChange,
  page,
  onPageChange,
  onRefresh,
}) => {
  const formatNum = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return val.toLocaleString('vi-VN');
  };

  const renderSortIcon = (field: StockBalanceSortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-400" />;
    }
    return sortOrder === SortOrder.ASC ? (
      <ArrowUp className="ml-1 h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-blue-600" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo mã, tên linh kiện hoặc vị trí..."
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Location Filter Dropdown */}
          <div className="flex items-center space-x-2">
            <select
              value={selectedLocationId}
              onChange={(e) => onLocationChange(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Tất cả vị trí kho</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} – {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Low Stock Checkbox */}
          <label className="inline-flex cursor-pointer items-center space-x-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100/60">
            <input
              type="checkbox"
              checked={isLowStockOnly}
              onChange={(e) => onLowStockToggle(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="flex items-center space-x-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span>Cảnh báo tồn thấp</span>
            </span>
          </label>
        </div>

        {/* Action Controls & Refresh */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
            title="Làm mới số dư"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <TableSkeleton rows={6} columns={8} />
      ) : isError ? (
        <ErrorAlert
          title="Không thể tải danh sách số dư tồn kho"
          message={errorMessage || 'Vui lòng kiểm tra kết nối tới máy chủ backend.'}
          onRetry={onRetry}
        />
      ) : balances.length === 0 ? (
        <EmptyState
          title="Không tìm thấy số dư tồn kho nào"
          description={
            searchInput || selectedLocationId || isLowStockOnly
              ? 'Không có kết quả nào phù hợp với bộ lọc hiện tại. Thử xóa bớt điều kiện lọc để xem thêm dữ liệu.'
              : 'Hiện chưa có dữ liệu tồn kho được lưu trữ trong cơ sở dữ liệu.'
          }
          actionLabel={
            searchInput || selectedLocationId || isLowStockOnly ? 'Xóa toàn bộ bộ lọc' : undefined
          }
          onAction={() => {
            onSearchChange('');
            onLocationChange('');
            onLowStockToggle(false);
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {/* Desktop Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="py-3 px-4">Linh kiện / Thiết bị</th>
                  <th className="py-3 px-4">Vị trí lưu trữ</th>
                  <th
                    className="cursor-pointer py-3 px-3 text-right transition-colors hover:bg-slate-100"
                    onClick={() => onSortChange(StockBalanceSortField.ON_HAND)}
                  >
                    <div className="flex items-center justify-end">
                      <span>On-hand (Kho)</span>
                      {renderSortIcon(StockBalanceSortField.ON_HAND)}
                    </div>
                  </th>
                  <th className="py-3 px-3 text-right">Reserved (Giữ chỗ)</th>
                  <th className="py-3 px-3 text-right">Quarantined (Lỗi)</th>
                  <th className="py-3 px-3 text-right">Kit (Gán Kit)</th>
                  <th className="py-3 px-3 text-right text-slate-500">Borrowed (Ngoài kho)</th>
                  <th
                    className="cursor-pointer bg-emerald-50/50 py-3 px-4 text-right font-bold text-emerald-800 transition-colors hover:bg-emerald-100/50"
                    onClick={() => onSortChange(StockBalanceSortField.AVAILABLE)}
                  >
                    <div className="flex items-center justify-end">
                      <span>Available (Khả dụng)</span>
                      {renderSortIcon(StockBalanceSortField.AVAILABLE)}
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {balances.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                    {/* Item Information */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {b.item?.name || (b as any).itemName || 'N/A'}
                      </div>
                      <div className="mt-0.5 flex items-center space-x-2">
                        <span className="font-mono text-[11px] font-semibold text-blue-600">
                          {b.item?.code || (b as any).itemCode || 'N/A'}
                        </span>
                        <span className="text-[10px] text-slate-400">•</span>
                        <span className="text-[10px] text-slate-500">
                          {b.item?.unit || (b as any).itemUnit || 'cái'}
                        </span>
                        {(b.item?.type || (b as any).itemType) && (
                          <StatusBadge
                            status={b.item?.type || (b as any).itemType}
                            variant="itemType"
                          />
                        )}
                      </div>
                    </td>

                    {/* Location Information */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">
                        {b.location?.name || (b as any).locationName || 'N/A'}
                      </div>
                      <div className="mt-0.5 flex items-center space-x-1.5 font-mono text-[10px] text-slate-400">
                        <span>{b.location?.code || (b as any).locationCode || 'N/A'}</span>
                        {(b.location?.type || (b as any).locationType) && (
                          <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-semibold text-slate-600">
                            {b.location?.type || (b as any).locationType}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Stock Numbers */}
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                      {formatNum(b.onHand)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-600">
                      {formatNum(b.reserved)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-600">
                      {formatNum(b.quarantined)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-indigo-600">
                      {formatNum(b.kitAllocated)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-500 bg-slate-50/40">
                      {formatNum(b.borrowed)}
                    </td>

                    {/* Available Column */}
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700 bg-emerald-50/40">
                      {formatNum(b.available)}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 text-center">
                      {b.isLowStock ? (
                        <span
                          className="inline-flex items-center space-x-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800"
                          title={`Tồn khả dụng (${b.available}) thấp hơn ngưỡng tối thiểu (${(b as any).minStockAlert ?? 0})`}
                        >
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                          <span>Tồn thấp</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Bình thường
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row">
            <div className="text-xs text-slate-500">
              Hiển thị{' '}
              <span className="font-semibold text-slate-800">
                {meta.totalItems > 0 ? (page - 1) * meta.limit + 1 : 0}
              </span>{' '}
              -{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(page * meta.limit, meta.totalItems)}
              </span>{' '}
              trên tổng số{' '}
              <span className="font-semibold text-slate-800">{formatNum(meta.totalItems)}</span> dòng tồn kho
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={!meta.hasPrevPage}
                className="inline-flex items-center space-x-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Trang trước</span>
              </button>

              <span className="px-2 text-xs font-semibold text-slate-700">
                Trang {meta.page} / {meta.totalPages || 1}
              </span>

              <button
                onClick={() => onPageChange(page + 1)}
                disabled={!meta.hasNextPage}
                className="inline-flex items-center space-x-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Trang sau</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
