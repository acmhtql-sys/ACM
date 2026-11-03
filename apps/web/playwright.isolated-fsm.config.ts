import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for ACM Step 4B.4B+ Positive FSM Browser E2E.
 * Dedicated isolated environment:
 * - Host: 127.0.0.1 (Loopback)
 * - Port: 4174 (Strictly separate from standard 4173)
 * - Zero Backend connection (no port 5000 / 5001)
 * - Strict Default-Deny Network Guard
 * - reuseExistingServer: false
 */
export default defineConfig({
  testDir: './playwright/tests',
  fullyParallel: false, // Run sequentially for deterministic execution
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Single worker prevents mock interference
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-fsm' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4174',
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
  webServer: {
    command: 'npx vite preview --outDir dist-isolated-mock-e2e --port 4174 --host 127.0.0.1',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
