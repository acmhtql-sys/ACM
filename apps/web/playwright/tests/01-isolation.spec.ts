import { test, expect } from '@playwright/test';
import {
  setupModeANetworkGuard,
  getIsolationViolations,
  clearIsolationViolations,
} from '../support/network-guard';

test.describe('Phân hệ 1: Network Isolation Guards (ISO)', () => {
  test.beforeEach(async ({ page }) => {
    clearIsolationViolations();
    await setupModeANetworkGuard(page);
  });

  test('E2E-ISO-01: Ca kiểm thử âm tính chứng minh cách ly mạng Mode A (Default-Deny)', async ({
    page,
  }) => {
    // Navigate to local Vite preview
    await page.goto('/login');

    // Attempt to invoke an unmocked API path from page context
    const fetchError = await page.evaluate(async () => {
      try {
        await fetch('/api/v1/unmocked-leak-check');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    // The fetch must reject because Playwright aborted it with 'blockedbyclient'
    expect(fetchError).toBeTruthy();
    expect(fetchError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // Verify the isolation guard logged and recorded the violation
    const violations = getIsolationViolations();
    expect(violations.length).toBeGreaterThan(0);
    const leakCheckViolation = violations.find((v) =>
      v.url.includes('/api/v1/unmocked-leak-check')
    );
    expect(leakCheckViolation).toBeDefined();
    expect(leakCheckViolation?.method).toBe('GET');

    // Attempt to invoke an external/port 5000 destination
    const externalFetchError = await page.evaluate(async () => {
      try {
        await fetch('http://localhost:5000/api/v1/unauthorized-leak-attempt');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    expect(externalFetchError).toBeTruthy();
    expect(externalFetchError).toMatch(/Failed to fetch|NetworkError|Load failed/i);
  });

  test.skip('E2E-ISO-02: Ca kiểm thử âm tính chứng minh chặn mutation Mode B (Deferred to Mode B)', async () => {
    // Mode B Real Read-Only verification is deferred until Mode B authorization
  });
});
