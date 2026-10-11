import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

function sanitizeUrl(url: string): string {
  return url.replace(/postgresql:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/, 'postgresql://$1:****@$3/$4');
}

async function runTestMigration() {
  console.log('🔍 [ACM Migration] Preparing to deploy migrations to Test Database...');

  const testEnvPath = path.resolve(__dirname, '../.env.test');
  const rootTestEnvPath = path.resolve(__dirname, '../../../.env.test');

  const resolvedEnv = fs.existsSync(testEnvPath) ? testEnvPath : rootTestEnvPath;
  if (!fs.existsSync(resolvedEnv)) {
    console.error('❌ [ACM Migration] Error: .env.test was not found. Migration aborted.');
    process.exit(1);
  }

  const envConfig = dotenv.parse(fs.readFileSync(resolvedEnv));
  const testDbUrl = envConfig.DATABASE_URL;

  if (!testDbUrl) {
    console.error('❌ [ACM Migration] Error: DATABASE_URL is missing in .env.test. Migration aborted.');
    process.exit(1);
  }

  // Strict verification: Target must contain acm_inventory_test
  if (!testDbUrl.includes('acm_inventory_test')) {
    console.error('❌ [ACM Migration] CRITICAL SAFETY ABORT:');
    console.error(`   Target URL (${sanitizeUrl(testDbUrl)}) does not target "acm_inventory_test"!`);
    console.error('   Aborting to prevent applying migrations to wrong database.');
    process.exit(1);
  }

  // Safety check: ensure not pointing to development acm_inventory
  if (testDbUrl.match(/\/acm_inventory(\?|$)/)) {
    console.error('❌ [ACM Migration] CRITICAL SAFETY ABORT: Target points to development database "acm_inventory". Aborted.');
    process.exit(1);
  }

  console.log(`✅ [ACM Migration] Target Database Verified: "acm_inventory_test"`);
  console.log(`📡 [ACM Migration] Target Connection: ${sanitizeUrl(testDbUrl)}`);
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
