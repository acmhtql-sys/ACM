import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, Plus, Search } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { apiClient } from '../services/api';

export const StockTransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const res = await apiClient.get('/stock-transactions');
        if (res.data?.success) {
          setTransactions(res.data.data);
        }
      } catch (err) {
        // Fallback
      }
    }
    fetchTransactions();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Giao dịch Kho (Stock Transactions)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Lịch sử các phiếu nhập kho, xuất kho và điều chỉnh kiểm kê
          </p>
        </div>
        <button className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" />
          <span>Tạo phiếu nhập / xuất kho</span>
        </button>
      </div>

      <DemoDataNotice moduleName="Stock Transactions" />

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Mã giao dịch</th>
                <th className="py-3 px-4">Loại giao dịch</th>
                <th className="py-3 px-4">Người tạo</th>
                <th className="py-3 px-4">Ghi chú nghiệp vụ</th>
                <th className="py-3 px-4 text-center">Số dòng mặt hàng</th>
                <th className="py-3 px-4 text-right">Tổng số lượng</th>
                <th className="py-3 px-4">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                    {tx.transactionNumber}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 font-semibold text-[11px] ${
                        tx.type === 'IMPORT'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : tx.type === 'EXPORT'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{tx.creatorName}</td>
                  <td className="py-3 px-4 text-slate-500">{tx.notes}</td>
                  <td className="py-3 px-4 text-center font-mono">{tx.itemCount}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                    {tx.totalQuantity}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {new Date(tx.createdAt).toLocaleDateString('vi-VN')}
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
