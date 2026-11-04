import { describe, it, expect } from 'vitest';
import { UserRole } from '@prisma/client';
import { assertLastOperationalAdminPreserved, removesOperationalAdmin, LastOperationalAdminError } from '../src/modules/users/users.admin-safety';

const admin = { role: UserRole.ADMIN, isActive: true, isLocked: false };

describe('ACM Users last-operational-ADMIN pure safety decisions', () => {
  it('rejects deactivating the last operational ADMIN', () => {
    expect(() => assertLastOperationalAdminPreserved(admin, { ...admin, isActive: false }, 1))
      .toThrow(LastOperationalAdminError);
  });
  it('rejects locking the last operational ADMIN', () => {
    expect(() => assertLastOperationalAdminPreserved(admin, { ...admin, isLocked: true }, 1))
      .toThrow(LastOperationalAdminError);
  });
  it('rejects demoting the last operational ADMIN', () => {
    expect(() => assertLastOperationalAdminPreserved(admin, { ...admin, role: UserRole.TECHNICIAN }, 1))
      .toThrow(LastOperationalAdminError);
  });
  it('allows changes with at least two operational ADMINs (DB serializable check required)', () => {
    expect(() => assertLastOperationalAdminPreserved(admin, { ...admin, isLocked: true }, 2))
      .not.toThrow();
  });
  it('does not count inactive or locked ADMIN as operational', () => {
    expect(removesOperationalAdmin({ ...admin, isLocked: true }, { ...admin, role: UserRole.STUDENT }))
      .toBe(false);
  });
  it('does not veto safe edits to an operational ADMIN', () => {
    expect(() => assertLastOperationalAdminPreserved(admin, admin, 1)).not.toThrow();
  });
  it('does not veto a non-admin role change', () => {
    const tech = { role: UserRole.TECHNICIAN, isActive: true, isLocked: false };
    expect(() => assertLastOperationalAdminPreserved(tech, { ...tech, role: UserRole.STUDENT }, 1))
      .not.toThrow();
  });
  it('rejects malformed operational ADMIN counts', () => {
    expect(() => assertLastOperationalAdminPreserved(admin, { ...admin, isActive: false }, NaN))
      .toThrow(/không xác định/);
  });
});
