/**
 * ACM Users mutation boundary – Serializable PostgreSQL transaction + atomic AuditLog.
 * This module must be independently reviewed and tested against an isolated, approved DB
 * before any real-data use. It deliberately excludes password/hash from audit payloads.
 * SEC-07: Revalidates actor active ADMIN permissions inside every serializable transaction and retry.
 */
import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../shared/AppError';
import {
  assertLastOperationalAdminPreserved,
  LastOperationalAdminError,
  type UserAdminSafetyState,
} from './users.admin-safety';

export interface UpdateUserFields {
  email?: string;
  fullName?: string;
  role?: UserRole;
  studentOrStaffId?: string | null;
  department?: string | null;
  phoneNumber?: string | null;
}
export interface UpdateUserStatusFields {
  isActive?: boolean;
  isLocked?: boolean;
}

type UserTx = Prisma.TransactionClient;

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  studentOrStaffId: true,
  department: true,
  isActive: true,
  isLocked: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

function safetyState(user: UserAdminSafetyState): UserAdminSafetyState {
  return { role: user.role, isActive: user.isActive, isLocked: user.isLocked };
}

function safeAuditSnapshot(user: PublicUser) {
  return {
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    studentOrStaffId: user.studentOrStaffId,
    department: user.department,
    isActive: user.isActive,
    isLocked: user.isLocked,
  };
}

function isSerializationConflict(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 'P2034');
}

/** Prisma P2034 retry is bounded. Write-skew between different ADMIN rows is forbidden by SSI. */
async function serializable<T>(callback: (tx: UserTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      if (err instanceof LastOperationalAdminError) throw new AppError(err.message, 409);
      if (!isSerializationConflict(err)) throw err;
      if (attempt === 2) {
        throw new AppError('Xung đột cập nhật người dùng đồng thời; vui lòng thử lại sau khi kiểm tra', 409);
      }
    }
  }
  throw new AppError('Không thể hoàn tất giao dịch người dùng', 409);
}

/** SEC-07: Revalidate actor inside the transaction boundary */
async function assertActiveAdminActor(tx: UserTx, actorId: string): Promise<void> {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true, isActive: true, isLocked: true },
  });
  if (!actor || actor.role !== UserRole.ADMIN || !actor.isActive || actor.isLocked) {
    throw new AppError('Tài khoản thực hiện không có quyền quản trị viên hợp lệ', 403);
  }
}

async function getTarget(tx: UserTx, id: string) {
  const user = await tx.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw new AppError('Không tìm thấy tài khoản người dùng', 404);
  return user;
}

async function assertSafeAdminTransition(
  tx: UserTx,
  before: UserAdminSafetyState,
  after: UserAdminSafetyState
): Promise<void> {
  if (before.role !== UserRole.ADMIN || !before.isActive || before.isLocked) return;
  if (after.role === UserRole.ADMIN && after.isActive && !after.isLocked) return;
  const count = await tx.user.count({
    where: { role: UserRole.ADMIN, isActive: true, isLocked: false },
  });
  assertLastOperationalAdminPreserved(before, after, count);
}

export async function updateUserWithAudit(
  targetId: string,
  actorId: string,
  fields: UpdateUserFields
) {
  return serializable(async (tx) => {
    await assertActiveAdminActor(tx, actorId);
    const before = await getTarget(tx, targetId);
    // No self-demotion; a no-op role field from the UI is harmless and permits profile edits.
    if (targetId === actorId && fields.role !== undefined && fields.role !== before.role) {
      throw new AppError('Không thể thay đổi vai trò của chính tài khoản đang đăng nhập', 400);
    }
    const after: UserAdminSafetyState = {
      role: fields.role ?? before.role,
      isActive: before.isActive,
      isLocked: before.isLocked,
    };
    await assertSafeAdminTransition(tx, safetyState(before), after);

    const updateData: Prisma.UserUncheckedUpdateInput = { ...fields };
    if (fields.email !== undefined) updateData.email = fields.email.toLowerCase();
    if (fields.role !== undefined) {
      const role = await tx.role.findUnique({
        where: { name: fields.role }, select: { id: true },
      });
      if (!role) throw new AppError('Vai trò chưa được khởi tạo trong database', 409);
      updateData.roleId = role.id;
    }
    const updated = await tx.user.update({
      where: { id: targetId }, data: updateData, select: publicUserSelect,
    });
    await tx.auditLog.create({ data: {
      userId: actorId, action: 'UPDATE', entity: 'User', entityId: targetId,
      oldValue: safeAuditSnapshot(before), newValue: safeAuditSnapshot(updated),
    } });
    return updated;
  });
}

export async function updateUserStatusWithAudit(
  targetId: string,
  actorId: string,
  fields: UpdateUserStatusFields
) {
  return serializable(async (tx) => {
    await assertActiveAdminActor(tx, actorId);
    const before = await getTarget(tx, targetId);
    if (targetId === actorId && (fields.isActive === false || fields.isLocked === true)) {
      throw new AppError('Không thể tự khóa hoặc vô hiệu hóa chính tài khoản đang đăng nhập', 400);
    }
    const after: UserAdminSafetyState = {
      role: before.role,
      isActive: fields.isActive ?? before.isActive,
      isLocked: fields.isLocked ?? before.isLocked,
    };
    await assertSafeAdminTransition(tx, safetyState(before), after);
    const updated = await tx.user.update({
      where: { id: targetId },
      data: {
        ...fields,
        ...(fields.isLocked === false ? { failedLoginAttempts: 0 } : {}),
      },
      select: publicUserSelect,
    });
    await tx.auditLog.create({ data: {
      userId: actorId, action: 'UPDATE_STATUS', entity: 'User', entityId: targetId,
      oldValue: { role: before.role, isActive: before.isActive, isLocked: before.isLocked },
      newValue: { role: updated.role, isActive: updated.isActive, isLocked: updated.isLocked },
    } });
    return updated;
  });
}

export async function resetUserPasswordWithAudit(
  targetId: string,
  actorId: string,
  plainPassword: string
) {
  // Never expose password or bcrypt hash to AuditLog, logs or API responses.
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  return serializable(async (tx) => {
    await assertActiveAdminActor(tx, actorId);
    await getTarget(tx, targetId);
    await tx.user.update({
      where: { id: targetId },
      data: { passwordHash, failedLoginAttempts: 0, isLocked: false },
      select: { id: true },
    });
    await tx.auditLog.create({ data: {
      userId: actorId, action: 'RESET_PASSWORD', entity: 'User', entityId: targetId,
      newValue: { passwordReset: true },
    } });
    return { id: targetId };
  });
}
