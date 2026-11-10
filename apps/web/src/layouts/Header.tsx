import React from 'react';
import { Menu, Bell, Search, LogOut, User as UserIcon, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';

interface HeaderProps {
  onOpenSidebar: () => void;
  isSidebarOpen: boolean;
}

const routeMap: Record<string, { parent: string; title: string }> = {
  '/dashboard': { parent: 'Tổng quan', title: 'Bảng điều khiển' },
  '/items': { parent: 'Kho & Linh kiện', title: 'Linh kiện & Thiết bị' },
  '/categories': { parent: 'Kho & Linh kiện', title: 'Danh mục linh kiện' },
  '/kits': { parent: 'Kho & Linh kiện', title: 'Hộp Kit thực hành' },
  '/inventory': { parent: 'Kho & Linh kiện', title: 'Quản lý Tồn kho' },
  '/transactions': { parent: 'Nghiệp vụ kho', title: 'Giao dịch xuất - nhập kho' },
  '/borrow-return': { parent: 'Nghiệp vụ kho', title: 'Quản lý Mượn & Trả' },
  '/users': { parent: 'Hệ thống', title: 'Quản lý Người dùng' },
  '/reports': { parent: 'Báo cáo', title: 'Báo cáo & Thống kê' },
  '/audit-logs': { parent: 'Hệ thống', title: 'Nhật ký kiểm toán an toàn' },
  '/settings': { parent: 'Hệ thống', title: 'Cài đặt hệ thống' },
};

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar, isSidebarOpen }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const currentRoute = routeMap[location.pathname] || {
    parent: 'ACM System',
    title: 'Hệ thống quản lý',
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6">
      {/* Left: Hamburger & Breadcrumbs */}
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Mở menu điều hướng"
          aria-controls="acm-mobile-sidebar"
          aria-expanded={isSidebarOpen}
          className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 lg:hidden transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Dynamic Breadcrumbs */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-medium text-slate-400 hidden sm:inline">{currentRoute.parent}</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden sm:inline" />
          <h1 className="font-bold text-slate-800 text-sm">{currentRoute.title}</h1>
        </div>
      </div>

      {/* Middle: Search with shortcut */}
      <div className="relative hidden w-72 md:block lg:w-96">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm kiếm linh kiện, mã SKU, vị trí, phiếu mượn..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-12 text-xs text-slate-800 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
          <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 shadow-xs lg:inline-block">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Right: Cloud Status, Notifications & User profile */}
      <div className="flex items-center space-x-3">
        {/* Cloud Status Pill */}
        <div className="hidden xl:flex items-center space-x-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Cloud Online</span>
        </div>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Thông báo hệ thống"
          className="relative rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
        </button>

        <div className="h-5 w-[1px] bg-slate-200" />

        {/* User Pill */}
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-sm shadow-blue-500/20">
            {user?.fullName ? user.fullName[0].toUpperCase() : <UserIcon className="h-4 w-4" />}
          </div>
          <div className="hidden text-left sm:block">
            <div className="text-xs font-bold text-slate-800 truncate max-w-[140px]">
              {user?.fullName || 'Demo User'}
            </div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <StatusBadge status={user?.role || 'ADMIN'} variant="role" />
            </div>
          </div>

          <button
            onClick={logout}
            title="Đăng xuất khỏi hệ thống"
            className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
