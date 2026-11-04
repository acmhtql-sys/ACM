import type { AcmRole } from '../config/access';

export const ACM_ROLES: readonly AcmRole[] = ['ADMIN', 'LAB_MANAGER', 'TECHNICIAN', 'STUDENT'];

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: AcmRole;
  studentOrStaffId: string | null;
  department: string | null;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeUsersResponse(data: unknown): PublicUser[] {
  if (!isObject(data) || data.success !== true || !Array.isArray(data.data)) {
    throw new Error('Máy chủ trả về danh sách người dùng không hợp lệ');
  }
  return data.data.map((raw: unknown) => {
    if (!isObject(raw) || typeof raw.id !== 'string' ||
        typeof raw.email !== 'string' || typeof raw.fullName !== 'string' ||
        !ACM_ROLES.includes(raw.role as AcmRole) ||
        typeof raw.isActive !== 'boolean' || typeof raw.isLocked !== 'boolean') {
      throw new Error('Dữ liệu người dùng không hợp lệ; không thể hiển thị an toàn');
    }
    return {
      id: raw.id,
      email: raw.email,
      fullName: raw.fullName,
      role: raw.role as AcmRole,
      studentOrStaffId: typeof raw.studentOrStaffId === 'string' ? raw.studentOrStaffId : null,
      department: typeof raw.department === 'string' ? raw.department : null,
      isActive: raw.isActive,
      isLocked: raw.isLocked,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    };
  });
}

/** UI warning only. Server must make this decision transactionally. */
export function wouldRemoveLastActiveAdmin(users: readonly PublicUser[], target: PublicUser,
  change: { role?: AcmRole; isActive?: boolean; isLocked?: boolean }): boolean {
  if (target.role !== 'ADMIN' || !target.isActive || target.isLocked) return false;
  const remainsActiveAdmin = (change.role ?? target.role) === 'ADMIN' &&
    (change.isActive ?? target.isActive) && !(change.isLocked ?? target.isLocked);
  if (remainsActiveAdmin) return false;
  const activeAdminCount = users.filter(u => u.role === 'ADMIN' && u.isActive && !u.isLocked).length;
  return activeAdminCount <= 1;
}

export function wouldLockOutCurrentUser(userId: string, target: PublicUser,
  change: { role?: AcmRole; isActive?: boolean; isLocked?: boolean }): boolean {
  return target.id === userId && (
    (change.role !== undefined && change.role !== 'ADMIN') ||
    change.isActive === false || change.isLocked === true
  );
}

export function resetPasswordPayload(password: string): { password: string } {
  if (password.length < 12 || password.length > 128) {
    throw new Error('Mật khẩu mới phải có từ 12 đến 128 ký tự');
  }
  return { password }; // main backend expects 'password', NOT 'newPassword'.
}
