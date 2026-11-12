import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { StatusBadge } from '../components/StatusBadge';
import { canManageUsers, type AcmRole } from '../config/access';
import {
  ACM_ROLES, normalizeUsersResponse, resetPasswordPayload,
  wouldLockOutCurrentUser, wouldRemoveLastActiveAdmin, type PublicUser,
} from './usersContracts';

type Operation = 'create' | 'edit' | 'reset' | 'toggle';
type EditingForm = { fullName: string; role: AcmRole; department: string };
type CreateForm = EditingForm & { email: string; password: string; studentOrStaffId: string };
const blankCreate = (): CreateForm => ({
  email: '', password: '', fullName: '', role: 'STUDENT', department: '', studentOrStaffId: '',
});

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { message?: unknown }; status?: number }; message?: unknown };
    if (typeof e.response?.data?.message === 'string') return e.response.data.message;
    if (e.response?.status === 403) return 'Không có quyền thực hiện thao tác này (403).';
    if (e.response?.status === 401) return 'Phiên đăng nhập đã hết hạn (401).';
    if (typeof e.message === 'string') return e.message;
  }
  return 'Không thể xử lý yêu cầu. Vui lòng thử lại sau khi kiểm tra trạng thái máy chủ.';
}

function assertSuccess(response: unknown): void {
  if (!response || typeof response !== 'object' ||
      (response as { success?: unknown }).success !== true) {
    throw new Error('Máy chủ không xác nhận thành công; hãy tải lại dữ liệu trước khi thử tiếp.');
  }
}

const panel = 'rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-card';
const primaryButton = 'inline-flex items-center space-x-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-soft hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer';
const secondaryButton = 'inline-flex items-center space-x-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-all cursor-pointer';
const inputStyle = 'w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all';

