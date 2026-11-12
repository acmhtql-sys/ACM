import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  RefreshCw,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';
import { canAccessPage } from '../config/access';
import {
  SystemNotification,
  NotificationReadState,
  fetchNotifications,
  subscribeToNotificationStream,
  loadNotificationReadState,
  isNotificationRead,
  markNotificationIdRead,
  markAllNotificationsRead,
  formatRelativeTimeVi,
} from '../services/notifications.service';

interface HeaderProps {
  onOpenSidebar: () => void;
  isSidebarOpen: boolean;
}

const MAX_DISPLAYED_NOTIFICATIONS = 50;

function mergeNotifications(
  existing: SystemNotification[],
  incoming: SystemNotification[]
): SystemNotification[] {
  const byId = new Map<string, SystemNotification>();
  for (const item of existing) {
    byId.set(item.id, item);
  }
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_DISPLAYED_NOTIFICATIONS);
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
  const { user, token: authToken, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [readState, setReadState] = useState<NotificationReadState>(() =>
    loadNotificationReadState(user?.id)
  );
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLoadingNotif, setIsLoadingNotif] = useState(false);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const notifRef = useRef<HTMLDivElement>(null);

  const resolveToken = useCallback(() => {
    if (authToken) return authToken;
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('acm_token');
    }
    return null;
  }, [authToken]);

  useEffect(() => {
    setReadState(loadNotificationReadState(user?.id));
  }, [user?.id]);

  const refreshNotifications = useCallback(
    async (showSpinner = false) => {
      const activeToken = resolveToken();
      if (!activeToken || !user) return;
      if (showSpinner) setIsLoadingNotif(true);
      try {
        const latest = await fetchNotifications(30);
        setNotifications((prev) => mergeNotifications(prev, latest));
        setNowMs(Date.now());
      } catch {
        // Keep existing notifications on transient network error
      } finally {
        if (showSpinner) setIsLoadingNotif(false);
      }
    },
    [resolveToken, user]
  );

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

  // Refresh when dropdown opens and update relative timestamps every 30s
  useEffect(() => {
    if (!isNotifOpen) return;
    setNowMs(Date.now());
    void refreshNotifications(notifications.length === 0);
    const ticker = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(ticker);
  }, [isNotifOpen, notifications.length, refreshNotifications]);

  // Initial fetch, realtime SSE subscription, and window-focus re-sync
  useEffect(() => {
    const activeToken = resolveToken();
    if (!activeToken || !user) {
      setNotifications([]);
      return;
    }

    let cancelled = false;
    let retryAttempt = 0;
    let reconnectTimer: number | null = null;
    let activeController: AbortController | null = null;

    void refreshNotifications(true);

    const connectStream = () => {
      if (cancelled) return;
      activeController = new AbortController();
      setStreamStatus((prev) => (prev === 'live' ? 'live' : 'connecting'));

      void subscribeToNotificationStream({
        token: activeToken,
        signal: activeController.signal,
        onConnected: () => {
          if (cancelled) return;
          retryAttempt = 0;
          setStreamStatus('live');
        },
        onNotification: (item) => {
          if (cancelled) return;
          setNotifications((prev) => mergeNotifications(prev, [item]));
          setNowMs(Date.now());
        },
        onDisconnect: (reason) => {
          if (cancelled) return;
          if (reason === 'UNAUTHORIZED') {
            setStreamStatus('polling');
            return;
          }
          setStreamStatus('polling');
          const delayMs =
            reason === 'NOT_SUPPORTED'
              ? 30_000
              : Math.min(30_000, 2_000 * Math.pow(2, retryAttempt));
          retryAttempt += 1;
          reconnectTimer = window.setTimeout(connectStream, delayMs);
        },
      });
    };

    connectStream();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshNotifications(false);
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (activeController) {
        activeController.abort();
      }
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refreshNotifications, resolveToken, user]);

  // Fallback periodic polling only when SSE stream is not live
  useEffect(() => {
    if (streamStatus !== 'polling' || !user) return;
    const pollTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshNotifications(false);
    }, 20_000);
    return () => window.clearInterval(pollTimer);
  }, [refreshNotifications, streamStatus, user]);

  const notificationsWithRead = useMemo(
    () =>
      notifications.map((n) => ({
        ...n,
        read: isNotificationRead(n, readState),
      })),
    [notifications, readState]
  );

  const unreadCount = useMemo(
    () => notificationsWithRead.filter((n) => !n.read).length,
    [notificationsWithRead]
  );

  const markAllAsRead = () => {
    const latestCreatedAt = notifications[0]?.createdAt;
    setReadState(markAllNotificationsRead(user?.id, latestCreatedAt));
  };

  const handleNotificationClick = (item: SystemNotification) => {
    setReadState((prev) => markNotificationIdRead(user?.id, item.id, prev));
    setIsNotifOpen(false);
    const destination = canAccessPage(user?.role, item.link) ? item.link : '/dashboard';
    navigate(destination);
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
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-xs font-bold text-slate-800 truncate">Thông báo hệ thống</span>
                  {unreadCount > 0 ? (
                    <span className="rounded-full bg-blue-50 border border-blue-200/60 px-2 py-0.5 text-[10px] font-semibold text-blue-700 shrink-0">
                      {unreadCount} mới
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 shrink-0">
                      Đã đọc hết
                    </span>
                  )}
                  <span
                    className={`hidden sm:inline-flex items-center space-x-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${
                      streamStatus === 'live'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                    title={
                      streamStatus === 'live'
                        ? 'Kết nối SSE thời gian thực đang hoạt động'
                        : 'Đang tự động đồng bộ định kỳ'
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        streamStatus === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    <span>{streamStatus === 'live' ? 'Trực tiếp' : 'Đồng bộ'}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="flex items-center space-x-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      <span>Đã đọc</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void refreshNotifications(true)}
                    disabled={isLoadingNotif}
                    title="Làm mới thông báo"
                    aria-label="Làm mới thông báo"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingNotif ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {isLoadingNotif && notificationsWithRead.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-blue-500" />
                    <p className="text-xs font-semibold text-slate-700">Đang tải thông báo...</p>
                  </div>
                ) : notificationsWithRead.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <BellOff className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700">Chưa có thông báo thay đổi</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Mọi thay đổi trong hệ thống sẽ xuất hiện trực tiếp tại đây.
                    </p>
                  </div>
                ) : (
                  notificationsWithRead.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`w-full text-left flex items-start space-x-3 p-3.5 cursor-pointer transition-colors ${
                        item.read ? 'bg-white hover:bg-slate-50/80 opacity-80' : 'bg-blue-50/35 hover:bg-blue-50/70'
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
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-xs truncate ${
                              item.read ? 'font-medium text-slate-700' : 'font-bold text-slate-900'
                            }`}
                          >
                            {item.title}
                          </p>
                          {!item.read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                          {item.message}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 shrink-0">
                              {item.categoryLabel}
                            </span>
                            {item.actorName && (
                              <span className="truncate text-slate-400">bởi {item.actorName}</span>
                            )}
                          </div>
                          <span className="text-slate-400 font-medium shrink-0">
                            {formatRelativeTimeVi(item.createdAt, nowMs)}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Dropdown Footer */}
              <div className="border-t border-slate-100 bg-slate-50/60 p-2.5 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    navigate(canAccessPage(user?.role, '/borrow-return') ? '/borrow-return' : '/dashboard');
                    setIsNotifOpen(false);
                  }}
                  className="font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                >
                  Quản lý mượn trả &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigate(
                      canAccessPage(user?.role, '/audit-logs')
                        ? '/audit-logs'
                        : canAccessPage(user?.role, '/inventory')
                        ? '/inventory'
                        : '/dashboard'
                    );
                    setIsNotifOpen(false);
                  }}
                  className="font-semibold text-slate-600 hover:text-blue-600 transition-colors"
                >
                  {canAccessPage(user?.role, '/audit-logs') ? 'Nhật ký hệ thống →' : 'Xem tồn kho →'}
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
