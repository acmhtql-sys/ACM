import { UserRole } from '@acm/shared';

/**
 * RBAC Helper for Stock Transactions Subsystem.
 * Aligned 100% with Backend Express middleware (auth.ts & rbac.ts):
 * - ADMIN: Full access (Mutations & Queries).
 * - LAB_MANAGER: Full access (Mutations & Queries).
 * - TECHNICIAN: Read-only access (Queries only). Forbidden (403) from Mutations.
 * - STUDENT: Strictly Forbidden (403) from all Stock Transaction routes.
 */

export function canPerformStockMutation(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return role === UserRole.ADMIN || role === UserRole.LAB_MANAGER;
}

export function canReadStockTransactions(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return (
    role === UserRole.ADMIN ||
    role === UserRole.LAB_MANAGER ||
    role === UserRole.TECHNICIAN
  );
}

export function canQueryIdempotencyKey(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return (
    role === UserRole.ADMIN ||
    role === UserRole.LAB_MANAGER ||
    role === UserRole.TECHNICIAN
  );
}

export function canReadStockMovements(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return (
    role === UserRole.ADMIN ||
    role === UserRole.LAB_MANAGER ||
    role === UserRole.TECHNICIAN
  );
}

export function isStockReadOnlyRole(role?: UserRole | string | null): boolean {
  return role === UserRole.TECHNICIAN;
}

export function isStockForbiddenRole(role?: UserRole | string | null): boolean {
  return !role || role === UserRole.STUDENT;
}

export interface StockPermissions {
  canImport: boolean;
  canExport: boolean;
  canTransfer: boolean;
  canAdjust: boolean;
  canViewHistory: boolean;
  canViewMovements: boolean;
  canQueryIdempotency: boolean;
  isReadOnly: boolean;
  isForbidden: boolean;
}

export function getStockPermissions(role?: UserRole | string | null): StockPermissions {
  const canMutate = canPerformStockMutation(role);
  const canRead = canReadStockTransactions(role);

  return {
    canImport: canMutate,
    canExport: canMutate,
    canTransfer: canMutate,
    canAdjust: canMutate,
    canViewHistory: canRead,
    canViewMovements: canRead,
    canQueryIdempotency: canQueryIdempotencyKey(role),
    isReadOnly: isStockReadOnlyRole(role),
    isForbidden: isStockForbiddenRole(role),
  };
}
