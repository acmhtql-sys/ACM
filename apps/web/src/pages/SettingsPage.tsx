import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Shield,
  Info,
  CheckCircle2,
  AlertCircle,
  Building2,
  Warehouse,
  Clock,
  FileCheck,
} from 'lucide-react';
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
      {/* Page Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Thông tin Hệ thống & Phòng Lab (System & Lab Info)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Tra cứu trạng thái hạ tầng dịch vụ, kết nối cơ sở dữ liệu và các quy chuẩn vận hành phòng Lab ACM (Chế độ Chỉ đọc)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card 1: Infrastructure & API Status */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5.5 shadow-card">
          <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60">
              <Server className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Trạng thái Hạ tầng & Dịch vụ
            </h3>
          </div>
          <div className="mt-4 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">API Gateway:</span>
              <span className="font-semibold text-slate-800">
                {apiHealth?.service || 'ACM API Gateway'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Trạng thái kết nối:</span>
              <span
                className={`inline-flex items-center space-x-1.5 rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  apiHealth?.status === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                    : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                }`}
              >
                {apiHealth?.status === 'ok' ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    <span>HOẠT ĐỘNG (HEALTHY)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                    <span>KHÔNG KHẢ DỤNG</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cơ sở dữ liệu (PostgreSQL):</span>
              <span className="font-mono text-[11px] text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/50">
                {apiHealth?.database === 'connected' ? 'Đã kết nối (Healthy)' : (apiHealth?.database || 'UAT Database')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Dịch vụ AI Vision (FastAPI):</span>
              <span className="font-mono text-[11px] text-brand-700 font-semibold bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200/50">Port 5055 (Active)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">API Prefix:</span>
              <span className="font-mono text-[11px] text-slate-600">/api/v1</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Môi trường triển khai:</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                Isolated UAT & Demo
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Standard Lab Operational Parameters (Read-Only) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5.5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60">
                <Building2 className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Quy chuẩn Vận hành Phòng Lab (Chế độ Chỉ đọc)
              </h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              Read-Only Reference
            </span>
          </div>

          <div className="mt-4 space-y-4 text-xs">
            <div className="rounded-xl bg-brand-50/40 p-3.5 border border-brand-200/60 shadow-xs">
              <div className="flex items-start space-x-2.5">
                <Info className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                <div className="space-y-1 text-slate-600">
                  <p className="font-semibold text-slate-800">
                    Chính sách cấu hình hệ thống:
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Các tham số dưới đây là quy chuẩn vận hành chuẩn của phòng Lab ACM. Các thông số này được đồng bộ và kiểm soát theo chính sách cơ sở. Để thay đổi quy chuẩn, Quản trị viên (ADMIN) thực hiện qua quy trình cấu hình tập trung.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 shadow-xs">
                <div className="flex items-center space-x-2 text-slate-500 mb-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">Cơ sở / Đơn vị quản lý:</span>
                </div>
                <p className="font-medium text-slate-900 pl-5.5">
                  Trung tâm AI & Robotics Lab - Đại học Công nghệ
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 shadow-xs">
                <div className="flex items-center space-x-2 text-slate-500 mb-1">
                  <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">Mã kho trung tâm mặc định:</span>
                </div>
                <p className="font-mono font-medium text-slate-900 pl-5.5">
                  WH-UAT-MAIN (Kho Nghiệm thu UAT)
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 shadow-xs">
                <div className="flex items-center space-x-2 text-slate-500 mb-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">Thời hạn mượn tiêu chuẩn:</span>
                </div>
                <p className="font-medium text-slate-900 pl-5.5">
                  14 ngày (2 tuần, gia hạn tối đa 1 lần)
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 shadow-xs">
                <div className="flex items-center space-x-2 text-slate-500 mb-1">
                  <FileCheck className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">Quy tắc kiểm soát số lượng:</span>
                </div>
                <p className="font-medium text-slate-900 pl-5.5 text-[11px] leading-relaxed">
                  Khóa duyệt tự động khi tồn khả dụng (Available) không đủ
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 shadow-xs">
              <div className="flex items-center space-x-2 text-slate-500 mb-1">
                <Shield className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700">Chính sách Truy vết Kiểm toán (Audit Trail):</span>
              </div>
              <p className="text-[11px] text-slate-600 pl-5.5 leading-relaxed">
                Bắt buộc ghi nhận vết kiểm toán (AuditLog) đối với 100% thao tác xuất, nhập, phê duyệt, bàn giao, nhận hoàn trả và xóa hộp kit. Không cho phép xóa hoặc sửa đổi lịch sử kiểm toán.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
