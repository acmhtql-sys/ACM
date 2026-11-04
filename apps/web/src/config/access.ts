/** Frontend-only visibility rules. Backend RBAC always remains authoritative. */
export type AcmRole = 'ADMIN' | 'LAB_MANAGER' | 'TECHNICIAN' | 'STUDENT';

const ALL: readonly AcmRole[] = ['ADMIN', 'LAB_MANAGER', 'TECHNICIAN', 'STUDENT'];
const OPERATORS: readonly AcmRole[] = ['ADMIN', 'LAB_MANAGER', 'TECHNICIAN'];

export const PAGE_ACCESS: Readonly<Record<string, readonly AcmRole[]>> = {
  '/dashboard': ALL,
  '/items': ALL,
  '/categories': ALL,
  '/kits': ALL,
  '/inventory': OPERATORS,
  '/transactions': OPERATORS,
  '/borrow-return': ALL, // Student has read-only access inside the page.
  '/users': ['ADMIN'],
  '/reports': ['ADMIN'],
  '/audit-logs': ['ADMIN'],
  '/settings': ALL,
};

export function canAccessPage(role: string | null | undefined, path: string): boolean {
  return Boolean(role && PAGE_ACCESS[path]?.includes(role as AcmRole));
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'ADMIN';
}
