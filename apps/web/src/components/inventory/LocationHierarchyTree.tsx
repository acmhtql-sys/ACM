import React, { useState, useMemo } from 'react';
import {
  Warehouse,
  Layers,
  Grid,
  Box,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Package,
  AlertCircle,
  Building2,
  FolderOpen,
  Folder,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Edit3,
  Power,
} from 'lucide-react';
import { LocationNode, LocationType } from '@acm/shared';
import { CardSkeleton, TableSkeleton } from '../common/LoadingSkeleton';
import { ErrorAlert } from '../common/ErrorAlert';
import { EmptyState } from '../common/EmptyState';
import { isLocationWriteEnabled } from '../../config/features';

export interface LocationHierarchyTreeProps {
  tree: LocationNode[];
  selectedLocationId?: string;
  onSelectLocation: (locationId: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  locationDetail?: any;
  isDetailLoading?: boolean;
  isDetailError?: boolean;
  detailErrorMessage?: string;
  onDetailRetry?: () => void;
  canWrite?: boolean;
  onAddLocation?: (parentId?: string) => void;
  onEditLocation?: (location: any) => void;
  onToggleStatus?: (location: any, targetActive: boolean) => void;
}

// Type badge configuration helper
export const getLocationTypeMeta = (type: LocationType) => {
  switch (type) {
    case LocationType.WAREHOUSE:
      return {
        label: 'Kho tổng',
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        icon: Warehouse,
      };
    case LocationType.RACK:
      return {
        label: 'Kệ',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        icon: Layers,
      };
    case LocationType.SHELF:
      return {
        label: 'Tầng kệ',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        icon: Grid,
      };
    case LocationType.BIN:
      return {
        label: 'Khay/Hộp',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        icon: Box,
      };
    default:
      return {
        label: type,
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        icon: Package,
      };
  }
};

export const LocationHierarchyTree: React.FC<LocationHierarchyTreeProps> = ({
  tree,
  selectedLocationId,
  onSelectLocation,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  locationDetail,
  isDetailLoading,
  isDetailError,
  detailErrorMessage,
  onDetailRetry,
  canWrite = false,
  onAddLocation,
  onEditLocation,
  onToggleStatus,
}) => {
  const isWriteEnabled = isLocationWriteEnabled();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Helper to collect all node IDs that have children
  const getAllParentNodeIds = (nodes: LocationNode[]): string[] => {
    const ids: string[] = [];
    const traverse = (list: LocationNode[], visited = new Set<string>()) => {
      for (const node of list) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        if (node.children && node.children.length > 0) {
          ids.push(node.id);
          traverse(node.children, visited);
        }
      }
    };
    traverse(nodes);
    return ids;
  };

  // Expand all parent nodes
  const handleExpandAll = () => {
    const parentIds = getAllParentNodeIds(tree);
    const newExpanded: Record<string, boolean> = {};
    for (const id of parentIds) {
      newExpanded[id] = true;
    }
    setExpandedNodes(newExpanded);
  };

