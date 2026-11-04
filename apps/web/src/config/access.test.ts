import { describe, expect, it } from 'vitest';
import { canAccessPage, canManageUsers } from './access';

describe('Users/RBAC frontend routing', () => {
  it('ADMIN can access Users, Reports, and Audit Logs', () => {
    expect(canAccessPage('ADMIN', '/users')).toBe(true);
    expect(canAccessPage('ADMIN', '/reports')).toBe(true);
    expect(canAccessPage('ADMIN', '/audit-logs')).toBe(true);
  });
  it('LAB_MANAGER cannot enter Users, Reports, or Audit Logs UI', () => {
    expect(canAccessPage('LAB_MANAGER', '/users')).toBe(false);
    expect(canAccessPage('LAB_MANAGER', '/reports')).toBe(false);
    expect(canAccessPage('LAB_MANAGER', '/audit-logs')).toBe(false);
  });
  it('TECHNICIAN cannot enter Users or Audit Logs UI', () => {
    expect(canAccessPage('TECHNICIAN', '/users')).toBe(false);
    expect(canAccessPage('TECHNICIAN', '/audit-logs')).toBe(false);
  });
  it('STUDENT can view Borrow & Return but not inventory mutations or audit pages', () => {
    expect(canAccessPage('STUDENT', '/borrow-return')).toBe(true);
    expect(canAccessPage('STUDENT', '/inventory')).toBe(false);
    expect(canAccessPage('STUDENT', '/users')).toBe(false);
    expect(canAccessPage('STUDENT', '/audit-logs')).toBe(false);
  });
  it('all authenticated roles can access Kits page', () => {
    expect(canAccessPage('ADMIN', '/kits')).toBe(true);
    expect(canAccessPage('LAB_MANAGER', '/kits')).toBe(true);
    expect(canAccessPage('TECHNICIAN', '/kits')).toBe(true);
    expect(canAccessPage('STUDENT', '/kits')).toBe(true);
  });
  it('unknown role, path and unauthenticated users are denied', () => {
    expect(canAccessPage('UNKNOWN', '/users')).toBe(false);
    expect(canAccessPage('UNKNOWN', '/audit-logs')).toBe(false);
    expect(canAccessPage('UNKNOWN', '/kits')).toBe(false);
    expect(canAccessPage(undefined, '/users')).toBe(false);
    expect(canAccessPage(undefined, '/audit-logs')).toBe(false);
    expect(canAccessPage(undefined, '/kits')).toBe(false);
    expect(canAccessPage('ADMIN', '/admin-unknown')).toBe(false);
  });
  it('only ADMIN may manage users', () => {
    expect(canManageUsers('ADMIN')).toBe(true);
    expect(canManageUsers('LAB_MANAGER')).toBe(false);
    expect(canManageUsers('STUDENT')).toBe(false);
  });
});
