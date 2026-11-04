import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@prisma/client';

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'test-hash-do-not-use') } }));
vi.mock('../src/config/database', () => {
  const tx = {
    user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (callback: any) => callback(tx)),
      __testTx: tx,
    },
  };
});

import { prisma } from '../src/config/database';
import {
  updateUserWithAudit,
  updateUserStatusWithAudit,
  resetUserPasswordWithAudit,
} from '../src/modules/users/users.mutation.service';

const admin = {
  id: 'admin-target', email: 'admin@example.test', fullName: 'Admin A',
  role: UserRole.ADMIN, studentOrStaffId: null, department: null,
  isActive: true, isLocked: false, createdAt: new Date(), updatedAt: new Date(),
};
const tx = (prisma as any).__testTx;
const transaction = prisma.$transaction as any;

beforeEach(() => {
  vi.clearAllMocks();
  tx.user.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.id === 'admin-other') {
      return { id: 'admin-other', email: 'actor@example.test', fullName: 'Actor Admin', role: UserRole.ADMIN, isActive: true, isLocked: false };
    }
    return { ...admin };
  });
  tx.user.count.mockResolvedValue(1);
  tx.user.update.mockImplementation(async ({ data }: any) => ({ ...admin, ...data }));
  tx.role.findUnique.mockResolvedValue({ id: 'role-id' });
  tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  transaction.mockImplementation(async (callback: any) => callback(tx));
});

describe('ACM Users serializable mutation and atomic audit unit tests (mock-only)', () => {
  it('rejects demotion of last operational ADMIN; no user write and no audit', async () => {
    await expect(updateUserWithAudit('admin-target', 'admin-other', { role: UserRole.STUDENT }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(tx.user.count).toHaveBeenCalledWith({
      where: { role: UserRole.ADMIN, isActive: true, isLocked: false },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
  });
  it('allows another ADMIN demotion only when count >= 2, and audits in same transaction', async () => {
    tx.user.count.mockResolvedValue(2);
    const result = await updateUserWithAudit('admin-target', 'admin-other', { role: UserRole.TECHNICIAN });
    expect(result.role).toBe(UserRole.TECHNICIAN);
    expect(tx.role.findUnique).toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'admin-other', entity: 'User', entityId: 'admin-target', action: 'UPDATE',
    }) });
  });
  it('rejects self-demotion', async () => {
    await expect(updateUserWithAudit('admin-target', 'admin-target', { role: UserRole.STUDENT }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('allows own profile change when UI sends an unchanged ADMIN role', async () => {
    await updateUserWithAudit('admin-target', 'admin-target', { role: UserRole.ADMIN, fullName: 'New Admin Name' });
    expect(tx.user.update).toHaveBeenCalled();
  });
  it('rejects last active ADMIN lock in status route', async () => {
    await expect(updateUserStatusWithAudit('admin-target', 'admin-other', { isLocked: true }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('rejects self deactivation', async () => {
    await expect(updateUserStatusWithAudit('admin-target', 'admin-target', { isActive: false }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('audits a permitted status change without password or password hash fields', async () => {
    tx.user.count.mockResolvedValue(2);
    await updateUserStatusWithAudit('admin-target', 'admin-other', { isLocked: true });
    const record = tx.auditLog.create.mock.calls[0][0].data;
    expect(record.action).toBe('UPDATE_STATUS');
    expect(JSON.stringify(record)).not.toContain('password');
  });
  it('reset password audit is metadata-only and shares transaction', async () => {
    await resetUserPasswordWithAudit('admin-target', 'admin-other', 'example-secret-just-for-test');
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: 'test-hash-do-not-use' }),
    }));
    const record = tx.auditLog.create.mock.calls[0][0].data;
    expect(record.action).toBe('RESET_PASSWORD');
    expect(JSON.stringify(record)).not.toContain('test-hash-do-not-use');
    expect(JSON.stringify(record)).not.toContain('example-secret-just-for-test');
  });
  it('retries bounded P2034 serialization conflict', async () => {
    transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (callback: any) => callback(tx));
    await updateUserWithAudit('admin-target', 'admin-other', { fullName: 'New Name' });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('fails with HTTP 409 after exhausting three P2034 retries', async () => {
    transaction.mockRejectedValue({ code: 'P2034' });
    await expect(updateUserWithAudit('admin-target', 'admin-other', { fullName: 'New Name' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  // SEC-07: Actor Revalidation Tests
  it('SEC-07: rejects mutation with HTTP 403 if actor was demoted before/during transaction', async () => {
    tx.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'demoted-actor') {
        return { id: 'demoted-actor', role: UserRole.STUDENT, isActive: true, isLocked: false };
      }
      return { ...admin };
    });
    await expect(updateUserWithAudit('admin-target', 'demoted-actor', { fullName: 'Hacked' }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('SEC-07: rejects mutation with HTTP 403 if actor was locked', async () => {
    tx.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'locked-actor') {
        return { id: 'locked-actor', role: UserRole.ADMIN, isActive: true, isLocked: true };
      }
      return { ...admin };
    });
    await expect(updateUserStatusWithAudit('admin-target', 'locked-actor', { isActive: false }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('SEC-07: rejects reset password with HTTP 403 if actor was deactivated', async () => {
    tx.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'inactive-actor') {
        return { id: 'inactive-actor', role: UserRole.ADMIN, isActive: false, isLocked: false };
      }
      return { ...admin };
    });
    await expect(resetUserPasswordWithAudit('admin-target', 'inactive-actor', 'newPassword123!'))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('SEC-07: rejects mutation with HTTP 403 if actor account was deleted', async () => {
    tx.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'deleted-actor') return null;
      return { ...admin };
    });
    await expect(updateUserWithAudit('admin-target', 'deleted-actor', { fullName: 'Test' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('SEC-07: revalidates actor on each retry of serializable transaction', async () => {
    let callCount = 0;
    transaction.mockImplementation(async (callback: any) => {
      callCount += 1;
      if (callCount === 1) {
        throw { code: 'P2034' };
      }
      return callback(tx);
    });

    await updateUserWithAudit('admin-target', 'admin-other', { fullName: 'Retry Success' });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-other' },
      select: { role: true, isActive: true, isLocked: true },
    });
  });
});