  // Collapse all nodes
  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  // Toggle single node
  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Search filtering logic:
  // Preserves ancestors when a child/leaf matches!
  const { filteredTree, matchingIds, autoExpandIds } = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return { filteredTree: tree, matchingIds: new Set<string>(), autoExpandIds: new Set<string>() };
    }

    const matches = new Set<string>();
    const ancestors = new Set<string>();

    const checkNode = (node: LocationNode, parentPath: string[] = []): boolean => {
      const codeMatch = node.code.toLowerCase().includes(trimmed);
      const nameMatch = node.name.toLowerCase().includes(trimmed);
      const isSelfMatch = codeMatch || nameMatch;

      if (isSelfMatch) {
        matches.add(node.id);
        for (const ancestorId of parentPath) {
          ancestors.add(ancestorId);
        }
      }

      let childMatched = false;
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const matched = checkNode(child, [...parentPath, node.id]);
          if (matched) childMatched = true;
        }
      }

      return isSelfMatch || childMatched;
    };

    const filterNodes = (nodes: LocationNode[]): LocationNode[] => {
      const result: LocationNode[] = [];
      for (const node of nodes) {
        const isMatchedOrHasMatchedDescendants =
          matches.has(node.id) || ancestors.has(node.id);
        if (isMatchedOrHasMatchedDescendants) {
          result.push({
            ...node,
            children: node.children ? filterNodes(node.children) : [],
          });
        }
      }
      return result;
    };

    // First pass: identify matches and ancestors
    for (const root of tree) {
      checkNode(root, []);
    }

    // Second pass: produce filtered tree
    const filtered = filterNodes(tree);

    return {
      filteredTree: filtered,
      matchingIds: matches,
      autoExpandIds: ancestors,
    };
  }, [tree, searchQuery]);

  // Compute ancestor path for selected location
  const ancestorPath = useMemo(() => {
    if (!selectedLocationId) return [];

    const path: LocationNode[] = [];
    const findPath = (nodes: LocationNode[], currentPath: LocationNode[] = []): boolean => {
      for (const node of nodes) {
        const nextPath = [...currentPath, node];
        if (node.id === selectedLocationId) {
          path.push(...nextPath);
          return true;
        }
        if (node.children && node.children.length > 0) {
          if (findPath(node.children, nextPath)) return true;
        }
      }
      return false;
    };

    findPath(tree, []);
    return path;
  }, [tree, selectedLocationId]);

  // Recursive tree node renderer
  const renderTreeNode = (
    node: LocationNode,
    level = 0,
    visited = new Set<string>()
  ): React.ReactNode => {
    // Cycle protection
    if (visited.has(node.id)) {
      return null;
    }
    const currentVisited = new Set(visited);
    currentVisited.add(node.id);

    const hasChildren = node.children && node.children.length > 0;
    // An item is expanded if explicitly toggled OR auto-expanded by search match
    const isExpanded =
      expandedNodes[node.id] ||
      (autoExpandIds.has(node.id) && searchQuery.trim() !== '') ||
      level === 0; // Root is open by default
    const isSelected = selectedLocationId === node.id;
    const isMatch = matchingIds.has(node.id);
    const meta = getLocationTypeMeta(node.type);
    const IconComponent = meta.icon;

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => onSelectLocation(node.id)}
          style={{ paddingLeft: `${Math.min(level * 20 + 8, 120)}px` }}
          className={`group flex items-center justify-between py-2 pr-3 text-xs transition-colors cursor-pointer border-l-2 ${
            isSelected
              ? 'bg-blue-50/90 border-blue-600 font-semibold text-blue-900 shadow-sm'
              : isMatch
              ? 'bg-amber-50/70 border-amber-500 text-slate-900'
              : 'border-transparent text-slate-700 hover:bg-slate-100/70 hover:text-slate-900'
          }`}
        >
          {/* Left: Expand icon + Location Icon + Code + Name */}
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleNode(node.id, e)}
                className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200/80 hover:text-slate-700 focus:outline-none"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="inline-block h-5 w-5" />
            )}

            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${meta.bg} ${meta.border} ${meta.text}`}
            >
              <IconComponent className="h-3.5 w-3.5" />
            </div>

            <div className="min-w-0 flex-1 truncate">
              <span
                className={`font-mono text-xs font-semibold ${
                  isSelected ? 'text-blue-700' : 'text-slate-800'
                }`}
              >
                {node.code}
              </span>
              <span className="mx-1 text-slate-300">·</span>
              <span className="text-[11px] text-slate-600 truncate">{node.name}</span>
            </div>
          </div>

          {/* Right: Type badge & Status */}
          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${meta.bg} ${meta.border} ${meta.text}`}
            >
              {meta.label}
            </span>

            {!node.isActive && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 border border-rose-200">
                Ngưng
              </span>
            )}
          </div>
        </div>

        {/* Recursive Children */}
        {hasChildren && isExpanded && (
          <div className="relative">
            {/* Guide line */}
            <div
              style={{ left: `${Math.min(level * 20 + 17, 129)}px` }}
              className="absolute top-0 bottom-0 w-px bg-slate-200/80"
            />
            {node.children.map((child) =>
              renderTreeNode(child, level + 1, currentVisited)
            )}
          </div>
        )}
      </div>
    );
  };

  // Format number helper zero-safe
  const formatNum = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return val.toLocaleString('vi-VN');
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT PANE: Location Hierarchy Tree (5 cols on lg) */}
      <div className="lg:col-span-5 rounded-xl border border-slate-200/80 bg-white shadow-sm flex flex-col h-[720px] overflow-hidden">
        {/* Tree Header & Actions */}
        <div className="border-b border-slate-100 p-4 space-y-3 shrink-0 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Warehouse className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Cây Phân cấp Vị trí Kho
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              {canWrite && (
                <button
                  type="button"
                  onClick={() => onAddLocation?.()}
                  disabled={!isWriteEnabled}
                  className="inline-flex items-center space-x-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                  title={!isWriteEnabled ? 'Chức năng ghi đang tạm khóa (Feature Flag OFF)' : 'Thêm vị trí mới'}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm vị trí</span>
                </button>
              )}
              <div className="flex items-center space-x-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="rounded px-2 py-1 text-slate-600 hover:bg-slate-200/70 font-medium"
                >
                  Mở rộng tất cả
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="rounded px-2 py-1 text-slate-600 hover:bg-slate-200/70 font-medium"
                >
                  Thu gọn tất cả
                </button>
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm vị trí (mã, tên)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tree Content Area */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-50">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <div className="h-6 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-6 bg-slate-100 rounded animate-pulse w-5/6 ml-4" />
              <div className="h-6 bg-slate-100 rounded animate-pulse w-2/3 ml-8" />
              <div className="h-6 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-6 bg-slate-100 rounded animate-pulse w-4/5 ml-4" />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorAlert
                title="Không thể tải cây vị trí kho"
                message={errorMessage || 'Lỗi kết nối máy chủ.'}
                onRetry={onRetry}
              />
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                title={
                  searchQuery.trim()
                    ? `Không tìm thấy vị trí khớp với "${searchQuery}"`
                    : 'Chưa có vị trí kho nào được tạo'
                }
                description={
                  searchQuery.trim()
                    ? 'Thử tìm với từ khóa khác hoặc xóa bộ lọc tìm kiếm.'
                    : 'Cơ sở dữ liệu kho hiện chưa có vị trí phân cấp.'
                }
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5 text-slate-400" />
                  <span>Xóa tìm kiếm</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredTree.map((rootNode) => renderTreeNode(rootNode, 0))}
            </div>
          )}
        </div>

        {/* Tree Footer Info */}
        <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isWriteEnabled ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>
              {isWriteEnabled
                ? 'Chế độ Quản trị (Ghi kích hoạt)'
                : 'Chế độ Thử nghiệm (Ghi tạm khóa)'}
            </span>
          </div>
          <span className="text-slate-400 font-mono">
            {tree.length} vị trí gốc
          </span>
        </div>
      </div>

      {/* RIGHT PANE: Selected Location Detail & Stock Balances (7 cols on lg) */}
      <div className="lg:col-span-7 flex flex-col space-y-6">
        {!selectedLocationId ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm h-[720px] flex flex-col items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 mb-4 border border-slate-100">
              <Warehouse className="h-8 w-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Chưa chọn vị trí kho
            </h3>
            <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed">
              Nhấp vào một vị trí bất kỳ trên cây phân cấp bên trái để xem thông tin chi tiết, danh sách vị trí con và số dư linh kiện đang lưu trữ tại vị trí đó.
            </p>
          </div>
        ) : isDetailLoading ? (
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4 h-[720px]">
            <div className="h-7 bg-slate-100 rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="h-20 bg-slate-100 rounded animate-pulse" />
              <div className="h-20 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="h-64 bg-slate-100 rounded mt-6 animate-pulse" />
          </div>
        ) : isDetailError ? (
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <ErrorAlert
              title="Không thể tải thông tin chi tiết vị trí"
              message={detailErrorMessage || 'Lỗi kết nối máy chủ.'}
              onRetry={onDetailRetry}
            />
          </div>
        ) : locationDetail ? (
          <div className="space-y-6">
            {/* Location Overview Card */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
              {/* Header: Code + Name + Badges */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  {/* Breadcrumb path */}
                  {ancestorPath.length > 0 && (
                    <div className="flex items-center space-x-1 text-[11px] text-slate-400 mb-1 flex-wrap">
                      {ancestorPath.map((item, idx) => (
                        <React.Fragment key={item.id}>
                          <button
                            type="button"
                            onClick={() => onSelectLocation(item.id)}
                            className={`hover:text-blue-600 transition-colors ${
                              item.id === selectedLocationId
                                ? 'font-semibold text-slate-700'
                                : ''
                            }`}
                          >
                            {item.code}
                          </button>
                          {idx < ancestorPath.length - 1 && (
                            <span className="text-slate-300">/</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center space-x-2.5">
                    <h2 className="text-lg font-bold font-mono text-slate-900 tracking-tight">
                      {locationDetail.code}
                    </h2>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {locationDetail.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {(() => {
                    const meta = getLocationTypeMeta(locationDetail.type);
                    const MetaIcon = meta.icon;
                    return (
                      <span
                        className={`inline-flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border ${meta.bg} ${meta.border} ${meta.text}`}
                      >
                        <MetaIcon className="h-3.5 w-3.5" />
                        <span>{meta.label}</span>
                      </span>
                    );
                  })()}

                  {locationDetail.isActive ? (
                    <span className="inline-flex items-center space-x-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Hoạt động</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Ngưng hoạt động</span>
                    </span>
                  )}

                  {/* Write Actions (ADMIN / LAB_MANAGER) */}
                  {canWrite && (
                    <div className="flex items-center space-x-1.5 ml-2 border-l border-slate-200 pl-2">
                      <button
                        type="button"
                        onClick={() => onEditLocation?.(locationDetail)}
                        disabled={!isWriteEnabled}
                        className="inline-flex items-center space-x-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          !isWriteEnabled
                            ? 'Chức năng ghi đang tạm khóa (Feature Flag OFF)'
                            : 'Chỉnh sửa vị trí'
                        }
                      >
                        <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                        <span>Chỉnh sửa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onToggleStatus?.(locationDetail, !locationDetail.isActive)
                        }
                        disabled={!isWriteEnabled}
                        className={`inline-flex items-center space-x-1 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          locationDetail.isActive
                            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title={
                          !isWriteEnabled
                            ? 'Chức năng ghi đang tạm khóa (Feature Flag OFF)'
                            : locationDetail.isActive
                            ? 'Vô hiệu hóa vị trí'
                            : 'Kích hoạt vị trí'
                        }
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>
                          {locationDetail.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Vị trí trực thuộc (Cha)</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                    {locationDetail.parent ? (
                      <button
                        type="button"
                        onClick={() => onSelectLocation(locationDetail.parent.id)}
                        className="text-blue-600 hover:underline font-mono"
                      >
                        {locationDetail.parent.code} ({locationDetail.parent.name})
                      </button>
                    ) : (
                      <span className="text-slate-400 italic">Gốc cao nhất (Root)</span>
                    )}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Số vị trí con trực tiếp</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block font-mono">
                    {locationDetail.children?.length ?? locationDetail.childrenCount ?? 0} vị trí
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Số loại linh kiện lưu</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block font-mono">
                    {locationDetail.stockBalances?.length ?? locationDetail.itemsCount ?? 0} loại
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Ngày tạo</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {locationDetail.createdAt
                      ? new Date(locationDetail.createdAt).toLocaleDateString('vi-VN')
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Direct Children Chips */}
              {locationDetail.children && locationDetail.children.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Các Vị trí Con trực tiếp ({locationDetail.children.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {locationDetail.children.map((child: any) => {
                      const childMeta = getLocationTypeMeta(child.type);
                      const ChildIcon = childMeta.icon;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => onSelectLocation(child.id)}
                          className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 transition-all shadow-sm"
                        >
                          <ChildIcon className="h-3 w-3 text-slate-400" />
                          <span className="font-mono font-semibold">{child.code}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 truncate max-w-[120px]">
                            {child.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Stock Balances at this Location Table */}
            <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-4 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Số dư Linh kiện tại Vị trí này ({locationDetail.stockBalances?.length || 0})
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  Mã: <code className="font-mono font-bold text-slate-700">{locationDetail.code}</code>
                </span>
              </div>

              {!locationDetail.stockBalances || locationDetail.stockBalances.length === 0 ? (
                <div className="p-8 text-center">
                  <EmptyState
                    title="Chưa có linh kiện lưu tại vị trí này"
                    description="Hiện chưa có số dư tồn kho nào được ghi nhận tại vị trí kho này."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Mã LK</th>
                        <th className="py-2.5 px-3">Tên Linh kiện</th>
                        <th className="py-2.5 px-3 text-right">On-hand</th>
                        <th className="py-2.5 px-3 text-right">Reserved</th>
                        <th className="py-2.5 px-3 text-right">Quarantined</th>
                        <th className="py-2.5 px-3 text-right">Kit</th>
                        <th className="py-2.5 px-3 text-right">Borrowed</th>
                        <th className="py-2.5 px-3 text-right">Available</th>
                        <th className="py-2.5 px-3 text-center">Cảnh báo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {locationDetail.stockBalances.map((sb: any) => (
                        <tr
                          key={sb.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                            {sb.item?.code || sb.itemCode || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">
                            <div>{sb.item?.name || sb.itemName || '—'}</div>
                            <span className="text-[10px] text-slate-400">
                              Đơn vị: {sb.item?.unit || sb.itemUnit || 'cái'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatNum(sb.onHand)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-600">
                            {formatNum(sb.reserved)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                            {formatNum(sb.quarantined)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-indigo-600">
                            {formatNum(sb.kitAllocated)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                            {formatNum(sb.borrowed)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-600 bg-emerald-50/30">
                            {formatNum(sb.available)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {sb.isLowStock ? (
                              <span className="inline-flex items-center space-x-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                <AlertCircle className="h-3 w-3" />
                                <span>Thấp</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium">
                                Bình thường
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