/** Admin-only UI. Server-side RBAC, transactional last-admin protection and audit are mandatory for release. */
export const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = canManageUsers(user?.role);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AcmRole | 'ALL'>('ALL');
  const [operation, setOperation] = useState<Operation | null>(null);
  const [target, setTarget] = useState<PublicUser | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(blankCreate);
  const [editForm, setEditForm] = useState<EditingForm>({ fullName: '', role: 'STUDENT', department: '' });
  const [newPassword, setNewPassword] = useState('');
  const [toggleField, setToggleField] = useState<'isActive' | 'isLocked'>('isActive');

  const loadUsers = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const response = await apiClient.get('/users');
      setUsers(normalizeUsersResponse(response.data));
    } catch (err: unknown) {
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUsers([]); // Never retain a previous account's directory in the UI.
    if (isAdmin) void loadUsers();
  }, [isAdmin, user?.id]);

  const visibleUsers = useMemo(() => users.filter(u => {
    const q = query.trim().toLocaleLowerCase();
    return (roleFilter === 'ALL' || u.role === roleFilter) &&
      (!q || [u.fullName, u.email, u.studentOrStaffId ?? '', u.department ?? '']
        .some(v => v.toLocaleLowerCase().includes(q)));
  }), [users, query, roleFilter]);

  const close = () => {
    if (busyRef.current) return;
    setOperation(null);
    setTarget(null);
    setNewPassword('');
    setCreateForm(blankCreate());
  };

  const modalDismiss = useModalDismiss(Boolean(operation), close, busy);

  const runMutation = async (action: () => Promise<void>) => {
    if (!isAdmin || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setOperation(null);
      setTarget(null);
      setNewPassword('');
      setCreateForm(blankCreate());
      await loadUsers();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: errorMessage(err) });
      await loadUsers().catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    void runMutation(async () => {
      if (createForm.password.length < 12) throw new Error('Mật khẩu cần ít nhất 12 ký tự.');
      const response = await apiClient.post('/users', {
        email: createForm.email.trim(), fullName: createForm.fullName.trim(),
        password: createForm.password, role: createForm.role,
        department: createForm.department.trim() || null,
        studentOrStaffId: createForm.studentOrStaffId.trim() || null,
      });
      assertSuccess(response.data);
      setMessage({ type: 'success', text: 'Đã tạo tài khoản người dùng.' });
    });
  };

  const beginEdit = (u: PublicUser) => {
    setTarget(u);
    setEditForm({ fullName: u.fullName, role: u.role, department: u.department ?? '' });
    setOperation('edit');
  };

  const onEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !user) return;
    void runMutation(async () => {
      if (wouldLockOutCurrentUser(user.id, target, { role: editForm.role })) {
        throw new Error('Không thể tự thay đổi vai trò của chính tài khoản đang đăng nhập.');
      }
      if (wouldRemoveLastActiveAdmin(users, target, { role: editForm.role })) {
        throw new Error('Không thể hạ quyền quản trị viên hoạt động cuối cùng của hệ thống.');
      }
      const response = await apiClient.put(`/users/${encodeURIComponent(target.id)}`, {
        fullName: editForm.fullName.trim(), role: editForm.role,
        department: editForm.department.trim() || null,
      });
      assertSuccess(response.data);
      setMessage({ type: 'success', text: 'Đã cập nhật thông tin người dùng.' });
    });
  };

  const beginToggle = (u: PublicUser, field: 'isActive' | 'isLocked') => {
    setTarget(u);
    setToggleField(field);
    setOperation('toggle');
  };

  const onToggle = () => {
    if (!target || !user) return;
    const change = toggleField === 'isActive'
      ? { isActive: !target.isActive } : { isLocked: !target.isLocked };
    void runMutation(async () => {
      if (wouldLockOutCurrentUser(user.id, target, change)) {
        throw new Error('Không thể tự khóa hoặc vô hiệu hóa chính tài khoản đang đăng nhập.');
      }
      if (wouldRemoveLastActiveAdmin(users, target, change)) {
        throw new Error('Không thể khóa hoặc vô hiệu hóa quản trị viên hoạt động cuối cùng của hệ thống.');
      }
      const response = await apiClient.patch(`/users/${encodeURIComponent(target.id)}/status`, change);
      assertSuccess(response.data);
      setMessage({ type: 'success', text: 'Đã cập nhật trạng thái tài khoản.' });
    });
  };

  const beginReset = (u: PublicUser) => {
    setTarget(u);
    setNewPassword('');
    setOperation('reset');
  };

  const onReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    void runMutation(async () => {
      const response = await apiClient.post(
        `/users/${encodeURIComponent(target.id)}/reset-password`, resetPasswordPayload(newPassword)
      );
      assertSuccess(response.data);
      setMessage({ type: 'success', text: 'Đã đặt lại mật khẩu. Không hiển thị hoặc ghi log mật khẩu.' });
    });
  };

  if (!isAdmin) {
    return <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      Chỉ ADMIN được sử dụng giao diện quản lý người dùng.
    </div>;
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center space-x-2.5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Quản trị người dùng</h1>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200/60">
            {users.length} tài khoản
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Quản lý tài khoản, vai trò và trạng thái; backend là nguồn phân quyền cuối cùng.</p>
      </div>
      <button type="button" className={primaryButton} onClick={() => { setOperation('create'); setCreateForm(blankCreate()); }} disabled={busy}>
        Thêm người dùng
      </button>
    </header>

    {message && <div role="alert" className={`rounded-xl border p-3.5 text-xs font-medium shadow-xs ${message.type === 'error'
      ? 'border-rose-200/80 bg-rose-50 text-rose-900' : 'border-emerald-200/80 bg-emerald-50 text-emerald-900'}`}>
      {message.text}
    </div>}

    <section className={panel} aria-label="Bộ lọc người dùng">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-xs font-semibold text-slate-700">Tìm kiếm
          <input className={`${inputStyle} mt-1`} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tên, email, mã số hoặc đơn vị" />
        </label>
        <label className="w-48 text-xs font-semibold text-slate-700">Vai trò
          <select className={`${inputStyle} mt-1 cursor-pointer`} value={roleFilter} onChange={e => setRoleFilter(e.target.value as AcmRole | 'ALL')}>
            <option value="ALL">Tất cả</option>
            {ACM_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        <button type="button" className={secondaryButton} disabled={loading || busy} onClick={() => void loadUsers()}>
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{visibleUsers.length} người dùng hiển thị. Dữ liệu lấy từ API /users.</p>
    </section>

    <section className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-card" aria-label="Danh sách người dùng">
      <table className="w-full min-w-[900px] border-collapse text-left text-xs">
        <thead className="bg-slate-50/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><tr>
          {['Người dùng', 'Vai trò', 'Mã/Đơn vị', 'Trạng thái', 'Thao tác'].map(label =>
            <th key={label} className="border-b border-slate-200/80 p-3.5">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {visibleUsers.map(u => <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
            <td className="p-3.5">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 border border-brand-200/60 font-semibold text-brand-700 text-xs shrink-0">
                  {u.fullName ? u.fullName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <span className="block font-semibold text-slate-900">{u.fullName}</span>
                  <span className="text-[11px] text-slate-400">{u.email}</span>
                </div>
              </div>
            </td>
            <td className="p-3.5"><StatusBadge status={u.role} variant="role"/></td>
            <td className="p-3.5 text-slate-600 font-medium">
              <span className="font-mono text-slate-800">{u.studentOrStaffId || '—'}</span>
              <span className="text-slate-300 mx-1.5">•</span>
              <span>{u.department || '—'}</span>
            </td>
            <td className="p-3.5">
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  u.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-slate-100 text-slate-500'
                }`}>
                  {u.isActive ? 'Hoạt động' : 'Vô hiệu hóa'}
                </span>
                <span className="text-slate-300">·</span>
                <span className={`text-[11px] font-medium ${u.isLocked ? 'text-rose-600' : 'text-slate-500'}`}>
                  {u.isLocked ? 'Đang khóa' : 'Mở'}
                </span>
              </div>
            </td>
            <td className="p-3.5"><div className="flex flex-wrap gap-1.5">
              <button className={secondaryButton} disabled={busy} onClick={() => beginEdit(u)}>Sửa</button>
              <button className={secondaryButton} disabled={busy} onClick={() => beginToggle(u, 'isActive')}>
                {u.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}</button>
              <button className={secondaryButton} disabled={busy} onClick={() => beginToggle(u, 'isLocked')}>
                {u.isLocked ? 'Mở khóa' : 'Khóa'}</button>
              <button className={secondaryButton} disabled={busy} onClick={() => beginReset(u)}>Đặt lại mật khẩu</button>
            </div></td>
          </tr>)}
          {!loading && visibleUsers.length === 0 && <tr><td className="p-8 text-center text-slate-400 text-xs" colSpan={5}>
            Không có người dùng phù hợp hoặc chưa có dữ liệu.</td></tr>}
        </tbody>
      </table>
    </section>

    {operation && <div {...modalDismiss} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Thao tác quản trị người dùng" className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-modal border border-slate-100">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900">{operation === 'create' ? 'Thêm tài khoản' :
            operation === 'edit' ? 'Cập nhật tài khoản' : operation === 'reset' ? 'Đặt lại mật khẩu' : 'Xác nhận trạng thái'}</h2>
          <button type="button" className={secondaryButton} disabled={busy} onClick={close}>Đóng</button>
        </div>
        {operation === 'create' && <form className="space-y-3.5" onSubmit={onCreate}>
          <label className="block text-xs font-semibold text-slate-700">Họ tên<input required maxLength={160} className={`${inputStyle} mt-1`} value={createForm.fullName}
            onChange={e => setCreateForm(p => ({...p, fullName: e.target.value}))}/></label>
          <label className="block text-xs font-semibold text-slate-700">Email<input required type="email" maxLength={254} className={`${inputStyle} mt-1`} value={createForm.email}
            onChange={e => setCreateForm(p => ({...p, email: e.target.value}))}/></label>
          <label className="block text-xs font-semibold text-slate-700">Mật khẩu (tối thiểu 12 ký tự)<input required type="password" autoComplete="new-password"
            minLength={12} maxLength={128} className={`${inputStyle} mt-1`} value={createForm.password}
            onChange={e => setCreateForm(p => ({...p, password: e.target.value}))}/></label>
          <label className="block text-xs font-semibold text-slate-700">Vai trò<select className={`${inputStyle} mt-1 cursor-pointer`} value={createForm.role}
            onChange={e => setCreateForm(p => ({...p, role: e.target.value as AcmRole}))}>
            {ACM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="block text-xs font-semibold text-slate-700">Mã sinh viên/nhân viên<input maxLength={80} className={`${inputStyle} mt-1`} value={createForm.studentOrStaffId}
            onChange={e => setCreateForm(p => ({...p, studentOrStaffId: e.target.value}))}/></label>
          <label className="block text-xs font-semibold text-slate-700">Đơn vị<input maxLength={160} className={`${inputStyle} mt-1`} value={createForm.department}
            onChange={e => setCreateForm(p => ({...p, department: e.target.value}))}/></label>
          <div className="pt-2">
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? 'Đang xử lý...' : 'Tạo tài khoản'}</button>
          </div>
        </form>}
        {operation === 'edit' && target && <form className="space-y-3.5" onSubmit={onEdit}>
          <p className="text-xs text-slate-500 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200/60">{target.email}</p>
          <label className="block text-xs font-semibold text-slate-700">Họ tên<input required maxLength={160} className={`${inputStyle} mt-1`} value={editForm.fullName}
            onChange={e => setEditForm(p => ({...p, fullName: e.target.value}))}/></label>
          <label className="block text-xs font-semibold text-slate-700">Vai trò<select className={`${inputStyle} mt-1 cursor-pointer`} value={editForm.role}
            onChange={e => setEditForm(p => ({...p, role: e.target.value as AcmRole}))}>
            {ACM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="block text-xs font-semibold text-slate-700">Đơn vị<input maxLength={160} className={`${inputStyle} mt-1`} value={editForm.department}
            onChange={e => setEditForm(p => ({...p, department: e.target.value}))}/></label>
          <div className="pt-2">
            <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Đang xử lý...' : 'Lưu thay đổi'}</button>
          </div>
        </form>}
        {operation === 'toggle' && target && <div className="space-y-4">
          <p className="text-xs text-slate-700 leading-relaxed">Bạn có chắc muốn {toggleField === 'isLocked' ? (target.isLocked ? 'mở khóa' : 'khóa') :
            (target.isActive ? 'vô hiệu hóa' : 'kích hoạt')} tài khoản <strong className="font-semibold text-slate-900">{target.email}</strong>?</p>
          <button type="button" className={primaryButton} disabled={busy} onClick={onToggle}>
            {busy ? 'Đang xử lý...' : 'Xác nhận'}</button>
        </div>}
        {operation === 'reset' && target && <form className="space-y-3.5" onSubmit={onReset}>
          <p className="text-xs text-slate-600">Đặt lại mật khẩu của <strong className="font-semibold text-slate-900">{target.email}</strong>. Không gửi mật khẩu qua nhật ký.</p>
          <label className="block text-xs font-semibold text-slate-700">Mật khẩu mới<input required autoComplete="new-password" type="password"
            minLength={12} maxLength={128} className={`${inputStyle} mt-1`} value={newPassword}
            onChange={e => setNewPassword(e.target.value)}/></label>
          <div className="pt-2">
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? 'Đang xử lý...' : 'Xác nhận đặt lại'}</button>
          </div>
        </form>}
      </div>
    </div>}
  </div>;
};
