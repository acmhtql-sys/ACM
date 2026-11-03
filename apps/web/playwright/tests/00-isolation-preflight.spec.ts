import { test, expect } from '@playwright/test';
import {
  setupModeANetworkGuard,
  getIsolationViolations,
  clearIsolationViolations,
  registerCustomMockHandler,
  clearCustomMockHandlers,
} from '../support/network-guard';

test.describe('Phân hệ 0: Negative Isolation Preflight (PREFLIGHT)', () => {
  test.beforeEach(async ({ page }) => {
    clearIsolationViolations();
    clearCustomMockHandlers();
    await setupModeANetworkGuard(page);
  });

  test('E2E-PREFLIGHT-01: Kiểm tra cấu hình baseURL runtime và nguồn gốc loopback', async ({
    page,
  }) => {
    await page.goto('/login');

    // Verify page is on isolated loopback port 4174
    const pageUrl = page.url();
    expect(pageUrl).toContain('127.0.0.1:4174');
    expect(pageUrl).not.toContain(':5000');
    expect(pageUrl).not.toContain(':5001');

    // Check frontend API baseURL by inspecting document and verifying no direct leaks to backend ports
    const currentOrigin = await page.evaluate(() => window.location.origin);
    expect(currentOrigin).toBe('http://127.0.0.1:4174');
  });

  test('E2E-PREFLIGHT-02: Unmocked GET API bị chặn với blockedbyclient và ghi nhận vi phạm', async ({
    page,
  }) => {
    await page.goto('/login');

    const error = await page.evaluate(async () => {
      try {
        await fetch('/api/v1/unmocked-preflight-get');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    expect(error).toBeTruthy();
    expect(error).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    const violations = getIsolationViolations();
    const violation = violations.find((v) =>
      v.url.includes('/api/v1/unmocked-preflight-get')
    );
    expect(violation).toBeDefined();
    expect(violation?.method).toBe('GET');
  });

  test('E2E-PREFLIGHT-03: Unmocked POST API bị chặn với blockedbyclient và ghi nhận vi phạm', async ({
    page,
  }) => {
    await page.goto('/login');

    const error = await page.evaluate(async () => {
      try {
        await fetch('/api/v1/stock-transactions/unmocked-preflight-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true }),
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    expect(error).toBeTruthy();
    expect(error).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    const violations = getIsolationViolations();
    const violation = violations.find((v) =>
      v.url.includes('/api/v1/stock-transactions/unmocked-preflight-post')
    );
    expect(violation).toBeDefined();
    expect(violation?.method).toBe('POST');
  });

  test('E2E-PREFLIGHT-04: Mutation same-origin ngoài API path bị chặn tuyệt đối', async ({
    page,
  }) => {
    await page.goto('/login');

    const error = await page.evaluate(async () => {
      try {
        await fetch('/static/malicious-mutation', {
          method: 'POST',
          body: 'malicious-data',
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    expect(error).toBeTruthy();
    expect(error).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    const violations = getIsolationViolations();
    const violation = violations.find((v) =>
      v.url.includes('/static/malicious-mutation')
    );
    expect(violation).toBeDefined();
    expect(violation?.method).toBe('POST');
  });

  test('E2E-PREFLIGHT-05: External Origin bị chặn tuyệt đối với blockedbyclient', async ({
    page,
  }) => {
    await page.goto('/login');

    const error = await page.evaluate(async () => {
      try {
        await fetch('https://malicious-external-egress.com/leak-check');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    expect(error).toBeTruthy();
    expect(error).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    const violations = getIsolationViolations();
    const violation = violations.find((v) =>
      v.url.includes('malicious-external-egress.com')
    );
    expect(violation).toBeDefined();
  });

  test('E2E-PREFLIGHT-06: Mọi request hướng tới Backend port 5000/5001 bị chặn lập tức', async ({
    page,
  }) => {
    await page.goto('/login');

    // Attempt port 5000
    const devPortError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5000/api/v1/inventory/summary');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(devPortError).toBeTruthy();
    expect(devPortError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // Attempt port 5001
    const testPortError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5001/api/v1/inventory/summary');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(testPortError).toBeTruthy();
    expect(testPortError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    const violations = getIsolationViolations();
    expect(violations.some((v) => v.url.includes(':5000'))).toBe(true);
    expect(violations.some((v) => v.url.includes(':5001'))).toBe(true);
  });

  test('E2E-PREFLIGHT-07: Mock POST được route.fulfill() an toàn mà không kết nối Backend', async ({
    page,
  }) => {
    let mockPostDispatched = false;

    registerCustomMockHandler('/api/v1/test-synthetic-mutation', async (route, req) => {
      if (req.method() === 'POST') {
        mockPostDispatched = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, synthetic: true }),
        });
        return true;
      }
      return false;
    });

    await page.goto('/login');

    const result = await page.evaluate(async () => {
      const resp = await fetch('/api/v1/test-synthetic-mutation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'preflight' }),
      });
      return await resp.json();
    });

    expect(mockPostDispatched).toBe(true);
    expect(result).toEqual({ success: true, synthetic: true });

    // Ensure NO isolation violations recorded for this synthetic fulfilled request
    const violations = getIsolationViolations();
    expect(violations.some((v) => v.url.includes('/api/v1/test-synthetic-mutation'))).toBe(false);
  });
});
