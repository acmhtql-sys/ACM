/** ACM Users hardening: pure decision helper, no database access. */
import { UserRole } from '@prisma/client';

export interface UserAdminSafetyState {
  role: UserRole;
  isActive: boolean;
  isLocked: boolean;
}

/** True only when a currently operational ADMIN would cease to be one. */
export function removesOperationalAdmin(
  before: UserAdminSafetyState,
  after: UserAdminSafetyState
): boolean {
  const wasOperational =
    before.role === UserRole.ADMIN && before.isActive && !before.isLocked;
  const remainsOperational =
    after.role === UserRole.ADMIN && after.isActive && !after.isLocked;
  return wasOperational && !remainsOperational;
}

/** Only call inside the SAME SERIALIZABLE database transaction as the update. */
export function assertLastOperationalAdminPreserved(
  before: UserAdminSafetyState,
  after: UserAdminSafetyState,
  operationalAdminCount: number
): void {
  if (!Number.isSafeInteger(operationalAdminCount) || operationalAdminCount < 0) {
    throw new Error('Số quản trị viên hợp lệ không xác định');
  }
  if (removesOperationalAdmin(before, after) && operationalAdminCount <= 1) {
    // Caller maps this to AppError 409; no writes must be issued after this decision.
    throw new LastOperationalAdminError();
  }
}

export class LastOperationalAdminError extends Error {
  constructor() {
    super('Không thể loại bỏ quản trị viên hoạt động cuối cùng');
    this.name = 'LastOperationalAdminError';
  }
}
