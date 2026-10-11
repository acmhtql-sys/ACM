import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Server, Shield, Database, Save, CheckCircle2 } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { apiClient } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [apiHealth, setApiHealth] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await apiClient.get('/health');
        setApiHealth(res.data);
      } catch (err: any) {
        setApiHealth({ status: 'offline', error: err.message });
      } finally {
        setChecking(false);
      }
    }
    checkHealth();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Cài đặt Hệ thống (Settings & System Info)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Cấu hình môi trường phòng Lab, tham số kho và trạng thái kết nối
          </p>
        </div>
      </div>

      <DemoDataNotice moduleName="System Settings" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* API & Backend Status Card */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
            <Server className="h-4 w-4 text-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Trạng thái API Backend
            </h3>
          </div>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Service:</span>
              <span className="font-semibold text-slate-800">
                {apiHealth?.service || 'ACM API (Phase 1)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Trạng thái:</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-bold text-[10px] ${
                  apiHealth?.status === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {apiHealth?.status === 'ok' ? 'HEALTHY (OK)' : 'STANDALONE / LOCAL'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cơ sở dữ liệu (PostgreSQL):</span>
              <span className="font-mono text-[11px] text-slate-700">
                {apiHealth?.database || 'Local Port 5432'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Endpoint Prefix:</span>
              <span className="font-mono text-[11px] text-blue-600">/api/v1</span>
            </div>
          </div>
        </div>

        {/* General Lab Settings */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
            <Database className="h-4 w-4 text-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Thông tin Cơ sở & Phòng Lab Quản lý
            </h3>
          </div>
          <div className="mt-4 space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700">Tên cơ sở / Trung tâm đào tạo</label>
              <input
                type="text"
                defaultValue="Trung tâm AI & Robotics Lab - Đại học Công nghệ"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Mã kho mặc định</label>
                <input
                  type="text"
                  defaultValue="WH-MAIN"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Thời hạn mượn tối đa</label>
                <input
                  type="text"
                  defaultValue="14 ngày (2 tuần)"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Chính sách kiểm soát số lượng</label>
              <p className="mt-1 text-slate-500 leading-relaxed">
                Tự động khóa duyệt phiếu nếu số lượng yêu cầu vượt quá tồn khả dụng (Available).
                Bắt buộc ghi nhận vết kiểm toán (AuditLog) đối với mọi thao tác duyệt, bàn giao, nhận trả và điều chỉnh kho.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Lưu cấu hình (Demo)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
