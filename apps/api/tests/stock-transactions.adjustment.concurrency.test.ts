import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stockTransactionsService } from '../src/modules/stock-transactions/stock-transactions.service';
import { idempotencyService } from '../src/modules/inventory/idempotency.service';
import { prisma } from '../src/config/database';
import { AppError } from '../src/shared/AppError';
import { AdjustStockInputV2 } from '@acm/shared';

describe('ACM Phase 2.2 Step S2B – Stock Adjustment Concurrency Protection Test Suite (Unit & Mock Double)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const item1Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const item2Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const item3Id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const item4Id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const item5Id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const loc1Id = '99999999-9999-9999-9999-999999999999';

  // In-memory balance store for mock database rows
  let mockBalances: Map<string, any>;
  let mockTx: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockBalances = new Map();

    // Default mock balance for item1 at loc1
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 100,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    // Mock transaction object
    mockTx = {
      $queryRawUnsafe: vi.fn(async (sql: string, itemId: string, locationId: string) => {
        const key = `${itemId}:${locationId}`;
        const row = mockBalances.get(key);
        return row ? [{ ...row }] : [];
      }),
      $executeRawUnsafe: vi.fn(async (sql: string, itemId: string, locationId: string) => {
        const key = `${itemId}:${locationId}`;
        if (!mockBalances.has(key)) {
          mockBalances.set(key, {
            id: `bal-new-${itemId.slice(0, 4)}`,
            itemId,
            locationId,
            onHand: 0,
            reserved: 0,
            quarantined: 0,
            kitAllocated: 0,
            borrowed: 0,
          });
        }
        return 1;
      }),
      item: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          code: `ITEM-${where.id.slice(0, 4)}`,
          name: 'Test Linh Kiện',
          unit: 'cái',
          type: 'CONSUMABLE',
          isActive: true,
        })),
      },
      location: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          code: `LOC-${where.id.slice(0, 4)}`,
          name: 'Vị trí thử nghiệm',
          type: 'BIN',
          isActive: true,
        })),
      },
      idempotencyRecord: {
        create: vi.fn().mockResolvedValue({ id: 'idem-1' }),
        update: vi.fn().mockResolvedValue({ id: 'idem-1' }),
      },
      stockTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'tx-adj-001',
          transactionNumber: 'TX-20261013-0001',
          type: 'ADJUSTMENT',
          status: 'COMPLETED',
          notes: 'Kiểm kê kho',
          createdAt: new Date(),
        }),
      },
      stockTransactionDetail: {
        create: vi.fn().mockResolvedValue({ id: 'detail-001' }),
      },
      stockBalance: {
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          for (const [k, v] of mockBalances.entries()) {
            if (v.id === where.id) {
              v.onHand = data.onHand;
              return { ...v };
            }
          }
          return { id: where.id, ...data };
        }),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({ id: 'mov-001' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-001' }),
      },
    };

    // Spy on prisma.$transaction to execute our mockTx
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return await cb(mockTx);
    });

    // Default precheck passes
    vi.spyOn(idempotencyService, 'handlePrecheck').mockResolvedValue({
      action: 'PROCEED',
      requestHash: 'mock-hash-1234',
    } as any);
  });

  // =========================================================================
  // TC-CONC-ADJ-01: Hai thủ kho cùng kiểm kê (Concurrent Inventory Count)
  // =========================================================================
  it('TC-CONC-ADJ-01: rejects second concurrent adjustment with HTTP 409 CONCURRENT_STOCK_MODIFICATION when snapshot is stale', async () => {
    // Both user A and B opened form at onHand = 100.
    // User A already committed actual = 95. The current row on DB is now 95.
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 95, // Changed by user A
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    // User B submits expecting onHand = 100, actual = 90
    const inputB: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Thủ kho B kiểm đếm cuối ngày',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 100, // Stale! Current is 95
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 90,
        },
      ],
    };

    try {
      await stockTransactionsService.adjustStock(inputB, userId, 'KEY-CONC-01');
      expect.fail('Expected 409 error was not thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(409);
      expect(err.details?.errorCode).toBe('CONCURRENT_STOCK_MODIFICATION');
      expect(err.details?.conflict?.expectedSnapshot?.onHand).toBe(100);
      expect(err.details?.conflict?.currentSnapshot?.onHand).toBe(95);
      expect(mockTx.stockTransaction.create).not.toHaveBeenCalled();
    }
  });

  // =========================================================================
  // TC-CONC-ADJ-02: Export trong lúc kiểm kê (Export during physical count)
  // =========================================================================
  it('TC-CONC-ADJ-02: rejects adjustment with HTTP 409 when export transaction reduced onHand during count', async () => {
    // User started count at onHand = 100. An export of 20 occurred -> onHand = 80.
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 80, // Reduced by export
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê định kỳ tháng',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 100, // Stale snapshot
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 95,
        },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-02')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: {
          expectedSnapshot: { onHand: 100 },
          currentSnapshot: { onHand: 80 },
        },
      },
    });
  });

  // =========================================================================
  // TC-CONC-ADJ-03: Import trong lúc kiểm kê (Import during physical count)
  // =========================================================================
  it('TC-CONC-ADJ-03: rejects adjustment with HTTP 409 when import transaction increased onHand during count', async () => {
    // User started count at onHand = 50. Import of 50 occurred -> onHand = 100.
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 100, // Increased by import
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê định kỳ tuần',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 50, // Stale snapshot
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 60,
        },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-03')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: {
          expectedSnapshot: { onHand: 50 },
          currentSnapshot: { onHand: 100 },
        },
      },
    });
  });

  // =========================================================================
  // TC-CONC-ADJ-04: Transfer trong lúc kiểm kê (Transfer into destination during count)
  // =========================================================================
  it('TC-CONC-ADJ-04: rejects adjustment with HTTP 409 when transfer into location occurred during count', async () => {
    // Location had 10. Transfer of 5 into destination arrived -> onHand = 15.
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 15,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê vị trí đích',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 10, // Stale snapshot
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 12,
        },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-04')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: {
          expectedSnapshot: { onHand: 10 },
          currentSnapshot: { onHand: 15 },
        },
      },
    });
  });

  // =========================================================================
  // TC-CONC-ADJ-05: Reserved / Quarantined / KitAllocated thay đổi
  // =========================================================================
  it('TC-CONC-ADJ-05: rejects adjustment with HTTP 409 when committed allocations change during count', async () => {
    // onHand is still 100, but reserved increased from 2 to 8 due to approved borrow request
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 100,
      reserved: 8, // Changed!
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê định kỳ lab',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 100,
          expectedReserved: 2, // Stale! Current is 8
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 95,
        },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-05')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: {
          expectedSnapshot: { reserved: 2 },
          currentSnapshot: { reserved: 8 },
        },
      },
    });
  });

  // =========================================================================
  // TC-CONC-ADJ-06: Multi-line rollback (All-or-nothing on conflict)
  // =========================================================================
  it('TC-CONC-ADJ-06: rolls back entire multi-line voucher if any single line has snapshot conflict', async () => {
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 20,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });
    mockBalances.set(`${item2Id}:${loc1Id}`, {
      id: 'bal-002',
      itemId: item2Id,
      locationId: loc1Id,
      onHand: 30,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });
    // Item 3 has been modified on server: onHand is 35 (expected 40)
    mockBalances.set(`${item3Id}:${loc1Id}`, {
      id: 'bal-003',
      itemId: item3Id,
      locationId: loc1Id,
      onHand: 35,
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê 3 mặt hàng cùng lúc',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 20,
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 25,
        },
        {
          itemId: item2Id,
          expectedOnHand: 30,
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 28,
        },
        {
          itemId: item3Id,
          expectedOnHand: 40, // Mismatch! current is 35
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 42,
        },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-06')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: { itemId: item3Id },
      },
    });

    // Zero balance updates must have been executed
    expect(mockTx.stockBalance.update).not.toHaveBeenCalled();
    expect(mockTx.stockTransaction.create).not.toHaveBeenCalled();
    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
  });

  // =========================================================================
  // TC-CONC-ADJ-07: Idempotent replay
  // =========================================================================
  it('TC-CONC-ADJ-07: returns cached response without re-executing snapshot checks or creating duplicate tx on replay', async () => {
    const cachedData = {
      id: 'tx-cached-001',
      transactionNumber: 'TX-20261013-CACHED',
      type: 'ADJUSTMENT',
      status: 'COMPLETED',
      itemCount: 1,
    };

    vi.spyOn(idempotencyService, 'handlePrecheck').mockResolvedValueOnce({
      action: 'RETURN_CACHED',
      statusCode: 200,
      cachedResponse: cachedData,
    } as any);

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Replay request',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 100,
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 95,
        },
      ],
    };

    const res = await stockTransactionsService.adjustStock(input, userId, 'KEY-REPLAY-07');
    expect(res.cached).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual(cachedData);

    // Prisma transaction was never called
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // =========================================================================
  // TC-CONC-ADJ-08: ABA residual risk verification
  // =========================================================================
  it('TC-CONC-ADJ-08: documents ABA residual risk: adjustment succeeds when intermediate mutations return to original snapshot value', async () => {
    // ABA scenario:
    // Initial: 100
    // Step B (Export): 100 -> 80
    // Step C (Import): 80 -> 100
    // Value is 100 again.
    mockBalances.set(`${item1Id}:${loc1Id}`, {
      id: 'bal-001',
      itemId: item1Id,
      locationId: loc1Id,
      onHand: 100, // Returned to original value
      reserved: 0,
      quarantined: 0,
      kitAllocated: 0,
      borrowed: 0,
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê kịch bản ABA',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 100, // Matches current!
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 95,
        },
      ],
    };

    const res = await stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-08');
    expect(res.cached).toBe(false);
    expect(res.statusCode).toBe(201);
    expect(mockTx.stockTransaction.create).toHaveBeenCalled();
    // Confirms and documents known limitation: Snapshot validation alone does not detect ABA cycles without balanceVersion
  });

  // =========================================================================
  // TC-CONC-ADJ-09: Non-existent balance handling (Initial stock = 0)
  // =========================================================================
  it('TC-CONC-ADJ-09: verifies initial balance creation handling (expected 0 succeeds, expected > 0 conflicts with 409)', async () => {
    const newItemId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    // Does not exist in mockBalances Map

    // 9A: User counts newly discovered item with expected 0 -> succeeds
    const inputValid: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê linh kiện mới xuất hiện',
      items: [
        {
          itemId: newItemId,
          expectedOnHand: 0, // Correct: balance does not exist yet (0)
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 10,
        },
      ],
    };

    const res = await stockTransactionsService.adjustStock(inputValid, userId, 'KEY-CONC-09A');
    expect(res.statusCode).toBe(201);
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalled();

    // 9B: Another non-existent item with stale expectation 10 -> fails 409
    const nonExistentItemB = 'eeeeeeee-1111-2222-3333-444444444444';
    const inputInvalid: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê kỳ vọng sai',
      items: [
        {
          itemId: nonExistentItemB,
          expectedOnHand: 10, // Incorrect! It does not exist in DB (initial is 0)
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 15,
        },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(inputInvalid, userId, 'KEY-CONC-09B')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: {
          expectedSnapshot: { onHand: 10 },
          currentSnapshot: { onHand: 0 },
        },
      },
    });
  });

  // =========================================================================
  // TC-CONC-ADJ-10: 409 Idempotency vs Concurrency differentiation
  // =========================================================================
  it('TC-CONC-ADJ-10: verifies clear distinction between IDEMPOTENCY_IN_PROGRESS and CONCURRENT_STOCK_MODIFICATION', async () => {
    // 10A: Idempotency conflict (same key in progress)
    vi.spyOn(mockTx.idempotencyRecord, 'create').mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['key'] },
    });

    const input: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê phân biệt 409',
      items: [
        {
          itemId: item1Id,
          expectedOnHand: 100,
          expectedReserved: 0,
          expectedQuarantined: 0,
          expectedKitAllocated: 0,
          actualOnHand: 90,
        },
      ],
    };

    try {
      await stockTransactionsService.adjustStock(input, userId, 'KEY-CONC-10');
      expect.fail('Should fail with idempotency conflict');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('đang được xử lý đồng thời');
      // Not a snapshot conflict!
      expect(err.details?.errorCode).toBeUndefined();
    }
  });

  // =========================================================================
  // TC-CONC-ADJ-11: Conflict ở dòng cuối của phiếu nhiều dòng
  // =========================================================================
  it('TC-CONC-ADJ-11: triggers 409 when conflict occurs on the last line of a 5-item voucher, identifying exact conflicting item', async () => {
    // Populate items 1 to 4 matching snapshots
    mockBalances.set(`${item1Id}:${loc1Id}`, { id: 'b1', itemId: item1Id, locationId: loc1Id, onHand: 10, reserved: 0, quarantined: 0, kitAllocated: 0, borrowed: 0 });
    mockBalances.set(`${item2Id}:${loc1Id}`, { id: 'b2', itemId: item2Id, locationId: loc1Id, onHand: 20, reserved: 0, quarantined: 0, kitAllocated: 0, borrowed: 0 });
    mockBalances.set(`${item3Id}:${loc1Id}`, { id: 'b3', itemId: item3Id, locationId: loc1Id, onHand: 30, reserved: 0, quarantined: 0, kitAllocated: 0, borrowed: 0 });
    mockBalances.set(`${item4Id}:${loc1Id}`, { id: 'b4', itemId: item4Id, locationId: loc1Id, onHand: 40, reserved: 0, quarantined: 0, kitAllocated: 0, borrowed: 0 });
    // Item 5 has server-side modification: current is 45 instead of 50
    mockBalances.set(`${item5Id}:${loc1Id}`, { id: 'b5', itemId: item5Id, locationId: loc1Id, onHand: 45, reserved: 0, quarantined: 0, kitAllocated: 0, borrowed: 0 });

    const input5Items: AdjustStockInputV2 = {
      locationId: loc1Id,
      reason: 'Kiểm kê 5 mặt hàng liên tiếp',
      items: [
        { itemId: item1Id, expectedOnHand: 10, expectedReserved: 0, expectedQuarantined: 0, expectedKitAllocated: 0, actualOnHand: 12 },
        { itemId: item2Id, expectedOnHand: 20, expectedReserved: 0, expectedQuarantined: 0, expectedKitAllocated: 0, actualOnHand: 22 },
        { itemId: item3Id, expectedOnHand: 30, expectedReserved: 0, expectedQuarantined: 0, expectedKitAllocated: 0, actualOnHand: 32 },
        { itemId: item4Id, expectedOnHand: 40, expectedReserved: 0, expectedQuarantined: 0, expectedKitAllocated: 0, actualOnHand: 42 },
        { itemId: item5Id, expectedOnHand: 50, expectedReserved: 0, expectedQuarantined: 0, expectedKitAllocated: 0, actualOnHand: 52 },
      ],
    };

    await expect(
      stockTransactionsService.adjustStock(input5Items, userId, 'KEY-CONC-11')
    ).rejects.toMatchObject({
      statusCode: 409,
      details: {
        errorCode: 'CONCURRENT_STOCK_MODIFICATION',
        conflict: {
          itemId: item5Id,
          expectedSnapshot: { onHand: 50 },
          currentSnapshot: { onHand: 45 },
        },
      },
    });

    // Zero balance updates should occur
    expect(mockTx.stockBalance.update).not.toHaveBeenCalled();
    expect(mockTx.stockTransaction.create).not.toHaveBeenCalled();
  });
});
