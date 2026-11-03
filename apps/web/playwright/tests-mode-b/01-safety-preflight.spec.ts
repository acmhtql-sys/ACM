import { test, expect } from '@playwright/test';
import {
  setupModeBNetworkGuard,
  getModeBViolations,
  clearModeBViolations,
} from '../support/mode-b-network-guard';
import { injectRealTestAuthSession } from '../support/mode-b-auth';

test.describe('Mode B Phase 1: Safety Preflight & Mutation Guard (E2E-ISO-02)', () => {
  test.beforeEach(async ({ page }) => {
    clearModeBViolations();
    await setupModeBNetworkGuard(page);
    await injectRealTestAuthSession(page, 'admin');
  });

  test('E2E-ISO-02: Chặn triệt để mutation POST /api/v1/stock-transactions/import trên môi trường Real API', async ({
    page,
  }) => {
    await page.goto('/transactions');

    // Attempt direct browser mutation POST to real backend
    const postError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5001/api/v1/stock-transactions/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('acm_token')}`,
          },
          body: JSON.stringify({
            notes: 'Cố tình gửi mutation trái phép để kiểm tra guard',
            items: [],
          }),
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    // Request MUST be aborted with blockedbyclient
    expect(postError).toBeTruthy();
    expect(postError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // Violation must be recorded in Mode B collector
    const violations = getModeBViolations();
    expect(violations.length).toBeGreaterThan(0);

    const importViolation = violations.find(
      (v) =>
        v.url.includes('/api/v1/stock-transactions/import') && v.method === 'POST'
    );
    expect(importViolation).toBeDefined();
    expect(importViolation?.method).toBe('POST');
  });

  test('E2E-ISO-02-EXT: Chặn triệt để PUT, PATCH, DELETE và same-origin mutation', async ({
    page,
  }) => {
    await page.goto('/transactions');

    // 1. Attempt PUT to Backend
    const putError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5001/api/v1/locations/fake-id', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Malicious Edit' }),
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(putError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // 2. Attempt PATCH to Backend
    const patchError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5001/api/v1/locations/fake-id', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(patchError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // 3. Attempt DELETE to Backend
    const deleteError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5001/api/v1/locations/fake-id', {
          method: 'DELETE',
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(deleteError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // 4. Attempt POST on same-origin static path
    const staticPostError = await page.evaluate(async () => {
      try {
        await fetch('/static/malicious-post-attempt', {
          method: 'POST',
          body: 'malicious',
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(staticPostError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // 5. Attempt request to Dev API Port 5000
    const devPortError = await page.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5000/api/v1/health');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(devPortError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    // 6. Attempt request to external origin
    const externalError = await page.evaluate(async () => {
      try {
        await fetch('https://unauthorized-external-domain.com/leak');
        return null;
      } catch (err: any) {
        return err.message;
      }
    });
    expect(externalError).toMatch(/Failed to fetch|NetworkError|Load failed/i);

    const violations = getModeBViolations();
    expect(violations.some((v) => v.method === 'PUT')).toBe(true);
    expect(violations.some((v) => v.method === 'PATCH')).toBe(true);
    expect(violations.some((v) => v.method === 'DELETE')).toBe(true);
    expect(violations.some((v) => v.url.includes(':5000'))).toBe(true);
  });

  test('E2E-ISO-02-ALLOW: Cho phép truy vấn GET hợp lệ tới Test API 5001 và nhận dữ liệu thực', async ({
    page,
  }) => {
    await page.goto('/transactions');

    // Query real API GET /api/v1/inventory/summary
    const summaryData = await page.evaluate(async () => {
      const resp = await fetch('http://127.0.0.1:5001/api/v1/inventory/summary', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('acm_token')}`,
        },
      });
      return {
        status: resp.status,
        data: await resp.json(),
      };
    });

    expect(summaryData.status).toBe(200);
    expect(summaryData.data.success).toBe(true);
    expect(summaryData.data.data.totalOnHand).toBeGreaterThan(6000); // Real aggregate from acm_inventory_test!
  });

  test('E2E-ISO-02-POPUP: Chặn triệt để mutation từ popup hoặc tab mới mở trong BrowserContext', async ({
    page,
  }) => {
    // Open new page within the same context
    const newPage = await page.context().newPage();
    await newPage.goto('/transactions');

    const popupMutationError = await newPage.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:5001/api/v1/stock-transactions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: 'Popup mutation attempt' }),
        });
        return null;
      } catch (err: any) {
        return err.message;
      }
    });

    expect(popupMutationError).toMatch(/Failed to fetch|NetworkError|Load failed/i);
    await newPage.close();

    const violations = getModeBViolations();
    expect(violations.some((v) => v.method === 'POST')).toBe(true);
  });
});
