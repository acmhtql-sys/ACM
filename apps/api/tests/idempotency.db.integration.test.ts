import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import crypto from 'crypto';

describe('ACM Phase 2.2 Step 3B.2A Database Migration & Idempotency Integration Test Suite', () => {
  let adminUserId = '';
  let testLocationFromId = '';
  let testLocationToId = '';
  let testItemId = '';

  const testKeyPrefix = `TEST-IDEM-${Date.now()}`;
  const testTxNumberPrefix = `TX-TEST-${Date.now()}`;

  beforeAll(async () => {
    // 1. Verify isolated test database
    const dbStatus = await checkDatabaseConnection();
    expect(dbStatus.connected).toBe(true);

    const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    expect(currentDbResult[0]?.db).toBe('acm_inventory_test');

    // 2. Fetch admin user
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@acm.local' },
    });
    expect(adminUser).not.toBeNull();
    adminUserId = adminUser!.id;

    // 3. Fetch test locations & item (specifically permanent seed data)
    const locations = await prisma.location.findMany({
      where: { code: { in: ['WH-MAIN', 'RACK-A'] } },
      orderBy: { code: 'asc' },
    });
    expect(locations.length).toBe(2);
    testLocationFromId = locations[0].id;
    testLocationToId = locations[1].id;

    const item = await prisma.item.findFirst({
      where: { code: 'ARD-UNO-R3' },
    });
    expect(item).not.toBeNull();
    testItemId = item!.id;
  });

  afterAll(async () => {
    // Thorough cleanup of all test records in proper FK dependency order
    try {
      // 1. Delete test idempotency records
      await prisma.$executeRawUnsafe(
        `DELETE FROM idempotency_records WHERE key LIKE 'TEST-IDEM-%'`
      );

      // 2. Delete test stock transaction details
      await prisma.$executeRawUnsafe(
        `DELETE FROM stock_transaction_details WHERE "stockTransactionId" IN (
          SELECT id FROM stock_transactions WHERE "transactionNumber" LIKE 'TX-TEST-%'
        )`
      );

      // 3. Delete test stock transactions
      await prisma.$executeRawUnsafe(
        `DELETE FROM stock_transactions WHERE "transactionNumber" LIKE 'TX-TEST-%'`
      );
    } catch (err) {
      console.error('Error during test cleanup:', err);
    }
  });

  // =========================================================================
  // 1. BASIC CRUD & IDEMPOTENCY RECORD LIFECYCLE
  // =========================================================================
  it('TC-MIG-01: successfully creates a valid IdempotencyRecord with PENDING status', async () => {
    const key = `${testKeyPrefix}-01`;
    const requestHash = crypto.createHash('sha256').update(`${adminUserId}:POST:/import:{}`).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const record = await prisma.idempotencyRecord.create({
      data: {
        key,
        userId: adminUserId,
        endpoint: '/api/v1/inventory/import',
        requestHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    expect(record.id).toBeDefined();
    expect(record.key).toBe(key);
    expect(record.status).toBe('PENDING');
    expect(record.userId).toBe(adminUserId);
    expect(record.requestHash).toBe(requestHash);
    expect(record.transactionId).toBeNull();
    expect(record.responseBody).toBeNull();
    expect(new Date(record.expiresAt).getTime()).toBeGreaterThan(new Date(record.createdAt).getTime());
  });

  it('TC-MIG-02: updates IdempotencyRecord to COMPLETED with linked StockTransaction and responseBody', async () => {
    const key = `${testKeyPrefix}-02`;
    const txNumber = `${testTxNumberPrefix}-02`;
    const requestHash = crypto.createHash('sha256').update('hash-02').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 1. Create PENDING record
    const record = await prisma.idempotencyRecord.create({
      data: {
        key,
        userId: adminUserId,
        endpoint: '/api/v1/inventory/import',
        requestHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    // 2. Create StockTransaction
    const tx = await prisma.stockTransaction.create({
      data: {
        transactionNumber: txNumber,
        type: 'IMPORT',
        createdById: adminUserId,
        notes: 'Integration test migration transaction',
      },
    });

    // 3. Mark COMPLETED
    const updated = await prisma.idempotencyRecord.update({
      where: { key },
      data: {
        status: 'COMPLETED',
        transactionId: tx.id,
        responseBody: { success: true, message: 'Nhập kho thành công', transactionNumber: txNumber },
        statusCode: 201,
      },
    });

    expect(updated.status).toBe('COMPLETED');
    expect(updated.transactionId).toBe(tx.id);
    expect(updated.statusCode).toBe(201);
    expect((updated.responseBody as any).transactionNumber).toBe(txNumber);
  });

  it('TC-MIG-03: allows updating IdempotencyRecord to FAILED when transaction fails', async () => {
    const key = `${testKeyPrefix}-03`;
    const requestHash = crypto.createHash('sha256').update('hash-03').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.idempotencyRecord.create({
      data: {
        key,
        userId: adminUserId,
        endpoint: '/api/v1/inventory/export',
        requestHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    const failed = await prisma.idempotencyRecord.update({
      where: { key },
      data: {
        status: 'FAILED',
        statusCode: 400,
        responseBody: { error: 'Tồn kho khả dụng không đủ để xuất' },
      },
    });

    expect(failed.status).toBe('FAILED');
    expect(failed.statusCode).toBe(400);
  });

  // =========================================================================
  // 2. UNIQUE CONSTRAINTS
  // =========================================================================
  it('TC-MIG-04: rejects duplicate key with Prisma P2002 Unique Constraint violation', async () => {
    const key = `${testKeyPrefix}-04`;
    const requestHash = crypto.createHash('sha256').update('hash-04').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // First insert succeeds
    await prisma.idempotencyRecord.create({
      data: {
        key,
        userId: adminUserId,
        endpoint: '/api/v1/inventory/import',
        requestHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    // Second insert with SAME key must fail
    await expect(
      prisma.idempotencyRecord.create({
        data: {
          key,
          userId: adminUserId,
          endpoint: '/api/v1/inventory/import',
          requestHash,
          status: 'PENDING',
          expiresAt,
        },
      })
    ).rejects.toThrow();
  });

  // =========================================================================
  // 3. DATABASE CHECK CONSTRAINTS
  // =========================================================================
  it('TC-MIG-05: CHECK CONSTRAINT check_idempotency_status rejects invalid status', async () => {
    const key = `${testKeyPrefix}-05`;
    const requestHash = crypto.createHash('sha256').update('hash-05').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Raw SQL to bypass Prisma client validations and directly test PostgreSQL CHECK constraint
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO idempotency_records (id, key, user_id, endpoint, request_hash, status, created_at, expires_at)
        VALUES (gen_random_uuid(), '${key}', '${adminUserId}', '/test', '${requestHash}', 'INVALID_STATUS', NOW(), '${expiresAt}')
      `)
    ).rejects.toThrow(/check_idempotency_status/i);
  });

  it('TC-MIG-06: CHECK CONSTRAINT check_idempotency_expires_at rejects expires_at <= created_at', async () => {
    const key = `${testKeyPrefix}-06`;
    const requestHash = crypto.createHash('sha256').update('hash-06').digest('hex');

    // Attempt insert with expires_at in the past (< created_at)
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO idempotency_records (id, key, user_id, endpoint, request_hash, status, created_at, expires_at)
        VALUES (gen_random_uuid(), '${key}', '${adminUserId}', '/test', '${requestHash}', 'PENDING', NOW(), NOW() - INTERVAL '1 hour')
      `)
    ).rejects.toThrow(/check_idempotency_expires_at/i);
  });

  // =========================================================================
  // 4. FOREIGN KEY RESTRICT BEHAVIOR
  // =========================================================================
  it('TC-MIG-07: ON DELETE RESTRICT on user_id prevents deleting User while IdempotencyRecord exists', async () => {
    const key = `${testKeyPrefix}-07`;
    const requestHash = crypto.createHash('sha256').update('hash-07').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create temporary user
    const tempUser = await prisma.user.create({
      data: {
        email: `temp-${Date.now()}@acm.local`,
        passwordHash: 'dummy-hash',
        fullName: 'Temporary User For FK Test',
        roleId: (await prisma.role.findFirst({ where: { name: 'TECHNICIAN' } }))!.id,
      },
    });

    // Create idempotency record linked to temp user
    await prisma.idempotencyRecord.create({
      data: {
        key,
        userId: tempUser.id,
        endpoint: '/api/v1/inventory/transfer',
        requestHash,
        status: 'PENDING',
        expiresAt,
      },
    });

    // Attempting to delete tempUser must be RESTRICTED (rejected)
    await expect(
      prisma.user.delete({
        where: { id: tempUser.id },
      })
    ).rejects.toThrow();

    // Clean up record first, then user can be deleted
    await prisma.idempotencyRecord.delete({ where: { key } });
    await prisma.user.delete({ where: { id: tempUser.id } });
  });

  it('TC-MIG-08: ON DELETE RESTRICT on transaction_id prevents deleting StockTransaction while IdempotencyRecord exists', async () => {
    const key = `${testKeyPrefix}-08`;
    const txNumber = `${testTxNumberPrefix}-08`;
    const requestHash = crypto.createHash('sha256').update('hash-08').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const tx = await prisma.stockTransaction.create({
      data: {
        transactionNumber: txNumber,
        type: 'ADJUSTMENT',
        createdById: adminUserId,
      },
    });

    await prisma.idempotencyRecord.create({
      data: {
        key,
        userId: adminUserId,
        endpoint: '/api/v1/inventory/adjust',
        requestHash,
        status: 'COMPLETED',
        transactionId: tx.id,
        expiresAt,
      },
    });

    // Attempting to delete StockTransaction must be RESTRICTED
    await expect(
      prisma.stockTransaction.delete({
        where: { id: tx.id },
      })
    ).rejects.toThrow();

    // Cleanup: remove idempotency record, then tx
    await prisma.idempotencyRecord.delete({ where: { key } });
    await prisma.stockTransaction.delete({ where: { id: tx.id } });
  });

  it('TC-MIG-09: ON DELETE RESTRICT on to_location_id prevents deleting destination Location', async () => {
    const txNumber = `${testTxNumberPrefix}-09`;

    // Create temporary destination location
    const tempDestLocation = await prisma.location.create({
      data: {
        code: `LOC-DEST-${Date.now()}`,
        name: 'Temporary Destination Bin',
        type: 'BIN',
      },
    });

    const tx = await prisma.stockTransaction.create({
      data: {
        transactionNumber: txNumber,
        type: 'TRANSFER',
        createdById: adminUserId,
      },
    });

    // Create transaction detail using toLocationId
    const detail = await prisma.stockTransactionDetail.create({
      data: {
        stockTransactionId: tx.id,
        itemId: testItemId,
        locationId: testLocationFromId,
        toLocationId: tempDestLocation.id,
        quantity: 5,
      },
    });

    expect(detail.toLocationId).toBe(tempDestLocation.id);

    // Attempting to delete tempDestLocation must be RESTRICTED
    await expect(
      prisma.location.delete({
        where: { id: tempDestLocation.id },
      })
    ).rejects.toThrow();

    // Cleanup in reverse dependency order
    await prisma.stockTransactionDetail.delete({ where: { id: detail.id } });
    await prisma.stockTransaction.delete({ where: { id: tx.id } });
    await prisma.location.delete({ where: { id: tempDestLocation.id } });
  });

  // =========================================================================
  // 5. ATOMICITY & ROLLBACK
  // =========================================================================
  it('TC-MIG-10: TRANSACTION ATOMICITY rolls back IdempotencyRecord and StockTransaction together on failure', async () => {
    const key = `${testKeyPrefix}-10`;
    const txNumber = `${testTxNumberPrefix}-10`;
    const requestHash = crypto.createHash('sha256').update('hash-10').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Create IdempotencyRecord
        await tx.idempotencyRecord.create({
          data: {
            key,
            userId: adminUserId,
            endpoint: '/api/v1/inventory/transfer',
            requestHash,
            status: 'PENDING',
            expiresAt,
          },
        });

        // 2. Create StockTransaction
        await tx.stockTransaction.create({
          data: {
            transactionNumber: txNumber,
            type: 'TRANSFER',
            createdById: adminUserId,
          },
        });

        // 3. Deliberately throw an error to trigger rollback
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      });
    } catch (err: any) {
      expect(err.message).toBe('SIMULATED_TRANSACTION_FAILURE');
    }

    // Verify NEITHER record was persisted in DB
    const idCheck = await prisma.idempotencyRecord.findUnique({ where: { key } });
    const txCheck = await prisma.stockTransaction.findUnique({ where: { transactionNumber: txNumber } });

    expect(idCheck).toBeNull();
    expect(txCheck).toBeNull();
  });

  // =========================================================================
  // 6. CONCURRENT RACE CONDITION
  // =========================================================================
  it('TC-MIG-11: CONCURRENCY two simultaneous requests competing for same unique key (1 succeeds, 1 fails)', async () => {
    const key = `${testKeyPrefix}-11`;
    const requestHash = crypto.createHash('sha256').update('hash-11').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Launch two concurrent inserts for the EXACT same key
    const results = await Promise.allSettled([
      prisma.idempotencyRecord.create({
        data: {
          key,
          userId: adminUserId,
          endpoint: '/api/v1/inventory/import',
          requestHash,
          status: 'PENDING',
          expiresAt,
        },
      }),
      prisma.idempotencyRecord.create({
        data: {
          key,
          userId: adminUserId,
          endpoint: '/api/v1/inventory/import',
          requestHash,
          status: 'PENDING',
          expiresAt,
        },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and exactly one must fail due to Unique Constraint
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  // =========================================================================
  // 7. CLEANUP VERIFICATION
  // =========================================================================
  it('TC-MIG-12: verifies zero test records remain after suite execution', async () => {
    // Run cleanup
    await prisma.$executeRawUnsafe(
      `DELETE FROM idempotency_records WHERE key LIKE 'TEST-IDEM-%'`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM stock_transaction_details WHERE "stockTransactionId" IN (
        SELECT id FROM stock_transactions WHERE "transactionNumber" LIKE 'TX-TEST-%'
      )`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM stock_transactions WHERE "transactionNumber" LIKE 'TX-TEST-%'`
    );

    const lingeringIdem = await prisma.idempotencyRecord.count({
      where: { key: { startsWith: 'TEST-IDEM-' } },
    });
    const lingeringTx = await prisma.stockTransaction.count({
      where: { transactionNumber: { startsWith: 'TX-TEST-' } },
    });

    expect(lingeringIdem).toBe(0);
    expect(lingeringTx).toBe(0);
  });
});
