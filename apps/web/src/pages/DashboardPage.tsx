import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  ClipboardList,
  AlertTriangle,
  ArrowUpRight,
  PlusCircle,
  Search,
  Warehouse,
  CheckCircle2,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { StatusBadge } from '../components/StatusBadge';
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

export const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({
    kpis: {
      totalItems: 7,
      totalOnHand: 570,
      totalAvailable: 438,
      activeBorrows: 3,
      pendingApprovalBorrows: 1,
      lowStockCount: 0,
    },
    distribution: [
      { name: 'Khả dụng (Available)', value: 438, color: '#3b82f6' },
      { name: 'Đang mượn (Borrowed)', value: 67, color: '#6366f1' },
      { name: 'Giữ chỗ (Reserved)', value: 28, color: '#f59e0b' },
      { name: 'Gán Kit (KitAllocated)', value: 32, color: '#10b981' },
      { name: 'Cách ly lỗi (Quarantined)', value: 5, color: '#ef4444' },
    ],
    monthlyTrends: [
      { month: 'T5', imports: 45, exports: 20, borrows: 15 },
      { month: 'T6', imports: 60, exports: 30, borrows: 25 },
      { month: 'T7', imports: 35, exports: 18, borrows: 20 },
      { month: 'T8', imports: 80, exports: 40, borrows: 35 },
      { month: 'T9', imports: 95, exports: 50, borrows: 48 },
      { month: 'T10', imports: 110, exports: 65, borrows: 52 },
    ],
  });

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await apiClient.get('/reports/summary');
        if (res.data?.success && res.data.data) {
          const apiData = res.data.data;
          const colors = ['#3b82f6', '#6366f1', '#f59e0b', '#10b981', '#ef4444'];
          const distributionWithColors = apiData.distribution.map((d: any, idx: number) => ({
            ...d,
            color: colors[idx % colors.length],
          }));
          setData({
            ...apiData,
            distribution: distributionWithColors,
          });
        }
      } catch (err) {
        // Fallback remains active
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Bảng điều khiển Tổng quan (Dashboard)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Hệ thống giám sát tồn kho linh kiện, thiết bị phòng Lab & AI Robotic
          </p>
        </div>
        <div className="flex space-x-2">
          <button className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Warehouse className="h-3.5 w-3.5 text-slate-500" />
            <span>Kiểm kê nhanh</span>
          </button>
          <button className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700">
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Tạo phiếu mượn</span>
          </button>
        </div>
      </div>

      <DemoDataNotice moduleName="Dashboard & KPI Metrics" />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Tổng mặt hàng (Items)"
          value={data.kpis.totalItems}
          subtitle="7 linh kiện cốt lõi đã nạp seed"
          trend="+2 loại mới"
          trendPositive={true}
          icon={Cpu}
          iconColor="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Tồn khả dụng (Available)"
          value={data.kpis.totalAvailable}
          subtitle="Sẵn sàng xuất mượn / bàn giao"
          trend="82% tổng kho"
          trendPositive={true}
          icon={Layers}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Phiếu mượn đang xử lý"
          value={data.kpis.activeBorrows}
          subtitle={`${data.kpis.pendingApprovalBorrows} phiếu chờ phê duyệt`}
          trend="Đang lưu hành"
          trendPositive={true}
          icon={ClipboardList}
          iconColor="bg-indigo-50 text-indigo-600"
        />
        <KpiCard
          title="Cảnh báo tồn kho tối thiểu"
          value={data.kpis.lowStockCount}
          subtitle="Không có linh kiện dưới ngưỡng"
          trend="An toàn"
          trendPositive={true}
          icon={AlertTriangle}
          iconColor="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Inventory Breakdown Donut Chart */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Phân bố Trạng thái Tồn kho
              </h3>
              <p className="text-[11px] text-slate-400">Tuân thủ công thức tồn kho bất biến ACM</p>
            </div>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {data.distribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 rounded-lg bg-blue-50/60 p-2.5 text-[11px] text-blue-900 leading-relaxed border border-blue-100">
            <strong>Nguyên tắc:</strong> Available = OnHand ({data.kpis.totalOnHand}) - Reserved - Quarantined - KitAllocated.
            Borrowed đang lưu hành ngoài kho không bị trừ hai lần.
          </div>
        </div>

        {/* Monthly Activity Bar Chart */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Lưu chuyển Kho theo Tháng (Xuất - Nhập - Mượn)
              </h3>
              <p className="text-[11px] text-slate-400">Số lượng biến động trong 6 tháng gần nhất</p>
            </div>
            <span className="text-[11px] font-medium text-slate-500">2026 Q3 - Q4</span>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="imports" name="Nhập kho" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="borrows" name="Mượn ra ngoài" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exports" name="Xuất tiêu hao" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Activity Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Hoạt động Kho & Phiếu mượn gần nhất</h3>
            <p className="text-xs text-slate-500">Nhật ký xử lý linh kiện phòng Lab</p>
          </div>
          <button className="text-xs font-semibold text-blue-600 hover:text-blue-700">Xem tất cả</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Mã tham chiếu</th>
                <th className="py-3 px-4">Loại sự kiện</th>
                <th className="py-3 px-4">Người thực hiện</th>
                <th className="py-3 px-4">Linh kiện / Nội dung</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-mono font-medium text-blue-600">BR-20261010-001</td>
                <td className="py-3 px-4 font-medium">Phiếu mượn</td>
                <td className="py-3 px-4">Nguyen Van A (Student)</td>
                <td className="py-3 px-4">Arduino Uno, ESP32, Servo SG90</td>
                <td className="py-3 px-4">
                  <StatusBadge status="APPROVED" variant="borrow" />
                </td>
                <td className="py-3 px-4 text-slate-400">Vừa xong</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-mono font-medium text-blue-600">TX-20261010-0001</td>
                <td className="py-3 px-4 font-medium">Nhập kho</td>
                <td className="py-3 px-4">Lab Manager</td>
                <td className="py-3 px-4">ESP32 DevKit V1 (+20 cái)</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center text-emerald-600 font-medium">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Hoàn thành
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400">1 giờ trước</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-mono font-medium text-blue-600">BR-20261008-002</td>
                <td className="py-3 px-4 font-medium">Bàn giao linh kiện</td>
                <td className="py-3 px-4">Tran Thi B (Student)</td>
                <td className="py-3 px-4">DHT22, Cảm biến siêu âm HC-SR04</td>
                <td className="py-3 px-4">
                  <StatusBadge status="HANDED_OVER" variant="borrow" />
                </td>
                <td className="py-3 px-4 text-slate-400">2 ngày trước</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
