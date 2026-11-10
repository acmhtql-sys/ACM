import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { canAccessPage } from '../config/access';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  Layers,
  Boxes,
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  X,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavGroup {
  title: string;
  items: Array<{
    name: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const navGroups: NavGroup[] = [
  {
    title: 'TỔNG QUAN',
    items: [
      { name: 'Bảng điều khiển', path: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'KHO & LINH KIỆN',
    items: [
      { name: 'Linh kiện & Thiết bị', path: '/items', icon: Cpu },
      { name: 'Danh mục (Categories)', path: '/categories', icon: Layers },
      { name: 'Hộp Kit thực hành', path: '/kits', icon: Boxes },
      { name: 'Kho & Tồn kho', path: '/inventory', icon: Warehouse },
    ],
  },
  {
    title: 'MƯỢN TRẢ & GIAO DỊCH',
    items: [
      { name: 'Mượn & Trả (Borrow & Return)', path: '/borrow-return', icon: ClipboardList },
      { name: 'Giao dịch kho (Stock Tx)', path: '/transactions', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'QUẢN TRỊ & BÁO CÁO',
    items: [
      { name: 'Báo cáo & Thống kê', path: '/reports', icon: BarChart3 },
      { name: 'Người dùng (Users)', path: '/users', icon: Users },
      { name: 'Nhật ký kiểm toán', path: '/audit-logs', icon: ShieldCheck },
      { name: 'Cài đặt hệ thống', path: '/settings', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="acm-mobile-sidebar"
        aria-label="Điều hướng hệ thống"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0b1329] border-r border-slate-800/80 text-slate-300 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible lg:visible'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-5 bg-[#080e1f]">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-extrabold shadow-md shadow-blue-500/25 ring-1 ring-white/20">
              ACM
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-bold tracking-tight text-white">ACM SYSTEM</span>
                <span className="text-[9px] font-semibold bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-400/30">
                  PROD
                </span>
              </div>
              <div className="text-[10px] tracking-wider text-slate-400">Lab & AI Robotic</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng menu điều hướng"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items Grouped */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) =>
              canAccessPage(user?.role, item.path)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/90">
                  {group.title}
                </div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => onClose()}
                      className={({ isActive }) =>
                        `flex items-center space-x-3 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-semibold'
                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom System & Cloud Status */}
        <div className="border-t border-slate-800/80 p-3 bg-[#080e1f]/60">
          <div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-2.5 text-xs border border-slate-700/50">
            <div className="flex items-center space-x-2 truncate">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="truncate">
                <div className="text-[11px] font-semibold text-slate-200 truncate">Supabase Cloud</div>
                <div className="text-[10px] text-slate-400">Singapore (ap-southeast-1)</div>
              </div>
            </div>
            <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          </div>
        </div>
      </aside>
    </>
  );
};
