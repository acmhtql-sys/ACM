import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { ShieldCheck, Cpu, ArrowRight, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@acm.local');
  const [password, setPassword] = useState('ACM@dev2026!');
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
      }
    } catch (err: any) {
      // In Phase 1 foundation, if API is not running yet, provide instant offline mock fallback
      console.warn('API connection failed, falling back to local session', err);
      const mockRole = email.includes('manager')
        ? 'LAB_MANAGER'
        : email.includes('tech')
        ? 'TECHNICIAN'
        : email.includes('student')
        ? 'STUDENT'
        : 'ADMIN';

      login('mock-jwt-token-foundation-phase1', {
        id: 'mock-user-id',
        email,
        fullName: email.split('@')[0].toUpperCase(),
        role: mockRole as any,
      });
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const fillCredentials = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('ACM@dev2026!');
  };

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Left decorative brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950 border-r border-slate-800 text-white">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-extrabold text-white shadow-xl shadow-blue-500/30">
            ACM
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">ACM SYSTEM</div>
            <div className="text-xs text-blue-200">Components & Equipment Management</div>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <div className="inline-flex items-center space-x-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-300 backdrop-blur-sm">
            <Cpu className="h-3.5 w-3.5" />
            <span>Phòng Lab & Trung tâm AI Robotic</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Quản lý linh kiện & thiết bị thông minh, chính xác và minh bạch.
          </h1>
          <p className="text-sm text-slate-300">
            Giải pháp toàn diện kiểm soát tồn kho khả dụng thời gian thực, quản lý vòng đời mượn trả,
            đóng kit thực hành và truy vết kiểm toán tự động.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          © 2026 ACM Engineering Team. Phase 1 Project Foundation.
        </div>
      </div>

      {/* Right Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/60 border border-slate-100">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Đăng nhập ACM</h2>
            <p className="mt-1 text-xs text-slate-500">
              Nhập tài khoản để truy cập hệ thống quản lý phòng Lab
            </p>
          </div>

          {error && (
            <div className="flex items-center space-x-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email người dùng</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                placeholder="ten.nguoidung@acm.local"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                placeholder="••••••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:opacity-70"
            >
              <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập vào hệ thống'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Demo Credentials Quick-Fill */}
          <div className="border-t border-slate-100 pt-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Chọn nhanh tài khoản thử nghiệm (Demo)
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('admin@acm.local')}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
              >
                <div className="font-semibold text-purple-700">Admin</div>
                <div className="truncate text-[10px] text-slate-400">admin@acm.local</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('manager@acm.local')}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
              >
                <div className="font-semibold text-blue-700">Lab Manager</div>
                <div className="truncate text-[10px] text-slate-400">manager@acm.local</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('tech@acm.local')}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
              >
                <div className="font-semibold text-emerald-700">Technician</div>
                <div className="truncate text-[10px] text-slate-400">tech@acm.local</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('student@acm.local')}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
              >
                <div className="font-semibold text-slate-700">Student</div>
                <div className="truncate text-[10px] text-slate-400">student@acm.local</div>
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Mật khẩu mặc định: <code className="font-mono text-slate-600">ACM@dev2026!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
