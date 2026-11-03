import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for ACM Phase 2.2 / Step 4B.4C.
 * Mode B Real Read-Only Browser E2E.
 *
 * Dedicated Environment:
 * - Frontend: http://127.0.0.1:4175 (Preview dist-mode-b)
 * - Backend:  http://127.0.0.1:5001 (Test API connecting strictly to acm_inventory_test)
 * - Strict Network Mutation Guard (Zero POST/PUT/PATCH/DELETE)
 * - Zero Socket Egress to Dev Port 5000 or External Hosts
 */
export default defineConfig({
  testDir: './playwright/tests-mode-b',
  fullyParallel: false, // Run sequentially for predictable verification
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Single worker avoids database read interference
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-mode-b' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'off', // Evidence security: traces OFF to prevent credential leaks
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block', // Strictly block service workers
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx scripts/startModeBTestServer.ts',
      cwd: '../api',
      url: 'http://127.0.0.1:5001/api/v1/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npx vite preview --outDir dist-mode-b --port 4175 --host 127.0.0.1',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
