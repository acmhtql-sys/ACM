import { test, expect } from '@playwright/test';
import {
  setupModeANetworkGuard,
  injectAuthSession,
} from '../support/network-guard';
import { SYNTHETIC_USERS } from '../fixtures/synthetic-data';

test.describe('Phân hệ 7: Responsive UX & Accessibility (UX)', () => {
  test.beforeEach(async ({ page }) => {
    await setupModeANetworkGuard(page);
    await injectAuthSession(page, SYNTHETIC_USERS.admin);
  });

  test('E2E-UX-01: Giao diện mobile 375x667, drawer menu và cuộn ngang bảng dữ liệu', async ({
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Click Hamburger menu button in mobile header
    const menuBtn = page.locator('header button:has(svg.lucide-menu)');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Drawer sidebar is now visible (has translate-x-0)
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Click link to Stock Transactions
    const stockTxLink = page.locator('aside a:has-text("Giao dịch kho")');
    await expect(stockTxLink).toBeVisible();
    await stockTxLink.click();

    // Navigates to /transactions
    await expect(page).toHaveURL(/\/transactions/);

    // Verify table has horizontal scrolling container
    const tableScrollContainer = page.locator('div.overflow-x-auto');
    await expect(tableScrollContainer.first()).toBeVisible();
  });

  test('E2E-UX-02: Phím Escape đóng modal an toàn và hỗ trợ phím điều hướng', async ({
    page,
  }) => {
    await page.goto('/transactions');

    // 1. Test Escape on Import Modal
    await page.click('[data-testid="btn-open-import"]');
    const importModal = page.locator('[data-testid="stock-import-modal"]');
    await expect(importModal).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await expect(importModal).not.toBeVisible();

    // 2. Test Escape on Detail Modal
    const detailBtn = page.locator('[data-testid="btn-view-detail-tx-orphan-9021"]');
    await expect(detailBtn).toBeVisible();
    await detailBtn.click();

    const detailModal = page.locator('[data-testid="transaction-detail-modal"]');
    await expect(detailModal).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await expect(detailModal).not.toBeVisible();
  });
});
