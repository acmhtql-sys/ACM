import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

if (isTest) {
  // Load .env.test strictly for test environment
  const apiTestEnv = path.resolve(__dirname, '../../.env.test');
  const rootTestEnv = path.resolve(__dirname, '../../../.env.test');

  if (fs.existsSync(apiTestEnv)) {
    dotenv.config({ path: apiTestEnv, override: true });
  } else if (fs.existsSync(rootTestEnv)) {
    dotenv.config({ path: rootTestEnv, override: true });
  } else {
    console.error('❌ FATAL: .env.test not found. Test suite aborted to prevent accidental database corruption.');
    process.exit(1);
  }
} else {
  // Load development/production .env
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  dotenv.config();
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    API_PREFIX: z.string().default('/api/v1'),
    CORS_ORIGIN: z.string().default('*'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(8).default('acm-default-jwt-secret-for-dev-only-min-32chars'),
    JWT_EXPIRES_IN: z.string().default('1d'),
    LOG_LEVEL: z.string().default('info'),
  })
  .superRefine((data, ctx) => {
    if (isTest || data.NODE_ENV === 'test') {
      // Safety check: tests must strictly target acm_inventory_test and never the dev/prod databases
      if (!data.DATABASE_URL.includes('acm_inventory_test')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'SAFETY VIOLATION: Test environment DATABASE_URL must target "acm_inventory_test". Never run tests against development or production databases.',
          path: ['DATABASE_URL'],
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`   - [${issue.path.join('.')}] ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
