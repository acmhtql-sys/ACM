import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus, Check, ArrowRight, CornerDownLeft, Clock } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { StatusBadge } from '../components/StatusBadge';
import { apiClient } from '../services/api';

export const BorrowReturnPage: React.FC = () => {
  const [borrows, setBorrows] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('ALL');

  useEffect(() => {
    async function fetchBorrows() {
      try {
        const res = await apiClient.get('/borrow-requests');
        if (res.data?.success) {
          setBorrows(res.data.data);
        }
      } catch (err) {
        // Fallback
      }
    }
    fetchBorrows();
  }, []);

  const filtered = borrows.filter((b) => {
    if (activeTab === 'ALL') return true;
    return b.status === activeTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Quản lý Mượn & Trả (Borrow & Return)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Quy trình đăng ký, duyệt giữ chỗ (Reserved), bàn giao và nhận trả linh kiện
          </p>
        </div>
        <button className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" />
          <span>Tạo phiếu mượn mới</span>
        </button>
      </div>

      <DemoDataNotice moduleName="Borrow & Return Management" />

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200">
        {[
          { key: 'ALL', label: 'Tất cả phiếu mượn' },
          { key: 'PENDING', label: 'Chờ duyệt (Pending)' },
          { key: 'APPROVED', label: 'Đã duyệt (Approved)' },
          { key: 'HANDED_OVER', label: 'Đang mượn (Handed Over)' },
          { key: 'RETURNED', label: 'Đã hoàn trả (Returned)' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Mã phiếu</th>
                <th className="py-3 px-4">Người mượn</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Mục đích mượn</th>
                <th className="py-3 px-4">Ngày hẹn mượn - trả</th>
                <th className="py-3 px-4 text-center">Số loại linh kiện</th>
                <th className="py-3 px-4 text-center">Thao tác xử lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                    {b.requestNumber}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{b.borrowerName}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={b.status} variant="borrow" />
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={b.purpose}>
                    {b.purpose}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {b.expectedBorrowDate} &rarr; {b.expectedReturnDate}
                  </td>
                  <td className="py-3 px-4 text-center font-mono">{b.itemCount}</td>
                  <td className="py-3 px-4 text-center">
                    {b.status === 'PENDING' && (
                      <button className="inline-flex items-center space-x-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">
                        <Check className="h-3 w-3" />
                        <span>Phê duyệt</span>
                      </button>
                    )}
                    {b.status === 'APPROVED' && (
                      <button className="inline-flex items-center space-x-1 rounded bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">
                        <ArrowRight className="h-3 w-3" />
                        <span>Bàn giao kho</span>
                      </button>
                    )}
                    {b.status === 'HANDED_OVER' && (
                      <button className="inline-flex items-center space-x-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                        <CornerDownLeft className="h-3 w-3" />
                        <span>Nhận hoàn trả</span>
                      </button>
                    )}
                    {b.status === 'RETURNED' && (
                      <span className="text-[11px] text-slate-400 font-medium">Đã tất toán</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
