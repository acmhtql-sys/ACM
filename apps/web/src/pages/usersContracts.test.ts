import { describe, expect, it } from 'vitest';
import {
  normalizeUsersResponse, resetPasswordPayload,
  wouldLockOutCurrentUser, wouldRemoveLastActiveAdmin,
  type PublicUser,
} from './usersContracts';

const admin: PublicUser = {
  id: 'admin-1', email: 'admin@example.test', fullName: 'Administrator', role: 'ADMIN',
  studentOrStaffId: null, department: null, isActive: true, isLocked: false, createdAt: '',
};

describe('Users API contract and client guards', () => {
  it('accepts direct main API array envelope', () => {
    expect(normalizeUsersResponse({ success: true, data: [admin] })).toEqual([admin]);
  });
  it('refuses missing or malformed response rather than treating as empty list', () => {
    expect(() => normalizeUsersResponse({ success: true, data: null })).toThrow();
    expect(() => normalizeUsersResponse({ success: true, data: [{ id: 'x', role: 'ADMIN' }] })).toThrow();
  });
  it('reset password uses backend field password', () => {
    expect(resetPasswordPayload('long-password-for-test')).toEqual({ password: 'long-password-for-test' });
    expect(() => resetPasswordPayload('short')).toThrow();
  });
  it('blocks self-lock and self-demotion in UI', () => {
    expect(wouldLockOutCurrentUser(admin.id, admin, { role: 'STUDENT' })).toBe(true);
    expect(wouldLockOutCurrentUser(admin.id, admin, { isLocked: true })).toBe(true);
    expect(wouldLockOutCurrentUser(admin.id, admin, { isActive: false })).toBe(true);
  });
  it('warns on removal of final active ADMIN', () => {
    expect(wouldRemoveLastActiveAdmin([admin], admin, { role: 'TECHNICIAN' })).toBe(true);
    expect(wouldRemoveLastActiveAdmin([admin], admin, { isLocked: true })).toBe(true);
    expect(wouldRemoveLastActiveAdmin([admin], admin, { isActive: false })).toBe(true);
  });
  it('allows a second active ADMIN to remain', () => {
    const other = { ...admin, id: 'admin-2' };
    expect(wouldRemoveLastActiveAdmin([admin, other], admin, { isLocked: true })).toBe(false);
  });
});
