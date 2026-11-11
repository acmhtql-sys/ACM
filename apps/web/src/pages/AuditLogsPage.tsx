import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Lock,
  AlertTriangle,
  X,
  FileText,
  User,
  Clock,
  Info,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userName: string;
  createdAt: string;
  details: string; // JSON string
}

export const AuditLogsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');

  // Inspection Modal
  const [inspectLog, setInspectLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/audit-logs');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setLogs(res.data.data);
      } else {
        setError('Định dạng dữ liệu kiểm toán không hợp lệ từ máy chủ');
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setError('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      } else if (status === 403) {
        setError('Truy cập bị từ chối: Chỉ Quản trị viên (ADMIN) mới có quyền xem nhật ký kiểm toán.');
      } else {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            'Không thể kết nối đến máy chủ để tải nhật ký kiểm toán.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchLogs();
    }
  }, [isAdmin]);

  // Extract unique actions and entities for filter dropdowns
  const availableActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  const availableEntities = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.entity));
    return Array.from(set).sort();
  }, [logs]);

  // Client-side filtering within the 50 loaded records
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedAction !== 'ALL' && log.action !== selectedAction) {
        return false;
      }
      if (selectedEntity !== 'ALL' && log.entity !== selectedEntity) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesAction = log.action.toLowerCase().includes(term);
        const matchesEntity = log.entity.toLowerCase().includes(term);
        const matchesEntityId = (log.entityId || '').toLowerCase().includes(term);
        const matchesUser = log.userName.toLowerCase().includes(term);
        const matchesDetails = (log.details || '').toLowerCase().includes(term);
        return matchesAction || matchesEntity || matchesEntityId || matchesUser || matchesDetails;
      }
      return true;
    });
  }, [logs, selectedAction, selectedEntity, searchTerm]);

  // Format action badge style
  const getActionBadgeClass = (action: string) => {
    if (action.includes('CREATE') || action.includes('IMPORT') || action.includes('SEED')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('UPDATE') || action.includes('EDIT')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (action.includes('DELETE') || action.includes('REJECT') || action.includes('CANCEL') || action.includes('LOCK')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (action.includes('BORROW') || action.includes('RETURN') || action.includes('HANDOVER')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // Safe parse JSON details
  const parseDetails = (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  };

  // RBAC guard if non-admin attempts to view
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Nhật ký Hoạt động & Kiểm toán (Audit Logs)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Hệ thống giám sát và truy vết an toàn mọi biến động dữ liệu
          </p>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-rose-500 mb-3" />
          <h2 className="text-sm font-bold text-rose-900">
            Giới hạn Quyền Truy Cập (Access Denied)
          </h2>
          <p className="mt-1 text-xs text-rose-700 max-w-md mx-auto leading-relaxed">
            Phân hệ Nhật ký Kiểm toán chỉ dành riêng cho Quản trị viên (ADMIN) để đảm bảo tuân thủ tiêu chuẩn an ninh và quyền riêng tư theo mô hình RBAC của hệ thống ACM.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl flex items-center space-x-2.5">
            <span>Nhật ký Hoạt động & Kiểm toán (Audit Logs)</span>
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 border border-brand-200/60">
              <ShieldCheck className="h-3 w-3 mr-1" /> ADMIN Only
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Truy vết biến động dữ liệu, kiểm toán thao tác người dùng và đảm bảo tính bất biến của hệ thống
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-soft hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin text-brand-600' : ''}`} />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      {/* Scope Notice Banner */}
      <div className="flex items-center justify-between rounded-2xl border border-brand-200/80 bg-brand-50/40 p-3.5 text-xs text-brand-900 shadow-xs">
        <div className="flex items-center space-x-2.5">
          <Info className="h-4 w-4 text-brand-600 flex-shrink-0" />
          <span>
            <strong>Phạm vi tải:</strong> Đang hiển thị tối đa 50 bản ghi kiểm toán mới nhất theo hợp đồng API.
            Bộ lọc tìm kiếm dưới đây hoạt động trong phạm vi 50 bản ghi đã tải về máy.
          </span>
        </div>
        <div className="text-[11px] font-semibold text-brand-700 flex-shrink-0 ml-2 bg-white px-2.5 py-1 rounded-lg border border-brand-200/60">
          {filteredLogs.length} / {logs.length} bản ghi
        </div>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm theo hành động, đối tượng, người thực hiện hoặc nội dung..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="ALL">Tất cả hành động ({availableActions.length})</option>
              {availableActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:bg-white focus:outline-none cursor-pointer"
          >
            <option value="ALL">Tất cả đối tượng ({availableEntities.length})</option>
            {availableEntities.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>

          {(searchTerm || selectedAction !== 'ALL' || selectedEntity !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedAction('ALL');
                setSelectedEntity('ALL');
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              title="Xóa bộ lọc"
            >
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && logs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-3 text-xs font-medium text-slate-600">
            Đang tải 50 bản ghi nhật ký kiểm toán mới nhất...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-xs font-bold text-rose-900">Không thể tải nhật ký kiểm toán</h2>
              <p className="mt-1 text-xs text-rose-700">{error}</p>
              <button
                onClick={fetchLogs}
                className="mt-3 inline-flex items-center space-x-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Thử lại</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State when no logs exist in system */}
      {!loading && !error && logs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-sm font-bold text-slate-800">
            Chưa có bản ghi nhật ký kiểm toán nào
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Hệ thống chưa ghi nhận bất kỳ thao tác thay đổi dữ liệu nào trong bảng AuditLog.
          </p>
        </div>
      )}

      {/* Filter Empty State */}
      {!loading && !error && logs.length > 0 && filteredLogs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Search className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-2 text-xs font-bold text-slate-700">
            Không tìm thấy bản ghi phù hợp
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Không có bản ghi nào trong 50 mục đã tải khớp với điều kiện lọc hiện tại.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedAction('ALL');
              setSelectedEntity('ALL');
            }}
            className="mt-3 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Xóa các tiêu chí tìm kiếm
          </button>
        </div>
      )}

      {/* Table Data */}
      {!loading && !error && filteredLogs.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-4">Thời gian</th>
                  <th className="py-3.5 px-4">Hành động</th>
                  <th className="py-3.5 px-4">Đối tượng</th>
                  <th className="py-3.5 px-4">Mã đối tượng (Entity ID)</th>
                  <th className="py-3.5 px-4">Người thực hiện</th>
                  <th className="py-3.5 px-4 text-right">Chi tiết an toàn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>{new Date(log.createdAt).toLocaleString('vi-VN')}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${getActionBadgeClass(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                      {log.entity}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={log.entityId}>
                      {log.entityId || 'N/A'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <User className="h-3 w-3 text-slate-400" />
                        <span className="font-medium text-slate-700">{log.userName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setInspectLog(log)}
                        className="inline-flex items-center space-x-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
                      >
                        <Eye className="h-3 w-3 text-slate-500" />
                        <span>Xem chi tiết</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Inspection Modal */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Chi tiết Bản ghi Kiểm toán ({inspectLog.id.slice(0, 8)})
                </h2>
              </div>
              <button
                onClick={() => setInspectLog(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Người thực hiện:
                  </span>
                  <div className="mt-0.5 font-medium text-slate-800">{inspectLog.userName}</div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Thời điểm:
                  </span>
                  <div className="mt-0.5 text-slate-700">
                    {new Date(inspectLog.createdAt).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Hành động:
                  </span>
                  <div className="mt-0.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${getActionBadgeClass(
                        inspectLog.action
                      )}`}
                    >
                      {inspectLog.action}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Đối tượng:
                  </span>
                  <div className="mt-0.5 font-mono text-slate-700">
                    {inspectLog.entity} ({inspectLog.entityId || 'N/A'})
                  </div>
                </div>
              </div>

              {/* Payload Data Inspection */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">
                  Nội dung Payload đã qua khử nhạy cảm (Sanitized Payload):
                </span>
                <pre className="max-h-60 overflow-y-auto rounded-lg bg-slate-900 p-3.5 font-mono text-[11px] text-blue-300 leading-relaxed">
                  {JSON.stringify(parseDetails(inspectLog.details), null, 2)}
                </pre>
              </div>

              {/* Security Protection Disclaimer */}
              <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-3 text-[11px] text-purple-900 flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-purple-600 flex-shrink-0" />
                <span>
                  Các trường nhạy cảm (mật khẩu, hash, token xác thực, JWT, API keys) đã được hệ thống tự động khử ẩn danh ([REDACTED]) trước khi hiển thị.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex justify-end">
              <button
                onClick={() => setInspectLog(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
