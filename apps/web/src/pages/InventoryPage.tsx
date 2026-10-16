import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Boxes,
  Warehouse,
  Calculator,
  RefreshCw,
  ShieldAlert,
  ArrowRight,
  Cpu,
  ClipboardList,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { inventoryService } from '../services/inventory.service';
import { locationsService } from '../services/locations.service';
import { InventoryKpiCards } from '../components/inventory/InventoryKpiCards';
import { InventoryBalanceTable } from '../components/inventory/InventoryBalanceTable';
import { LocationHierarchyTree } from '../components/inventory/LocationHierarchyTree';
import { LocationFormModal } from '../components/inventory/LocationFormModal';
import { LocationStatusModal } from '../components/inventory/LocationStatusModal';
import { CardSkeleton, TableSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorAlert } from '../components/common/ErrorAlert';
import { EmptyState } from '../components/common/EmptyState';
import {
  calculateAvailableStock,
  StockBalanceSortField,
  SortOrder,
  CreateLocationInput,
  UpdateLocationInput,
  UpdateLocationStatusInput,
} from '@acm/shared';

export const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // RBAC verification: ADMIN, LAB_MANAGER, TECHNICIAN are allowed. STUDENT is forbidden.
  const isAuthorized = user?.role === 'ADMIN' || user?.role === 'LAB_MANAGER' || user?.role === 'TECHNICIAN';
  const isStudent = user?.role === 'STUDENT';

  // Active Tab: 'overview' | 'balances' | 'locations'
  const tabParam = searchParams.get('tab');
  const currentTab = tabParam === 'balances' ? 'balances' : tabParam === 'locations' ? 'locations' : 'overview';
  const selectedTreeLocationId = searchParams.get('selectedId') || '';

  // Search & Filters state derived from URL params or local defaults
  const [searchInput, setSearchInput] = useState<string>(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchParams.get('search') || '');
  const selectedLocationId = searchParams.get('locationId') || '';
  const isLowStockOnly = searchParams.get('isLowStock') === 'true';
  const sortBy = (searchParams.get('sortBy') as StockBalanceSortField) || StockBalanceSortField.UPDATED_AT;
  const sortOrder = (searchParams.get('sortOrder') as SortOrder) || SortOrder.DESC;
  const page = parseInt(searchParams.get('page') || '1', 10);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Synchronize debouncedSearch with URL query parameters
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      newParams.set('search', debouncedSearch);
    } else {
      newParams.delete('search');
    }
    // Only reset to page 1 if search actually changed from url
    if ((searchParams.get('search') || '') !== debouncedSearch) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams, { replace: true });
  }, [debouncedSearch]);

  // Helper to switch tab
  const handleTabChange = (tab: 'overview' | 'balances' | 'locations') => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  // Helper to select location in tree tab
  const handleSelectTreeLocation = (locationId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'locations');
    newParams.set('selectedId', locationId);
    setSearchParams(newParams);
  };

  // Helper to update location filter
  const handleLocationChange = (locId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (locId) {
      newParams.set('locationId', locId);
    } else {
      newParams.delete('locationId');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  // Helper to update low stock filter
  const handleLowStockToggle = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set('isLowStock', 'true');
    } else {
      newParams.delete('isLowStock');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  // Helper to update sort
  const handleSortChange = (field: StockBalanceSortField) => {
    const newParams = new URLSearchParams(searchParams);
    if (sortBy === field) {
      newParams.set('sortOrder', sortOrder === SortOrder.ASC ? SortOrder.DESC : SortOrder.ASC);
    } else {
      newParams.set('sortBy', field);
      newParams.set('sortOrder', SortOrder.DESC);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  // Helper to update page
  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
  };

  // 1. TanStack Query: Inventory Summary (Overview Tab)
  const summaryQuery = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => inventoryService.getSummary(),
    enabled: isAuthorized,
    staleTime: 30000,
  });

  // 2. TanStack Query: Locations List (Filter Dropdown)
  const locationsQuery = useQuery({
    queryKey: ['locations', 'list'],
    queryFn: () => inventoryService.getLocations(100),
    enabled: isAuthorized,
    staleTime: 60000,
  });

  // 3. TanStack Query: Stock Balances (Balances Tab)
  const balancesQuery = useQuery({
    queryKey: [
      'inventory',
      'balances',
      {
        search: debouncedSearch,
        locationId: selectedLocationId,
        isLowStock: isLowStockOnly,
        sortBy,
        sortOrder,
        page,
        limit: 20,
      },
    ],
    queryFn: () =>
      inventoryService.getBalances({
        search: debouncedSearch,
        locationId: selectedLocationId || undefined,
        isLowStock: isLowStockOnly ? true : undefined,
        sortBy,
        sortOrder,
        page,
        limit: 20,
      }),
    enabled: isAuthorized && currentTab === 'balances',
    staleTime: 15000,
  });

  // 4. TanStack Query: Location Hierarchy Tree (Locations Tab)
  const treeQuery = useQuery({
    queryKey: ['locations', 'tree'],
    queryFn: () => inventoryService.getLocationTree(false),
    enabled: isAuthorized && currentTab === 'locations',
    staleTime: 60000,
  });

  // 5. TanStack Query: Selected Location Detail (Locations Tab)
  const locationDetailQuery = useQuery({
    queryKey: ['locations', 'detail', selectedTreeLocationId],
    queryFn: () => inventoryService.getLocationDetail(selectedTreeLocationId),
    enabled: isAuthorized && currentTab === 'locations' && !!selectedTreeLocationId,
    staleTime: 15000,
  });

  const queryClient = useQueryClient();

  // Write authorization: ADMIN or LAB_MANAGER
  const canWriteLocation = user?.role === 'ADMIN' || user?.role === 'LAB_MANAGER';

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingLocation, setEditingLocation] = useState<any>(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusTargetLocation, setStatusTargetLocation] = useState<any>(null);
  const [statusTargetActive, setStatusTargetActive] = useState<boolean>(false);

  // Invalidate queries helper
  const invalidateLocationQueries = (locationId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['locations', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['locations', 'tree'] });
    if (locationId) {
      queryClient.invalidateQueries({ queryKey: ['locations', 'detail', locationId] });
    }
    queryClient.invalidateQueries({ queryKey: ['inventory', 'summary'] });
  };

  // Create Location Mutation (no auto-retry)
  const createLocationMutation = useMutation({
    mutationFn: (data: CreateLocationInput) => locationsService.createLocation(data),
    retry: false,
    onSuccess: (created) => {
      invalidateLocationQueries(created.id);
      setIsFormModalOpen(false);
      handleSelectTreeLocation(created.id);
    },
  });

  // Update Location Mutation (no auto-retry)
  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLocationInput }) =>
      locationsService.updateLocation(id, data),
    retry: false,
    onSuccess: (updated) => {
      invalidateLocationQueries(updated.id);
      setIsFormModalOpen(false);
    },
  });

  // Update Location Status Mutation (no auto-retry)
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLocationStatusInput }) =>
      locationsService.updateLocationStatus(id, data),
    retry: false,
    onSuccess: (updated) => {
      invalidateLocationQueries(updated.id);
      setIsStatusModalOpen(false);
    },
  });

  // Interactive Calculator Sandbox state (Preserved for education & verification)
  const [showSandbox, setShowSandbox] = useState(false);
  const [calcOnHand, setCalcOnHand] = useState(100);
  const [calcReserved, setCalcReserved] = useState(15);
  const [calcQuarantined, setCalcQuarantined] = useState(5);
  const [calcKitAllocated, setCalcKitAllocated] = useState(10);
  const [calcBorrowed, setCalcBorrowed] = useState(25);
  const [calcResult, setCalcResult] = useState<number | null>(70);
  const [calcError, setCalcError] = useState<string | null>(null);

  const runCalculation = () => {
    setCalcError(null);
    try {
      const res = calculateAvailableStock({
        onHand: Number(calcOnHand),
        reserved: Number(calcReserved),
        quarantined: Number(calcQuarantined),
        kitAllocated: Number(calcKitAllocated),
        borrowed: Number(calcBorrowed),
      });
      setCalcResult(res);
    } catch (err: any) {
      setCalcError(err.message);
      setCalcResult(null);
    }
  };

  // RBAC Access Denied Screen for Students
  if (isStudent) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 sm:text-xl">
          Truy cập Giới hạn – Khu vực Quản trị Kho Nội bộ
        </h2>
        <p className="mt-2 max-w-md text-xs text-slate-600 leading-relaxed">
          Tài khoản Sinh viên (<code>STUDENT</code>) không có quyền truy cập màn hình giám sát và số dư kho nội bộ.
          Bạn có thể tra cứu thông tin linh kiện tại danh mục công khai hoặc gửi yêu cầu mượn trả thiết bị.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => navigate('/items')}
            className="inline-flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Cpu className="h-4 w-4" />
            <span>Tra cứu Linh kiện & Thiết bị</span>
          </button>
          <button
            onClick={() => navigate('/borrow-return')}
            className="inline-flex items-center space-x-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ClipboardList className="h-4 w-4 text-slate-500" />
            <span>Đến Mượn & Trả Thiết bị</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Kho & Số dư Tồn kho (Inventory & Stock Balance)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Giám sát trạng thái tồn kho vật lý, hàng đặt chỗ, gán kit và kiểm soát hàng lưu hành mượn
          </p>
        </div>

        {/* Global Refresh Button */}
        <button
          onClick={() => {
            if (currentTab === 'overview') {
              summaryQuery.refetch();
            } else if (currentTab === 'balances') {
              balancesQuery.refetch();
            } else {
              treeQuery.refetch();
              if (selectedTreeLocationId) {
                locationDetailQuery.refetch();
              }
            }
          }}
          disabled={
            summaryQuery.isFetching ||
            balancesQuery.isFetching ||
            treeQuery.isFetching ||
            locationDetailQuery.isFetching
          }
          className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-slate-500 ${
              summaryQuery.isFetching ||
              balancesQuery.isFetching ||
              treeQuery.isFetching ||
              locationDetailQuery.isFetching
                ? 'animate-spin'
                : ''
            }`}
          />
          <span>Làm mới dữ liệu</span>
        </button>
      </div>

      {/* Tab Navigation Pill Bar */}
      <div className="flex space-x-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 sm:w-fit">
        <button
          onClick={() => handleTabChange('overview')}
          className={`flex items-center space-x-2 rounded-lg px-4 py-2 transition-all ${
            currentTab === 'overview'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Tổng quan KPI</span>
        </button>
        <button
          onClick={() => handleTabChange('balances')}
          className={`flex items-center space-x-2 rounded-lg px-4 py-2 transition-all ${
            currentTab === 'balances'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Boxes className="h-4 w-4" />
          <span>Số dư Tồn kho Chi tiết</span>
        </button>
        <button
          onClick={() => handleTabChange('locations')}
          className={`flex items-center space-x-2 rounded-lg px-4 py-2 transition-all ${
            currentTab === 'locations'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Warehouse className="h-4 w-4" />
          <span>Cây Vị trí Kho</span>
        </button>
      </div>

      {/* Tab 1: Overview Dashboard */}
      {currentTab === 'overview' && (
        <div className="space-y-6">
          {summaryQuery.isLoading ? (
            <CardSkeleton count={6} />
          ) : summaryQuery.isError ? (
            <ErrorAlert
              title="Không thể tải dữ liệu tổng quan kho"
              message={
                (summaryQuery.error as any)?.response?.data?.message ||
                summaryQuery.error?.message ||
                'Đã xảy ra lỗi kết nối.'
              }
              onRetry={() => summaryQuery.refetch()}
              isRetrying={summaryQuery.isFetching}
            />
          ) : summaryQuery.data ? (
            <InventoryKpiCards summary={summaryQuery.data} />
          ) : (
            <EmptyState title="Không có dữ liệu tổng quan kho" />
          )}

          {/* Collapsible Interactive Formula Sandbox */}
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSandbox(!showSandbox)}
              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50/50"
            >
              <div className="flex items-center space-x-2">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Công cụ Kiểm tra Công thức Tồn kho Khả dụng (Interactive Sandbox)
                </span>
              </div>
              {showSandbox ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {showSandbox && (
              <div className="border-t border-slate-100 p-5 bg-slate-50/40">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">On-hand (Kho)</label>
                    <input
                      type="number"
                      value={calcOnHand}
                      onChange={(e) => setCalcOnHand(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">Reserved (Giữ chỗ)</label>
                    <input
                      type="number"
                      value={calcReserved}
                      onChange={(e) => setCalcReserved(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-amber-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">Quarantined (Lỗi)</label>
                    <input
                      type="number"
                      value={calcQuarantined}
                      onChange={(e) => setCalcQuarantined(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-rose-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">KitAllocated (Kit)</label>
                    <input
                      type="number"
                      value={calcKitAllocated}
                      onChange={(e) => setCalcKitAllocated(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-indigo-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">Borrowed (Ngoài kho)</label>
                    <input
                      type="number"
                      value={calcBorrowed}
                      onChange={(e) => setCalcBorrowed(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-600 bg-white"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                  <button
                    onClick={runCalculation}
                    className="w-full sm:w-auto rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Tính toán kết quả
                  </button>

                  {calcError ? (
                    <div className="flex items-center space-x-1.5 text-xs text-rose-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>{calcError}</span>
                    </div>
                  ) : (
                    calcResult !== null && (
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-500">Tồn khả dụng (Available):</span>
                        <span className="font-mono text-base font-extrabold text-emerald-600 bg-emerald-50 px-3 py-0.5 rounded border border-emerald-200">
                          {calcResult}
                        </span>
                        <span className="text-slate-400">
                          (Đã trừ trong OnHand trước đó: {calcBorrowed} cái ngoài kho)
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Balances Table */}
      {currentTab === 'balances' && (
        <InventoryBalanceTable
          balances={balancesQuery.data?.balances || []}
          meta={
            balancesQuery.data?.meta || {
              page,
              limit: 20,
              totalItems: 0,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            }
          }
          locations={locationsQuery.data || []}
          isLoading={balancesQuery.isLoading}
          isError={balancesQuery.isError}
          errorMessage={
            (balancesQuery.error as any)?.response?.data?.message || balancesQuery.error?.message
          }
          onRetry={() => balancesQuery.refetch()}
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          selectedLocationId={selectedLocationId}
          onLocationChange={handleLocationChange}
          isLowStockOnly={isLowStockOnly}
          onLowStockToggle={handleLowStockToggle}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          page={page}
          onPageChange={handlePageChange}
          onRefresh={() => balancesQuery.refetch()}
        />
      )}

      {/* Tab 3: Location Hierarchy Tree */}
      {currentTab === 'locations' && (
        <LocationHierarchyTree
          tree={treeQuery.data || []}
          selectedLocationId={selectedTreeLocationId}
          onSelectLocation={handleSelectTreeLocation}
          isLoading={treeQuery.isLoading}
          isError={treeQuery.isError}
          errorMessage={
            (treeQuery.error as any)?.response?.data?.message || treeQuery.error?.message
          }
          onRetry={() => treeQuery.refetch()}
          locationDetail={locationDetailQuery.data}
          isDetailLoading={locationDetailQuery.isLoading}
          isDetailError={locationDetailQuery.isError}
          detailErrorMessage={
            (locationDetailQuery.error as any)?.response?.data?.message ||
            locationDetailQuery.error?.message
          }
          onDetailRetry={() => locationDetailQuery.refetch()}
          canWrite={canWriteLocation}
          onAddLocation={() => {
            setFormModalMode('CREATE');
            setEditingLocation(null);
            setIsFormModalOpen(true);
          }}
          onEditLocation={(loc) => {
            setFormModalMode('EDIT');
            setEditingLocation(loc);
            setIsFormModalOpen(true);
          }}
          onToggleStatus={(loc, targetActive) => {
            setStatusTargetLocation(loc);
            setStatusTargetActive(targetActive);
            setIsStatusModalOpen(true);
          }}
        />
      )}

      {/* Location Create / Edit Modal */}
      {isFormModalOpen && (
        <LocationFormModal
          isOpen={isFormModalOpen}
          mode={formModalMode}
          initialLocation={editingLocation}
          defaultParentId={selectedTreeLocationId || undefined}
          existingLocations={locationsQuery.data || []}
          onClose={() => setIsFormModalOpen(false)}
          onSubmit={async (data) => {
            if (formModalMode === 'CREATE') {
              await createLocationMutation.mutateAsync(data);
            } else if (editingLocation) {
              await updateLocationMutation.mutateAsync({
                id: editingLocation.id,
                data,
              });
            }
          }}
          isSubmitting={createLocationMutation.isPending || updateLocationMutation.isPending}
          serverError={
            (createLocationMutation.error as any)?.response?.data?.message ||
            createLocationMutation.error?.message ||
            (updateLocationMutation.error as any)?.response?.data?.message ||
            updateLocationMutation.error?.message ||
            null
          }
        />
      )}

      {/* Location Status Confirmation Modal */}
      {isStatusModalOpen && statusTargetLocation && (
        <LocationStatusModal
          isOpen={isStatusModalOpen}
          location={statusTargetLocation}
          targetActive={statusTargetActive}
          onClose={() => setIsStatusModalOpen(false)}
          onConfirm={async (data) => {
            await updateStatusMutation.mutateAsync({
              id: statusTargetLocation.id,
              data,
            });
          }}
          isSubmitting={updateStatusMutation.isPending}
          serverError={
            (updateStatusMutation.error as any)?.response?.data?.message ||
            updateStatusMutation.error?.message ||
            null
          }
        />
      )}
    </div>
  );
};
