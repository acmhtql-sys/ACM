import { beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { env } from '../src/config/env';
import { assertSafeTestDatabaseUrl, assertRuntimeDatabaseIsTest } from '../src/config/databaseGuard';

beforeAll(async () => {
  // 1. Strict Database URL verification
  assertSafeTestDatabaseUrl(env.DATABASE_URL);

  // 2. Strict Live Connection verification
  const status = await checkDatabaseConnection();
  if (!status.connected) {
    throw new Error(
      `❌ TEST DATABASE CONNECTION FAILED: Unable to reach "acm_inventory_test": ${status.error}. Tests aborted.`
    );
  }

  // 3. Confirm target database identity
  const currentDbResult: any = await prisma.$queryRaw`SELECT current_database() as db;`;
  const currentDb = currentDbResult[0]?.db;

  assertRuntimeDatabaseIsTest(currentDb);

  console.log(`🔒 [Test Setup] Verified test execution strictly inside "${currentDb}".`);
});
