import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ArrowRight,
  Warehouse,
  PlusCircle,
  FileText,
  BarChart2,
  TrendingUp,
  Boxes,
  CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface SummaryData {
  kpis: {
    totalItems: number;
    totalOnHand: number;
    totalAvailable: number;
    totalReserved: number;
    totalBorrowed: number;
    totalQuarantined: number;
    totalKitAllocated: number;
    activeBorrows: number;
    pendingApprovalBorrows: number;
    lowStockCount: number;
  };
  distribution: Array<{ name: string; value: number; color?: string }>;
  monthlyTrends: Array<{
    month: string;
    imports: number;
    exports: number;
    borrows: number;
  }>;
}

const DISTRIBUTION_COLORS = ['#0284c7', '#6366f1', '#d97706', '#059669', '#e11d48'];

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryData | null>(null);

  const fetchSummary = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/reports/summary');
      if (res.data?.success && res.data.data) {
        const apiData = res.data.data;
        const distributionWithColors = (apiData.distribution || []).map(
          (d: any, idx: number) => ({
            ...d,
            color: DISTRIBUTION_COLORS[idx % DISTRIBUTION_COLORS.length],
          })
        );
        setData({
          ...apiData,
          distribution: distributionWithColors,
        });
      } else {
        setError('Dữ liệu phản hồi từ máy chủ không hợp lệ');
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể tải dữ liệu báo cáo tổng hợp. Vui lòng kiểm tra kết nối.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSummary();
    }
  }, [isAdmin]);

  // Non-ADMIN role view: Respect RBAC without swallowing 403
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Bảng điều khiển (Dashboard)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Hệ thống Quản lý Linh kiện & Thiết bị Phòng Lab ACM
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-amber-100/40 p-6 shadow-card">
          <div className="flex items-start space-x-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 flex-shrink-0 ring-1 ring-amber-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-900">
                Bảng điều khiển Báo cáo & Thống kê Chuyên sâu (ADMIN Only)
              </h2>
              <p className="mt-1 text-xs text-amber-800/90 leading-relaxed max-w-2xl">
                Theo chính sách phân quyền RBAC của hệ thống ACM, tính năng tổng hợp KPI thời gian thực,
                phân bố tồn kho và xu hướng lưu chuyển kho chỉ dành riêng cho tài khoản Quản trị viên (ADMIN).
                Bạn hiện đang đăng nhập với vai trò{' '}
                <span className="font-bold text-amber-950 underline px-1 py-0.5 rounded bg-amber-200/50">{user?.role || 'Khách'}</span>.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Link
                  to="/items"
                  className="inline-flex items-center space-x-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <Cpu className="h-3.5 w-3.5 text-blue-600" />
                  <span>Tra cứu Linh kiện & Thiết bị</span>
                </Link>
                <Link
                  to="/borrow-return"
                  className="inline-flex items-center space-x-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Phiếu Mượn & Trả</span>
                </Link>
                {user?.role !== 'STUDENT' && (
                  <Link
                    to="/inventory"
                    className="inline-flex items-center space-x-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <Warehouse className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Quản lý Tồn kho</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if monthly trends has real data
  const hasRealTrends =
    Boolean(data?.monthlyTrends && data.monthlyTrends.length > 0) &&
    data!.monthlyTrends.some((t) => t.imports > 0 || t.exports > 0 || t.borrows > 0);

  const isEmptySystem =
    data &&
    data.kpis.totalItems === 0 &&
    data.kpis.totalOnHand === 0 &&
    data.kpis.activeBorrows === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Bảng điều khiển Tổng quan (Dashboard)
          </h1>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Hệ thống giám sát tồn kho linh kiện, thiết bị phòng Lab & AI Robotic thời gian thực
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="inline-flex items-center space-x-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-card hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <Link
            to="/borrow-return"
            className="inline-flex items-center space-x-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Mượn & Trả</span>
          </Link>
        </div>
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-card">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-3 text-xs font-medium text-slate-600">
            Đang tải dữ liệu tổng hợp thời gian thực từ hệ thống...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-6 shadow-card">
          <div className="flex items-start space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 flex-shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-xs font-bold text-rose-900">
                Lỗi tải dữ liệu Bảng điều khiển
              </h2>
              <p className="mt-1 text-xs text-rose-700">{error}</p>
              <button
                onClick={fetchSummary}
                className="mt-3 inline-flex items-center space-x-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Thử lại</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && isEmptySystem && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-card">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Warehouse className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-sm font-bold text-slate-800">
            Chưa có dữ liệu vận hành trong hệ thống
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Hệ thống hiện chưa ghi nhận linh kiện, số dư tồn kho hoặc phiếu mượn nào. Hãy bắt đầu bằng cách
            tạo linh kiện hoặc nhập kho ban đầu.
          </p>
          <div className="mt-5 flex justify-center space-x-2">
            <Link
              to="/items"
              className="inline-flex items-center space-x-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Quản lý Linh kiện</span>
            </Link>
          </div>
        </div>
      )}

      {/* Main Content when Data Loaded */}
      {!loading && !error && data && !isEmptySystem && (
        <>
          {/* Primary KPI Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Tổng mặt hàng (Items)"
              value={data.kpis.totalItems}
              subtitle="Linh kiện & thiết bị đang quản lý"
              icon={Cpu}
              iconColor="bg-blue-50/80 text-blue-600 border border-blue-200/50"
            />
            <KpiCard
              title="Tồn khả dụng (Available)"
              value={data.kpis.totalAvailable}
              subtitle={`Tổng tồn kho vật lý On-Hand: ${data.kpis.totalOnHand}`}
              trend={
                data.kpis.totalOnHand > 0
                  ? `${Math.round((data.kpis.totalAvailable / data.kpis.totalOnHand) * 100)}% on-hand`
                  : undefined
              }
              trendPositive={true}
              icon={Layers}
              iconColor="bg-emerald-50/80 text-emerald-600 border border-emerald-200/50"
            />
            <KpiCard
              title="Phiếu mượn đang xử lý"
              value={data.kpis.activeBorrows}
              subtitle={`${data.kpis.pendingApprovalBorrows} phiếu chờ phê duyệt`}
              icon={ClipboardList}
              iconColor="bg-indigo-50/80 text-indigo-600 border border-indigo-200/50"
            />
            <KpiCard
              title="Cảnh báo tồn kho tối thiểu"
              value={data.kpis.lowStockCount}
              subtitle={
                data.kpis.lowStockCount > 0
                  ? `${data.kpis.lowStockCount} mặt hàng dưới mức an toàn`
                  : 'Tất cả mặt hàng đạt mức an toàn'
              }
              trend={data.kpis.lowStockCount > 0 ? 'Cần bổ sung' : 'An toàn'}
              trendPositive={data.kpis.lowStockCount === 0}
              icon={AlertTriangle}
              iconColor={
                data.kpis.lowStockCount > 0
                  ? 'bg-rose-50/80 text-rose-600 border border-rose-200/50'
                  : 'bg-amber-50/80 text-amber-600 border border-amber-200/50'
              }
            />
          </div>

          {/* Charts & Invariant Principle Section */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Inventory Breakdown Donut Chart */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-1 flex flex-col justify-between">
              <div>
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Phân bố Trạng thái Tồn kho
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tuân thủ công thức tồn kho bất biến ACM
                  </p>
                </div>
                <div className="mt-4 h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {data.distribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color || DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          fontSize: '11px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-blue-50/70 p-3 text-[11px] text-blue-950 leading-relaxed border border-blue-200/60 shadow-xs">
                <strong>Nguyên tắc bất biến:</strong> Available ({data.kpis.totalAvailable}) = OnHand ({data.kpis.totalOnHand}) - Reserved ({data.kpis.totalReserved}) - Quarantined ({data.kpis.totalQuarantined}) - KitAllocated ({data.kpis.totalKitAllocated}). Lượng Borrowed ({data.kpis.totalBorrowed}) đang lưu hành ngoài phòng Lab không bị trừ hai lần.
              </div>
            </div>

            {/* Monthly Activity Section */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Lưu chuyển Kho theo Tháng
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Biến động Nhập kho - Xuất kho - Phiếu mượn thực tế
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/60">
                    6 tháng gần nhất
                  </span>
                </div>

                {hasRealTrends ? (
                  <div className="mt-4 h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.monthlyTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            fontSize: '11px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Bar dataKey="imports" name="Nhập kho" fill="#0284c7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="borrows" name="Lượt mượn" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="exports" name="Xuất tiêu hao" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                      <BarChart2 className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">
                      Chưa có đủ dữ liệu lịch sử lưu chuyển kho
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 max-w-sm leading-relaxed">
                      Biểu đồ xu hướng sẽ tự động kích hoạt khi hệ thống phát sinh các giao dịch nhập kho, xuất kho hoặc bàn giao mượn trả thực tế.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Hub */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Điều hướng Phân hệ Quản trị</h2>
              <p className="text-xs text-slate-500">Truy cập nhanh các chức năng cốt lõi của phòng Lab</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/inventory"
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs group"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 group-hover:scale-105 transition-transform">
                    <Warehouse className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Quản lý Tồn kho</div>
                    <div className="text-[11px] text-slate-400">Xem theo vị trí & SKU</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                to="/transactions"
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs group"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60 group-hover:scale-105 transition-transform">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Giao dịch Kho</div>
                    <div className="text-[11px] text-slate-400">Lịch sử Nhập / Xuất / Chuyển</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                to="/borrow-return"
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs group"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 group-hover:scale-105 transition-transform">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Mượn & Trả</div>
                    <div className="text-[11px] text-slate-400">Phê duyệt & Hoàn trả</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                to="/audit-logs"
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs group"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200/60 group-hover:scale-105 transition-transform">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Nhật ký Kiểm toán</div>
                    <div className="text-[11px] text-slate-400">Truy vết thao tác an toàn</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
