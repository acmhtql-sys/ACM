import React from 'react';
import {
  Boxes,
  CheckCircle2,
  BookmarkCheck,
  ShieldAlert,
  Cpu,
  Layers,
  AlertTriangle,
  FolderTree,
  PackageMinus,
} from 'lucide-react';
import { InventorySummaryResponse } from '@acm/shared';

interface InventoryKpiCardsProps {
  summary: InventorySummaryResponse;
}

export const InventoryKpiCards: React.FC<InventoryKpiCardsProps> = ({ summary }) => {
  const formatNum = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return val.toLocaleString('vi-VN');
  };

  const kpis = [
    {
      title: 'TỔNG TỒN VẬT LÝ (ON-HAND)',
      value: formatNum(summary.totalOnHand),
      unit: 'cái',
      subtitle: 'Linh kiện thực tế đang nằm trong kho Lab',
      icon: Boxes,
      iconColor: 'bg-blue-50 text-blue-600',
      badgeColor: 'border-blue-200 bg-blue-50/50',
    },
    {
      title: 'TỒN KHẢ DỤNG (AVAILABLE)',
      value: formatNum(summary.totalAvailable),
      unit: 'cái',
      subtitle: 'Sẵn sàng cấp phát hoặc bàn giao mượn',
      icon: CheckCircle2,
      iconColor: 'bg-emerald-50 text-emerald-600',
      badgeColor: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
      highlight: true,
    },
    {
      title: 'ĐANG GIỮ CHỖ (RESERVED)',
      value: formatNum(summary.totalReserved),
      unit: 'cái',
      subtitle: 'Đã cam kết cho các phiếu mượn được duyệt',
      icon: BookmarkCheck,
      iconColor: 'bg-amber-50 text-amber-600',
      badgeColor: 'border-amber-200 bg-amber-50/50',
    },
    {
      title: 'CÁCH LY / CHỜ XỬ LÝ (QUARANTINED)',
      value: formatNum(summary.totalQuarantined),
      unit: 'cái',
      subtitle: 'Hỏng hóc hoặc chờ kiểm tra chất lượng',
      icon: ShieldAlert,
      iconColor: 'bg-rose-50 text-rose-600',
      badgeColor: 'border-rose-200 bg-rose-50/50',
    },
    {
      title: 'GÁN KIT THỰC HÀNH (KIT-ALLOCATED)',
      value: formatNum(summary.totalKitAllocated),
      unit: 'cái',
      subtitle: 'Đang lắp ráp cố định trong các hộp Kit',
      icon: Cpu,
      iconColor: 'bg-indigo-50 text-indigo-600',
      badgeColor: 'border-indigo-200 bg-indigo-50/50',
    },
    {
      title: 'ĐANG MƯỢN NGOÀI (BORROWED)',
      value: formatNum(summary.totalBorrowed),
      unit: 'cái',
      subtitle: 'Đã bàn giao cho sinh viên/giảng viên',
      icon: PackageMinus,
      iconColor: 'bg-slate-100 text-slate-700',
      badgeColor: 'border-slate-200 bg-slate-50',
    },
    {
      title: 'CẢNH BÁO TỒN THẤP (LOW STOCK)',
      value: formatNum(summary.lowStockItemCount),
      unit: 'mặt hàng',
      subtitle: 'Khả dụng thấp hơn mức tối thiểu cảnh báo',
      icon: AlertTriangle,
      iconColor: summary.lowStockItemCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
      badgeColor: summary.lowStockItemCount > 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50',
      alert: summary.lowStockItemCount > 0,
    },
    {
      title: 'MẶT HÀNG HOẠT ĐỘNG (ITEMS)',
      value: formatNum(summary.totalItems),
      unit: 'mặt hàng',
      subtitle: 'Tổng số linh kiện & thiết bị đang quản lý',
      icon: Layers,
      iconColor: 'bg-cyan-50 text-cyan-600',
      badgeColor: 'border-cyan-200 bg-cyan-50/50',
    },
    {
      title: 'VỊ TRÍ LƯU TRỮ (LOCATIONS)',
      value: formatNum(summary.totalLocations),
      unit: 'vị trí',
      subtitle: 'Tổng số kho, kệ và khay lưu trữ',
      icon: FolderTree,
      iconColor: 'bg-purple-50 text-purple-600',
      badgeColor: 'border-purple-200 bg-purple-50/50',
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-2xl border p-5 shadow-card transition-all duration-200 hover:shadow-md ${
                kpi.highlight
                  ? 'border-emerald-200/90 bg-emerald-50/20'
                  : kpi.alert
                  ? 'border-amber-200/90 bg-amber-50/20'
                  : 'border-slate-200/80 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {kpi.title}
                </span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/50 ${kpi.iconColor}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span
                  className={`font-mono text-2xl font-bold tracking-tight ${
                    kpi.highlight
                      ? 'text-emerald-700'
                      : kpi.alert
                      ? 'text-amber-700'
                      : 'text-slate-900'
                  }`}
                >
                  {kpi.value}
                </span>
                <span className="text-xs font-semibold text-slate-400">{kpi.unit}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{kpi.subtitle}</p>
            </div>
          );
        })}
      </div>

      {/* Domain Invariant Rule Banner */}
      <div className="rounded-2xl border border-brand-200/80 bg-brand-50/40 p-4.5 text-xs text-brand-950 shadow-card">
        <div className="flex items-start space-x-3">
          <div className="h-8 w-8 rounded-xl bg-brand-100/70 border border-brand-200/60 flex items-center justify-center text-brand-700 shrink-0">
            <CheckCircle2 className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-1">
            <div className="font-bold uppercase tracking-wider text-brand-900 text-[11px]">
              Công thức Bất biến Tồn kho Khả dụng (ACM Stock Invariant):
            </div>
            <div className="inline-block rounded-lg border border-brand-200/80 bg-white px-3 py-1 font-mono text-xs font-bold text-brand-800 shadow-xs">
              Available = OnHand - Reserved - Quarantined - KitAllocated
            </div>
            <p className="pt-1 text-[11px] text-slate-600 leading-relaxed">
              <strong className="text-slate-800">Ghi chú nghiệp vụ:</strong> <code>OnHand</code> là số lượng linh kiện thực tế đang nằm tại kho.
              Khi bàn giao cho người mượn, <code>OnHand</code> đã được trừ và <code>Borrowed</code> được tăng.
              Vì vậy, <code>Borrowed</code> <em>không bị trừ lần thứ hai</em> khi tính <code>Available</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
