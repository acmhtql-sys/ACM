import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Bell,
  BellOff,
  Search,
  LogOut,
  User as UserIcon,
  ChevronRight,
  CheckCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';

interface HeaderProps {
  onOpenSidebar: () => void;
  isSidebarOpen: boolean;
}

interface NotificationItem {
  id: string;
  type: 'warning' | 'info' | 'success';
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    type: 'warning',
    title: 'Cảnh báo mức tồn tối thiểu',
    message: 'Linh kiện Điện trở 10k Ohm (SKU-RES-10K) đang dưới mức định mức an toàn (còn 5/20 chiếc).',
    time: '15 phút trước',
    read: false,
    link: '/inventory',
  },
  {
    id: 'notif-2',
    type: 'info',
    title: 'Yêu cầu mượn linh kiện mới',
    message: 'Giảng viên Nguyễn Văn An gửi phiếu mượn Kit Arduino Uno R3 phục vụ lớp thực hành.',
    time: '42 phút trước',
    read: false,
    link: '/borrow-return',
  },
  {
    id: 'notif-3',
    type: 'success',
    title: 'Đồng bộ Supabase Cloud an toàn',
    message: 'Hệ thống đã tự động sao lưu số dư tồn kho và nhật ký giao dịch lên máy chủ đám mây.',
    time: '2 giờ trước',
    read: false,
    link: '/settings',
  },
];

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
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotifOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markAsRead = (id: string, link?: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (link) {
      navigate(link);
      setIsNotifOpen(false);
    }
  };

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

        {/* Interactive Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen((prev) => !prev)}
            aria-label="Thông báo hệ thống"
            aria-expanded={isNotifOpen}
            className={`relative rounded-xl p-2 transition-all ${
              isNotifOpen
                ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500/20'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white"></span>
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {isNotifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200/90 bg-white shadow-modal z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              {/* Dropdown Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">Thông báo hệ thống</span>
                  {unreadCount > 0 ? (
                    <span className="rounded-full bg-blue-50 border border-blue-200/60 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      {unreadCount} mới
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Đã đọc hết
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center space-x-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Đánh dấu đã đọc</span>
                  </button>
                )}
              </div>

              {/* Notifications List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <BellOff className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700">Không có thông báo mới</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tất cả hoạt động kho và hệ thống đều ổn định.</p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => markAsRead(item.id, item.link)}
                      className={`flex items-start space-x-3 p-3.5 cursor-pointer transition-colors ${
                        item.read ? 'bg-white hover:bg-slate-50/80 opacity-75' : 'bg-blue-50/30 hover:bg-blue-50/60'
                      }`}
                    >
                      {/* Icon based on type */}
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs ${
                          item.type === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : item.type === 'success'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {item.type === 'warning' && <AlertTriangle className="h-4 w-4" />}
                        {item.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
                        {item.type === 'info' && <Clock className="h-4 w-4" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-xs truncate ${item.read ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>
                            {item.title}
                          </p>
                          {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0 ml-2" />}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                          {item.message}
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 inline-block font-medium">
                          {item.time}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Dropdown Footer */}
              <div className="border-t border-slate-100 bg-slate-50/60 p-2.5 flex items-center justify-between text-[11px]">
                <button
                  onClick={() => {
                    navigate('/borrow-return');
                    setIsNotifOpen(false);
                  }}
                  className="font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                >
                  Quản lý mượn trả &rarr;
                </button>
                <button
                  onClick={() => {
                    navigate('/inventory');
                    setIsNotifOpen(false);
                  }}
                  className="font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                >
                  Xem tồn kho &rarr;
                </button>
              </div>
            </div>
          )}
        </div>

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
