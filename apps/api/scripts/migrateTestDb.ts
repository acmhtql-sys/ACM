import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { assertSafeTestDatabaseUrl, sanitizeDatabaseUrl } from '../src/config/databaseGuard';

async function runTestMigration() {
  console.log('🔍 [ACM Migration] Preparing to deploy migrations to Test Database...');

  const testEnvPath = path.resolve(__dirname, '../.env.test');
  const rootTestEnvPath = path.resolve(__dirname, '../../../.env.test');

  const resolvedEnv = fs.existsSync(testEnvPath) ? testEnvPath : rootTestEnvPath;
  let testDbUrl = process.env.DATABASE_URL;

  if (fs.existsSync(resolvedEnv)) {
    const envConfig = dotenv.parse(fs.readFileSync(resolvedEnv));
    testDbUrl = envConfig.DATABASE_URL || testDbUrl;
  } else if (!process.env.CI) {
    console.error('❌ [ACM Migration] Error: .env.test was not found. Migration aborted.');
    process.exit(1);
  }

  // Strict verification: Target must be isolated test database
  try {
    assertSafeTestDatabaseUrl(testDbUrl);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  console.log(`✅ [ACM Migration] Target Database Verified: "acm_inventory_test"`);
  console.log(`📡 [ACM Migration] Target Connection: ${sanitizeDatabaseUrl(testDbUrl)}`);
  console.log('🚀 [ACM Migration] Executing "prisma migrate deploy"...');

  try {
    execSync('npx prisma migrate deploy', {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
      },
      stdio: 'inherit',
    });
    console.log('🎉 [ACM Migration] Migrations deployed successfully to acm_inventory_test!');
  } catch (err: any) {
    console.error('❌ [ACM Migration] Migration deploy failed:', err.message);
    process.exit(1);
  }
}

runTestMigration();
