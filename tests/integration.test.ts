import { describe, it, expect } from 'vitest';
import { calculateAvailableStock, UserRole, ItemType } from '../packages/shared/src';

describe('ACM Monorepo Root Integration Tests', () => {
  it('imports domain models and calculates stock correctly across workspaces', () => {
    expect(UserRole.ADMIN).toBe('ADMIN');
    expect(ItemType.TRACKED_ASSET).toBe('TRACKED_ASSET');

    const available = calculateAvailableStock({
      onHand: 50,
      reserved: 10,
      quarantined: 2,
      kitAllocated: 8,
      borrowed: 15,
    });

    expect(available).toBe(30);
  });
});
