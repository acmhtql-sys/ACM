import { test, expect } from '@playwright/test';
import {
  setupModeANetworkGuard,
  injectAuthSession,
} from '../support/network-guard';
import { SYNTHETIC_USERS } from '../fixtures/synthetic-data';

test.describe('Phân hệ 5: Location Tree & Flag Guard (LOC)', () => {
  test.beforeEach(async ({ page }) => {
    await setupModeANetworkGuard(page);
    await injectAuthSession(page, SYNTHETIC_USERS.admin);
  });

  test('E2E-LOC-01: Mở rộng cây phân cấp vị trí 4 tầng WAREHOUSE -> RACK -> SHELF -> BIN', async ({
    page,
  }) => {
    await page.goto('/inventory?tab=locations');

    // Wait for tree container to load
    const treeHeader = page.locator('h2:has-text("Cây Phân cấp Vị trí Kho")');
    await expect(treeHeader).toBeVisible();

    // Click "Mở rộng tất cả" to expand all hierarchy levels
    const expandAllBtn = page.locator('button:has-text("Mở rộng tất cả")');
    await expect(expandAllBtn).toBeVisible();
    await expandAllBtn.click();

    // 1. Tier 1: WAREHOUSE (WH-MAIN)
    const whNode = page.locator('div:has-text("WH-MAIN")').first();
    await expect(whNode).toBeVisible();
    await expect(whNode).toContainText('Kho tổng');

    // 2. Tier 2: RACK (RACK-A)
    const rackNode = page.locator('div:has-text("RACK-A")').first();
    await expect(rackNode).toBeVisible();
    await expect(rackNode).toContainText('Kệ');

    // 3. Tier 3: SHELF (SHELF-A1)
    const shelfNode = page.locator('div:has-text("SHELF-A1")').first();
    await expect(shelfNode).toBeVisible();
    await expect(shelfNode).toContainText('Tầng kệ');

    // 4. Tier 4: BIN (BIN-A1-01)
    const binNode = page.locator('div:has-text("BIN-A1-01")').first();
    await expect(binNode).toBeVisible();
    await expect(binNode).toContainText('Khay/Hộp');
  });

  test('E2E-LOC-02: Kiểm tra chốt chặn an toàn Feature Flag Location Writes = false', async ({
    page,
  }) => {
    await page.goto('/inventory?tab=locations');

    // Verify Add Location button is disabled with Feature Flag OFF warning
    const addLocBtn = page.locator('button:has-text("Thêm vị trí")');
    await expect(addLocBtn).toBeVisible();
    await expect(addLocBtn).toBeDisabled();
    await expect(addLocBtn).toHaveAttribute(
      'title',
      /Chức năng ghi đang tạm khóa \(Feature Flag OFF\)/
    );

    // Verify footer status indicator shows Flag OFF mode
    const footerStatus = page.locator('text=Chế độ Thử nghiệm (Ghi tạm khóa)');
    await expect(footerStatus).toBeVisible();
  });
});
