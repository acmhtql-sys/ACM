import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  Boxes,
  Camera,
  Menu,
  Sparkles,
} from 'lucide-react';

interface MobileBottomNavProps {
  onOpenSidebar: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenSidebar }) => {
  const location = useLocation();

  const isAiActive = location.pathname === '/borrow-return';

  return (
    <nav
      id="acm-mobile-bottom-nav"
      aria-label="Điều hướng nhanh điện thoại"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md shadow-2xl transition-all block md:hidden pointer-coarse:block pointer-fine:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
    >
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {/* Tab 1: Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              isActive
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <LayoutDashboard className="h-5 w-5" />
                {isActive && (
                  <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">Tổng quan</span>
            </>
          )}
        </NavLink>

        {/* Tab 2: Linh kiện & Thiết bị */}
        <NavLink
          to="/items"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              isActive
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <Cpu className="h-5 w-5" />
                {isActive && (
                  <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">Linh kiện</span>
            </>
          )}
        </NavLink>

        {/* Tab 3: CENTER ACTION - QUÉT AI / MƯỢN TRẢ */}
        <div className="flex-1 flex flex-col items-center justify-center -mt-5">
          <NavLink
            to="/borrow-return"
            aria-label="Quét Camera AI Nhận diện linh kiện & Mượn trả"
            className={`relative flex h-13 w-13 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ring-4 ${
              isAiActive
                ? 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-blue-500/40 ring-slate-950 scale-105'
                : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-600/30 ring-slate-950'
            }`}
          >
            <Camera className="h-6 w-6" />
            <Sparkles className="absolute top-2 right-2 h-3.5 w-3.5 text-amber-300 animate-pulse" />
          </NavLink>
          <span className={`text-[10px] mt-1 tracking-tight font-bold ${
            isAiActive ? 'text-blue-400' : 'text-slate-300'
          }`}>
            Quét AI
          </span>
        </div>

        {/* Tab 4: Hộp Kit thực hành */}
        <NavLink
          to="/kits"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              isActive
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <Boxes className="h-5 w-5" />
                {isActive && (
                  <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">Hộp Kit</span>
            </>
          )}
        </NavLink>

        {/* Tab 5: Menu & Cài đặt (Mở Drawer tiện lợi) */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Mở danh mục điều hướng mở rộng"
          className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400 hover:text-slate-200 cursor-pointer active:scale-95 transition-all"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] mt-1 tracking-tight">Thêm</span>
        </button>
      </div>
    </nav>
  );
};
