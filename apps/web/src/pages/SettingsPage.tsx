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
  RefreshCw,
  Cpu,
  Lock,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [apiHealth, setApiHealth] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const res = await apiClient.get('/health');
      setApiHealth(res.data);
    } catch (err: any) {
      setApiHealth({ status: 'offline', error: err.message });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const isHealthy = apiHealth?.status === 'ok';
  const isDbConnected = apiHealth?.database === 'connected';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Thông tin Hệ thống & Phòng Lab (System & Lab Info)
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/70">
              v1.2.0-PROD
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Tra cứu trạng thái hạ tầng dịch vụ, kết nối cơ sở dữ liệu và các quy chuẩn vận hành phòng Lab ACM (Chế độ Chỉ đọc)
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={checkHealth}
            disabled={checking}
            title="Kiểm tra lại kết nối"
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-soft hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${checking ? 'animate-spin text-blue-600' : ''}`} />
            <span>Làm mới trạng thái</span>
          </button>
        </div>
      </div>

      {/* Section 1: Live Cloud Infrastructure Cards */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-2">
            <Server className="h-4 w-4 text-blue-600" />
            <span>Trạng thái Hạ tầng & Dịch vụ Đám mây (Cloud Infrastructure)</span>
          </h2>
          <span className="text-[11px] font-medium text-slate-400">
            Giám sát thời gian thực
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: API Gateway */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-card hover:border-blue-200 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Server className="h-4.5 w-4.5" />
              </div>
              <span
                className={`inline-flex items-center space-x-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isHealthy
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                    : 'bg-amber-50 text-amber-700 border border-amber-200/70'
                }`}
              >
                {isHealthy ? (
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
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              API Gateway
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1 truncate">
              {apiHealth?.service || 'ACM API Gateway'}
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Prefix: /api/v1</span>
              <span className="text-emerald-600 font-sans font-semibold">Online</span>
            </div>
          </div>

          {/* Card 2: Database */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-card hover:border-emerald-200 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <Database className="h-4.5 w-4.5" />
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                PostgreSQL
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              Cơ sở dữ liệu (PostgreSQL)
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1 truncate">
              {isDbConnected ? 'Đã kết nối (Healthy)' : (apiHealth?.database || 'UAT Database')}
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="truncate">Supabase AWS (Singapore)</span>
              <span className="text-emerald-600 font-semibold font-mono text-[10px]">SSL</span>
            </div>
          </div>

          {/* Card 3: AI Vision Service */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-card hover:border-purple-200 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                <Cpu className="h-4.5 w-4.5" />
              </div>
              <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200/70 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                FastAPI YOLO
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              Dịch vụ AI Vision (FastAPI)
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1 font-mono">
              Port 5055 (Active)
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Hỗ trợ nhận diện tự động</span>
              <span className="text-purple-600 font-semibold">Active</span>
            </div>
          </div>

          {/* Card 4: Security & Environment */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-card hover:border-indigo-200 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Shield className="h-4.5 w-4.5" />
              </div>
              <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                Bảo vệ an toàn
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              Môi trường triển khai
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1">
              Isolated UAT & Demo
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Chính sách kiểm toán</span>
              <span className="text-indigo-600 font-semibold">Bất biến</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Standard Lab Operational Parameters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200/70 shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Quy chuẩn Vận hành Phòng Lab (Chế độ Chỉ đọc)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Các quy tắc kiểm soát kho và cấp phát trang thiết bị được chuẩn hóa toàn hệ thống
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 border border-slate-200/80">
            Read-Only Reference
          </span>
        </div>

        {/* Policy Description Callout */}
        <div className="rounded-xl bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50/60 p-4 border border-blue-100 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700 shrink-0 mt-0.5">
              <Info className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-1 text-slate-700">
              <p className="font-bold text-xs text-slate-900">
                Chính sách cấu hình hệ thống:
              </p>
              <p className="text-xs leading-relaxed text-slate-600">
                Các tham số dưới đây là quy chuẩn vận hành chuẩn của phòng Lab ACM. Các thông số này được đồng bộ và kiểm soát theo chính sách cơ sở. Để thay đổi quy chuẩn, Quản trị viên (ADMIN) thực hiện qua quy trình cấu hình tập trung.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Standard Parameter Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Item 1: Managing Unit */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center space-x-2 text-slate-500 mb-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="font-bold text-xs text-slate-700">Cơ sở / Đơn vị quản lý:</span>
            </div>
            <p className="font-semibold text-sm text-slate-900 pl-6 leading-snug">
              Trung tâm AI & Robotics Lab - Đại học Công nghệ
            </p>
            <p className="text-[11px] text-slate-500 pl-6 mt-1">
              Cơ quan chủ quản quản lý hạ tầng trang thiết bị và kho linh kiện thực hành.
            </p>
          </div>

          {/* Item 2: Central Warehouse */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center space-x-2 text-slate-500 mb-2">
              <Warehouse className="h-4 w-4 text-emerald-600" />
              <span className="font-bold text-xs text-slate-700">Mã kho trung tâm mặc định:</span>
            </div>
            <p className="font-mono font-bold text-sm text-slate-900 pl-6 leading-snug">
              WH-UAT-MAIN (Kho Nghiệm thu UAT)
            </p>
            <p className="text-[11px] text-slate-500 pl-6 mt-1">
              Kho vật lý trung tâm lưu trữ toàn bộ linh kiện nhập khẩu và đóng gói bộ Kit.
            </p>
          </div>

          {/* Item 3: Borrow Duration */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center space-x-2 text-slate-500 mb-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="font-bold text-xs text-slate-700">Thời hạn mượn tiêu chuẩn:</span>
            </div>
            <p className="font-semibold text-sm text-slate-900 pl-6 leading-snug">
              14 ngày (2 tuần, gia hạn tối đa 1 lần)
            </p>
            <p className="text-[11px] text-slate-500 pl-6 mt-1">
              Hệ thống tự động kích hoạt cảnh báo vàng và thông báo quá hạn khi hết kỳ mượn.
            </p>
          </div>

          {/* Item 4: Quantity Control Rule */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center space-x-2 text-slate-500 mb-2">
              <FileCheck className="h-4 w-4 text-indigo-600" />
              <span className="font-bold text-xs text-slate-700">Quy tắc kiểm soát số lượng:</span>
            </div>
            <p className="font-semibold text-sm text-slate-900 pl-6 leading-snug">
              Khóa duyệt tự động khi tồn khả dụng (Available) không đủ
            </p>
            <p className="text-[11px] text-slate-500 pl-6 mt-1">
              Bảo toàn số dư kho tuyệt đối, chống tình trạng cấp phát trùng hoặc âm tồn kho.
            </p>
          </div>
        </div>

        {/* Audit Trail Policy Box */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-1.5">
          <div className="flex items-center space-x-2 text-slate-800">
            <Shield className="h-4 w-4 text-purple-600" />
            <span className="font-bold text-xs text-slate-900">
              Chính sách Truy vết Kiểm toán (Audit Trail):
            </span>
          </div>
          <p className="text-xs text-slate-600 pl-6 leading-relaxed">
            Bắt buộc ghi nhận vết kiểm toán (AuditLog) đối với 100% thao tác: xuất, nhập, phê duyệt, bàn giao, nhận hoàn trả và xóa hộp kit. Không cho phép xóa hoặc sửa đổi lịch sử kiểm toán.
          </p>
        </div>
      </div>

      {/* Section 3: Technical Specifications & Release Notes */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card text-xs">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="h-4 w-4 text-slate-500" />
            <span className="font-bold text-slate-900">Thông tin Kiến trúc & Bản quyền Hệ thống</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Build 2026.11-PROD</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-slate-600">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nền tảng</span>
            <span className="font-semibold text-slate-800 block mt-0.5">AIR Components Manager (ACM)</span>
            <span className="text-[11px] text-slate-500 block">Hệ thống Quản lý Kho & Thiết bị Lab</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Công nghệ</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Fullstack Monorepo</span>
            <span className="text-[11px] text-slate-500 block">React 18, TypeScript, Tailwind, Node.js, Prisma</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bản quyền & Sử dụng</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Lab & Education License</span>
            <span className="text-[11px] text-slate-500 block">Dành riêng cho Trung tâm Đào tạo & Nghiên cứu</span>
          </div>
        </div>
      </div>
    </div>
  );
};
