import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// Read JWT secret from .env.test securely at runtime without leaking into logs or client bundles
let jwtSecret = '';
try {
  const envTestPath = path.resolve('../../.env.test');
  if (fs.existsSync(envTestPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envTestPath));
    if (parsed.JWT_SECRET) {
      jwtSecret = parsed.JWT_SECRET;
    }
  }
} catch {
  // Ignored
}

if (!jwtSecret) {
  throw new Error('FATAL: JWT_SECRET could not be loaded from .env.test for test auth injection');
}

export const REAL_TEST_USERS = {
  admin: {
    id: 'abb09fa5-51b2-4911-924f-46fbb1a81c81',
    email: 'admin@acm.local',
    role: 'ADMIN' as const,
    fullName: 'System Administrator',
  },
  manager: {
    id: '022e0181-9815-4201-a837-468a9ed406b0',
    email: 'manager@acm.local',
    role: 'LAB_MANAGER' as const,
    fullName: 'Lab Manager',
  },
  tech: {
    id: '196db653-f803-4cb2-8266-7518782ffb1f',
    email: 'tech@acm.local',
    role: 'TECHNICIAN' as const,
    fullName: 'Technician Instructor',
  },
  student: {
    id: '85b07061-8b63-4ce8-beb5-25b869b39977',
    email: 'student@acm.local',
    role: 'STUDENT' as const,
    fullName: 'Nguyen Van A (Student)',
  },
};

export type RealRoleKey = keyof typeof REAL_TEST_USERS;

/**
 * Creates cryptographically valid JWT in Node.js test process and injects into browser localStorage.
 * Zero network POST dispatched by browser.
 */
export async function injectRealTestAuthSession(
  page: Page,
  roleKey: RealRoleKey = 'admin'
): Promise<void> {
  const user = REAL_TEST_USERS[roleKey];
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    },
    jwtSecret,
    { expiresIn: '8h' }
  );

  await page.goto('/login');
  await page.evaluate(
    ({ t, u }) => {
      localStorage.setItem('acm_token', t);
      localStorage.setItem('acm_user', JSON.stringify(u));
    },
    { t: token, u: user }
  );
}

/**
 * Clears authentication session in browser localStorage.
 */
export async function clearRealTestAuthSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('acm_token');
    localStorage.removeItem('acm_user');
  });
}
