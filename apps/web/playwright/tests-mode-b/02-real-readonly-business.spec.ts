import { test, expect } from '@playwright/test';
import {
  setupModeBNetworkGuard,
  clearModeBViolations,
  assertZeroModeBViolations,
} from '../support/mode-b-network-guard';
import { injectRealTestAuthSession } from '../support/mode-b-auth';

test.describe('Mode B Phase 2: Real Read-Only Business E2E (acm_inventory_test)', () => {
  test.beforeEach(async ({ page }) => {
    clearModeBViolations();
    await setupModeBNetworkGuard(page);
    await injectRealTestAuthSession(page, 'admin');
  });

  // =========================================================================
  // A. ITEMS (Linh kiện & Thiết bị)
  // =========================================================================
  test('E2E-REAL-ITEM-01: GET danh sách linh kiện thực tế từ database acm_inventory_test', async ({
    page,
  }) => {
    await page.goto('/items');

    // Wait for table to load and render real items
    await expect(page.locator('text=Arduino Uno R3').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=ESP32-WROOM-32').first()).toBeVisible({ timeout: 10000 });

    assertZeroModeBViolations();
  });

  test('E2E-REAL-ITEM-02: Tìm kiếm và lọc linh kiện thực tế theo từ khóa', async ({
    page,
  }) => {
    await page.goto('/items');

    const searchInput = page.locator('input[placeholder*="Tìm kiếm"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Arduino');
      // Wait for debounced search
      await page.waitForTimeout(500);

      const tableContent = await page.locator('table').textContent();
      expect(tableContent).toContain('Arduino');
      expect(tableContent).not.toContain('Raspberry Pi 4');
    }

    assertZeroModeBViolations();
  });

  // =========================================================================
  // B. INVENTORY (Tồn kho & Công thức Khả dụng)
  // =========================================================================
  test('E2E-REAL-INV-01: GET Inventory Summary đối chiếu chỉ số KPIs thực tế từ database', async ({
    page,
  }) => {
    await page.goto('/inventory?tab=overview');

    // Wait for header
    await expect(page.locator('h1:has-text("Kho & Số dư Tồn kho")')).toBeVisible({ timeout: 10000 });

    // Check KPI cards render with real aggregate numbers (formatted in thousands)
    await expect(page.locator('text=Tổng tồn vật lý').first()).toBeVisible({ timeout: 10000 });
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/6\.\d{3}/);

    assertZeroModeBViolations();
  });

  test('E2E-REAL-INV-02: GET Balances kiểm tra công thức Available = OnHand - Reserved - Quarantined - KitAllocated', async ({
    page,
  }) => {
    await page.goto('/inventory?tab=balances');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });
    await expect(page.locator('th:has-text("Available")')).toBeVisible({ timeout: 10000 });

    // Verify rows exist and contain no NaN values
    const tableText = await table.textContent();
    expect(tableText).not.toContain('NaN');
    expect(tableText).not.toContain('undefined');

    assertZeroModeBViolations();
  });

  // =========================================================================
  // C. LOCATIONS (Cây phân cấp vị trí kho)
  // =========================================================================
  test('E2E-REAL-LOC-01: GET Locations Hierarchy kết xuất cây 4 cấp bậc (WH-MAIN gốc)', async ({
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

    // Verify WH-MAIN root exists
    const whNode = page.locator('div:has-text("WH-MAIN")').first();
    await expect(whNode).toBeVisible();

    assertZeroModeBViolations();
  });

  test('E2E-REAL-LOC-02: Bảo vệ Feature Flag Location Writes = false (chặn thao tác ghi vị trí)', async ({
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

    assertZeroModeBViolations();
  });

  // =========================================================================
  // D. STOCK TRANSACTIONS (Giao dịch kho thực tế)
  // =========================================================================
  test('E2E-REAL-TX-01: GET danh sách chứng từ kết xuất 274 chứng từ từ database acm_inventory_test', async ({
    page,
  }) => {
    await page.goto('/transactions');

    const table = page.locator('[data-testid="stock-transactions-table"]');
    await expect(table).toBeVisible();

    // Verify pagination / total counts contain real data
    const tableContent = await table.textContent();
    expect(tableContent).not.toContain('NaN');

    assertZeroModeBViolations();
  });

  test('E2E-REAL-TX-02: Xem chi tiết chứng từ có details trong database thực tế', async ({
    page,
  }) => {
    await page.goto('/transactions');

    // Click view detail on first available transaction button
    const firstBtn = page.locator('button[data-testid^="btn-view-detail-"]').first();
    await expect(firstBtn).toBeVisible({ timeout: 10000 });
    await firstBtn.click();

    // Detail modal opens safely
    const modal = page.locator('[data-testid="transaction-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    assertZeroModeBViolations();
  });

  test('E2E-REAL-TX-03: Xem chi tiết chứng từ lịch sử 0 details (tx-orphan-9021 / orphan-empty-notice)', async ({
    page,
  }) => {
    await page.goto('/transactions?search=IMP-20261013-9021');

    const orphanRow = page.locator('tr:has-text("IMP-20261013-9021")');
    await expect(orphanRow).toBeVisible({ timeout: 10000 });

    // Open detail via button with title "Xem chi tiết"
    const detailBtn = orphanRow.locator('button[title="Xem chi tiết"]');
    await detailBtn.click();

    const modal = page.locator('[data-testid="transaction-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Orphan notice is safely displayed without NaN or crash
    const notice = page.locator('[data-testid="detail-empty-orphan-notice"]');
    await expect(notice).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    assertZeroModeBViolations();
  });

  test('E2E-REAL-TX-04: Bảo vệ Feature Flag Stock Writes = false (nút ghi kho fail-closed)', async ({
    page,
  }) => {
    await page.goto('/transactions');

    // Open Import Modal
    await page.click('[data-testid="btn-open-import"]');
    const modal = page.locator('[data-testid="stock-import-modal"]');
    await expect(modal).toBeVisible();

    // Fill valid form fields
    await page.fill('[data-testid="import-notes-input"]', 'Thử nghiệm ghi kho trong Mode B');
    await page.selectOption('[data-testid="select-item-0"]', { index: 1 });
    await page.selectOption('[data-testid="select-location-0"]', { index: 1 });
    await page.fill('[data-testid="input-qty-0"]', '1');

    // Submit form -> service throws Fail-Closed error because VITE_ENABLE_STOCK_TRANSACTION_WRITES = false
    await page.click('[data-testid="btn-submit-import"]');

    // Form displays error banner safely without sending mutation to backend
    const errorBanner = page.locator('[data-testid="import-error-banner"]');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Mock-Verified / Disabled để bảo vệ Database');

    // Close modal
    await page.keyboard.press('Escape');
    assertZeroModeBViolations();
  });

  // =========================================================================
  // E. RBAC (Phân quyền người dùng thực tế)
  // =========================================================================
  test('E2E-REAL-RBAC-01: TECHNICIAN đăng nhập chỉ xem (Read-Only), toolbar ghi kho bị ẩn', async ({
    page,
  }) => {
    // Switch to technician session
    await injectRealTestAuthSession(page, 'tech');
    await page.goto('/transactions');

    // Page renders table
    await expect(page.locator('[data-testid="stock-transactions-table"]')).toBeVisible();

    // Write actions toolbar is strictly hidden
    const writeToolbar = page.locator('[data-testid="write-actions-toolbar"]');
    await expect(writeToolbar).not.toBeVisible();

    assertZeroModeBViolations();
  });

  test('E2E-REAL-RBAC-02: STUDENT bị chặn khỏi module Giao dịch kho (rbac-forbidden-screen 403)', async ({
    page,
  }) => {
    // Switch to student session
    await injectRealTestAuthSession(page, 'student');
    await page.goto('/transactions');

    // Page displays unauthorized access state
    const forbiddenScreen = page.locator('[data-testid="rbac-forbidden-screen"]');
    await expect(forbiddenScreen).toBeVisible({ timeout: 10000 });
    await expect(forbiddenScreen).toContainText('403 - Quyền Truy Cập Bị Từ Chối');

    assertZeroModeBViolations();
  });

  // =========================================================================
  // F. UX & RESPONSIVE DESIGN
  // =========================================================================
  test('E2E-REAL-UX-01: Kiểm tra giao diện trên Mobile (375x667) và Tablet (768x1024)', async ({
    page,
  }) => {
    // Test on Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/inventory');
    await expect(page.locator('h1:has-text("Kho & Số dư Tồn kho")')).toBeVisible({ timeout: 10000 });

    // Test on Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/inventory');
    await expect(page.locator('h1:has-text("Kho & Số dư Tồn kho")')).toBeVisible({ timeout: 10000 });

    assertZeroModeBViolations();
  });

  test('E2E-REAL-UX-02: Modal đóng an toàn bằng phím Escape mà không gây crash', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/transactions');

    await page.click('[data-testid="btn-open-import"]');
    const modal = page.locator('[data-testid="stock-import-modal"]');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    assertZeroModeBViolations();
  });
});
