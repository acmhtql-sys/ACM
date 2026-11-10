import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { ShieldCheck, Cpu, ArrowRight, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiClient.post('/auth/login', { email, password });
      if (res.data.success) {
        login(res.data.data.token, res.data.data.user);
        navigate('/dashboard');
      } else {
        setError(res.data.message || 'Email hoặc mật khẩu không chính xác');
      }
    } catch (err: any) {
      // Fail closed: network errors must never create a local authenticated session.
      if (err.response) {
        setError(err.response.data?.message || 'Email hoặc mật khẩu không chính xác');
      } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        setError('Máy chủ phản hồi quá chậm (có thể đang khởi động). Vui lòng thử lại sau.');
      } else {
        setError('Không thể kết nối máy chủ xác thực. Vui lòng thử lại sau.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Left decorative brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-navy-950 via-slate-900 to-navy-900 border-r border-slate-800/80 text-white relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center space-x-3 relative z-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 font-extrabold text-white shadow-soft text-sm">
            ACM
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">ACM SYSTEM</div>
            <div className="text-xs text-slate-400">Components & Equipment Management</div>
          </div>
        </div>

        <div className="max-w-md space-y-5 relative z-10">
          <div className="inline-flex items-center space-x-2 rounded-full border border-brand-400/20 bg-brand-500/10 px-3.5 py-1 text-xs text-brand-300 backdrop-blur-sm">
            <Cpu className="h-3.5 w-3.5 text-brand-400" />
            <span>Phòng Lab & Trung tâm AI Robotic</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
            Quản lý linh kiện & thiết bị thông minh, chính xác và minh bạch.
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Giải pháp toàn diện kiểm soát tồn kho khả dụng thời gian thực, quản lý vòng đời mượn trả,
            đóng kit thực hành và truy vết kiểm toán tự động theo chuẩn ERP giáo dục.
          </p>

          <div className="pt-2 grid grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Tồn kho thời gian thực</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              <span>Quy trình mượn trả khép kín</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>Nhận diện linh kiện AI</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
              <span>Nhật ký kiểm toán bất biến</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 relative z-10">
          © 2026 ACM Engineering Team. Enterprise Lab Edition.
        </div>
      </div>

      {/* Right Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-md space-y-7 rounded-2xl bg-white p-8 sm:p-10 shadow-modal border border-slate-200/80">
          <div>
            <div className="lg:hidden flex items-center space-x-2.5 mb-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-extrabold text-white text-xs">
                ACM
              </div>
              <span className="text-sm font-bold text-slate-900">ACM SYSTEM</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Đăng nhập ACM</h2>
            <p className="mt-1 text-xs text-slate-500">
              Nhập tài khoản để truy cập hệ thống quản lý phòng Lab
            </p>
          </div>

          {error && (
            <div className="flex items-center space-x-2.5 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-700 border border-rose-200/80 shadow-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email người dùng</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                placeholder="ten.nguoidung@acm.local"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">Mật khẩu</label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                placeholder="••••••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center space-x-2 rounded-xl bg-brand-600 py-2.5 px-4 text-xs font-semibold text-white shadow-soft hover:bg-brand-700 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all disabled:opacity-70 cursor-pointer"
            >
              <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập vào hệ thống'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Phiên bản v1.2.0-PROD</span>
            <span className="flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Máy chủ Cloud sẵn sàng</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
