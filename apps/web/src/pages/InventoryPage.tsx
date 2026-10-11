import React, { useState, useEffect } from 'react';
import { Warehouse, Calculator, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { apiClient } from '../services/api';
import { calculateAvailableStock } from '@acm/shared';

export const InventoryPage: React.FC = () => {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive Calculator state
  const [calcOnHand, setCalcOnHand] = useState(100);
  const [calcReserved, setCalcReserved] = useState(15);
  const [calcQuarantined, setCalcQuarantined] = useState(5);
  const [calcKitAllocated, setCalcKitAllocated] = useState(10);
  const [calcBorrowed, setCalcBorrowed] = useState(25);
  const [calcResult, setCalcResult] = useState<number | null>(70);
  const [calcError, setCalcError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInventory() {
      try {
        const res = await apiClient.get('/inventory/balance');
        if (res.data?.success) {
          setBalances(res.data.data);
        }
      } catch (err) {
        // Fallback
      } finally {
        setLoading(false);
      }
    }
    fetchInventory();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Kho & Số dư Tồn kho (Inventory & Location)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Giám sát trạng thái tồn kho vật lý, đặt chỗ, gán kit và hàng đang lưu hành mượn
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          <span>Làm mới số dư</span>
        </button>
      </div>

      <DemoDataNotice moduleName="Inventory & Location Balance" />

      {/* Formula Explanation Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950 shadow-sm">
        <div className="flex items-start space-x-3">
          <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold uppercase tracking-wider text-blue-900">
              Nguyên tắc Bất biến Tồn kho ACM:
            </div>
            <div className="font-mono text-xs font-semibold text-blue-800 bg-white/80 px-2 py-1 rounded inline-block">
              Available = On-hand - Reserved - Quarantined - KitAllocated
            </div>
            <p className="text-blue-900/90 leading-relaxed pt-1">
              <strong>Lưu ý nghiệp vụ:</strong> <code>OnHand</code> là số lượng linh kiện thực tế đang nằm trong kho.
              Khi bàn giao cho người mượn, <code>OnHand</code> đã được trừ và <code>Borrowed</code> được tăng.
              Vì vậy <code>Borrowed</code> <em>không được trừ hai lần</em> khỏi <code>OnHand</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Stock Invariant Calculator Sandbox */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Calculator className="h-4 w-4 text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Công cụ Kiểm tra Công thức Tồn kho Khả dụng (Interactive Validator)
          </h3>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">On-hand (Kho)</label>
            <input
              type="number"
              value={calcOnHand}
              onChange={(e) => setCalcOnHand(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">Reserved (Giữ chỗ)</label>
            <input
              type="number"
              value={calcReserved}
              onChange={(e) => setCalcReserved(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-amber-700"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">Quarantined (Lỗi)</label>
            <input
              type="number"
              value={calcQuarantined}
              onChange={(e) => setCalcQuarantined(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-rose-700"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">KitAllocated (Kit)</label>
            <input
              type="number"
              value={calcKitAllocated}
              onChange={(e) => setCalcKitAllocated(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-indigo-700"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">Borrowed (Ngoài kho)</label>
            <input
              type="number"
              value={calcBorrowed}
              onChange={(e) => setCalcBorrowed(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-600"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            onClick={runCalculation}
            className="w-full sm:w-auto rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
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
                  (Đã mượn ngoài: {calcBorrowed} cái)
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Balances Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Linh kiện (Item)</th>
                <th className="py-3 px-4">Vị trí lưu trữ</th>
                <th className="py-3 px-4 text-right">On-hand (Kho)</th>
                <th className="py-3 px-4 text-right">Reserved (Giữ chỗ)</th>
                <th className="py-3 px-4 text-right">Quarantined (Lỗi)</th>
                <th className="py-3 px-4 text-right">KitAllocated (Kit)</th>
                <th className="py-3 px-4 text-right text-indigo-700">Borrowed (Ngoài kho)</th>
                <th className="py-3 px-4 text-right text-emerald-700 font-bold bg-emerald-50/50">
                  Available (Khả dụng)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {balances.map((b, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{b.itemName}</div>
                    <div className="font-mono text-[10px] text-blue-600">{b.itemCode}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800">{b.locationName}</div>
                    <div className="font-mono text-[10px] text-slate-400">{b.locationCode}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                    {b.onHand}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-600">{b.reserved}</td>
                  <td className="py-3 px-4 text-right font-mono text-rose-600">{b.quarantined}</td>
                  <td className="py-3 px-4 text-right font-mono text-indigo-600">{b.kitAllocated}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600 bg-slate-50/40">
                    {b.borrowed}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700 bg-emerald-50/30">
                    {b.available}
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
