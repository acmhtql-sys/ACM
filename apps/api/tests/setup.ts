import { beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../src/config/database';
import { env } from '../src/config/env';

beforeAll(async () => {
  // 1. Strict Database URL verification
  if (!env.DATABASE_URL.includes('acm_inventory_test')) {
    throw new Error(
      '❌ FATAL TEST CONFIGURATION ERROR: Tests must exclusively run against "acm_inventory_test". ' +
      'Attempting to run against development or production database is strictly forbidden.'
    );
  }

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

  if (currentDb !== 'acm_inventory_test') {
    throw new Error(
      `❌ FATAL SAFETY ERROR: Connected to "${currentDb}" instead of "acm_inventory_test". Aborting all tests.`
    );
  }

  console.log(`🔒 [Test Setup] Verified test execution strictly inside "${currentDb}".`);
});
