import React from 'react';
import { BarChart3, Download, TrendingUp, Calendar, FileSpreadsheet } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';

export const ReportsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Báo cáo & Thống kê (Reports & Analytics)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Tổng hợp dữ liệu tồn kho, tần suất sử dụng thiết bị và tỉ lệ hoàn trả
          </p>
        </div>
        <button className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Xuất báo cáo Excel (Demo)</span>
        </button>
      </div>

      <DemoDataNotice moduleName="Reports & Analytics" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center space-x-2 text-blue-600">
            <FileSpreadsheet className="h-5 w-5" />
            <h3 className="font-bold text-sm text-slate-900">Báo cáo Kiểm kê Tồn kho</h3>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Chi tiết On-hand, Reserved, Quarantined, KitAllocated và Available theo từng vị trí kệ/ngăn.
          </p>
          <button className="mt-4 text-xs font-semibold text-blue-600 hover:text-blue-700">
            Tải mẫu kiểm kê &rarr;
          </button>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center space-x-2 text-emerald-600">
            <TrendingUp className="h-5 w-5" />
            <h3 className="font-bold text-sm text-slate-900">Báo cáo Tần suất Mượn - Trả</h3>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Xác định các linh kiện hot như Arduino Uno, ESP32, Servo được sinh viên mượn nhiều nhất.
          </p>
          <button className="mt-4 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
            Xem phân tích chi tiết &rarr;
          </button>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Calendar className="h-5 w-5" />
            <h3 className="font-bold text-sm text-slate-900">Nhật ký Biến động Tháng</h3>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Thống kê tổng lượng linh kiện tiêu hao (LED, điện trở) đã xuất trong kỳ học hiện tại.
          </p>
          <button className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
            Xem bảng tổng hợp &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
