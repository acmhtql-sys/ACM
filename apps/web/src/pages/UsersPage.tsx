import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Plus, UserCheck, Shield } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { StatusBadge } from '../components/StatusBadge';
import { apiClient } from '../services/api';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await apiClient.get('/users');
        if (res.data?.success) {
          setUsers(res.data.data);
        }
      } catch (err) {
        // Fallback
      }
    }
    fetchUsers();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Quản trị Người dùng (Users & RBAC)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Phân quyền 4 vai trò: Admin, Lab Manager, Technician, Student
          </p>
        </div>
        <button className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" />
          <span>Thêm người dùng mới</span>
        </button>
      </div>

      <DemoDataNotice moduleName="User & RBAC Management" />

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Email đăng nhập</th>
                <th className="py-3 px-4">Mã định danh (MSSV / CB)</th>
                <th className="py-3 px-4">Vai trò hệ thống</th>
                <th className="py-3 px-4">Đơn vị / Khoa</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-900">{u.fullName}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{u.studentOrStaffId || '-'}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={u.role} variant="role" />
                  </td>
                  <td className="py-3 px-4 text-slate-600">{u.department || 'Lab AI Robotic'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center text-emerald-600 font-semibold text-[11px]">
                      <UserCheck className="h-3 w-3 mr-1" /> Hoạt động
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
