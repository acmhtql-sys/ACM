import { describe, expect, it } from 'vitest';
import { canAccessPage, canManageUsers } from './access';

describe('Users/RBAC frontend routing', () => {
  it('ADMIN can access Users and Reports', () => {
    expect(canAccessPage('ADMIN', '/users')).toBe(true);
    expect(canAccessPage('ADMIN', '/reports')).toBe(true);
  });
  it('LAB_MANAGER cannot enter Users or Reports UI', () => {
    expect(canAccessPage('LAB_MANAGER', '/users')).toBe(false);
    expect(canAccessPage('LAB_MANAGER', '/reports')).toBe(false);
  });
  it('TECHNICIAN cannot enter Users UI', () => {
    expect(canAccessPage('TECHNICIAN', '/users')).toBe(false);
  });
  it('STUDENT can view Borrow & Return but not inventory mutations pages', () => {
    expect(canAccessPage('STUDENT', '/borrow-return')).toBe(true);
    expect(canAccessPage('STUDENT', '/inventory')).toBe(false);
    expect(canAccessPage('STUDENT', '/users')).toBe(false);
  });
  it('unknown role, path and unauthenticated users are denied', () => {
    expect(canAccessPage('UNKNOWN', '/users')).toBe(false);
    expect(canAccessPage(undefined, '/users')).toBe(false);
    expect(canAccessPage('ADMIN', '/admin-unknown')).toBe(false);
  });
  it('only ADMIN may manage users', () => {
    expect(canManageUsers('ADMIN')).toBe(true);
    expect(canManageUsers('LAB_MANAGER')).toBe(false);
    expect(canManageUsers('STUDENT')).toBe(false);
  });
});
