import { test, expect } from '@playwright/test';
import {
  setupModeANetworkGuard,
  injectAuthSession,
} from '../support/network-guard';
import { SYNTHETIC_USERS } from '../fixtures/synthetic-data';

test.describe('Phân hệ 2: Authentication Lifecycle (AUTH)', () => {
  test.beforeEach(async ({ page }) => {
    await setupModeANetworkGuard(page);
  });

  test('E2E-AUTH-01: Đăng nhập thành công với tài khoản Quản trị viên (ADMIN)', async ({
    page,
  }) => {
    await page.goto('/login');

    // Fill valid admin credentials
    await page.fill('input[type="email"]', SYNTHETIC_USERS.admin.email);
    await page.fill('input[type="password"]', 'ACM@dev2026!');
    await page.click('button[type="submit"]');

    // Expected: Redirected to /dashboard and displays Admin profile
    await expect(page).toHaveURL(/\/dashboard/);
    const headerProfile = page.locator('header');
    await expect(headerProfile).toContainText(SYNTHETIC_USERS.admin.fullName);

    // Verify token was persisted
    const token = await page.evaluate(() => localStorage.getItem('acm_token'));
    expect(token).toBeTruthy();
  });

  test('E2E-AUTH-02: Đăng nhập thất bại khi sai mật khẩu, hiển thị cảnh báo', async ({
    page,
  }) => {
    await page.goto('/login');

    // Fill invalid credentials
    await page.fill('input[type="email"]', SYNTHETIC_USERS.admin.email);
    await page.fill('input[type="password"]', 'WrongPassword@999');
    await page.click('button[type="submit"]');

    // Expected: Stays on /login and renders error banner
    await expect(page).toHaveURL(/\/login/);
    const alertBanner = page.locator('div.text-rose-700');
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText('Email hoặc mật khẩu không chính xác');
  });

  test('E2E-AUTH-03: Đăng xuất an toàn, xóa token và chuyển hướng về /login', async ({
    page,
  }) => {
    await injectAuthSession(page, SYNTHETIC_USERS.admin);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Click logout button on header
    const logoutBtn = page.locator('button[title="Đăng xuất"]');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Expected: Redirect to /login and localStorage cleared
    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => localStorage.getItem('acm_token'));
    const user = await page.evaluate(() => localStorage.getItem('acm_user'));
    expect(token).toBeNull();
    expect(user).toBeNull();
  });

  test('E2E-AUTH-04: Đổi tài khoản ADMIN -> TECHNICIAN, phân quyền các nút ghi', async ({
    page,
  }) => {
    // 1. First visit as ADMIN
    await injectAuthSession(page, SYNTHETIC_USERS.admin);
    await page.goto('/transactions');
    await expect(page).toHaveURL(/\/transactions/);

    // ADMIN sees write toolbar
    const adminToolbar = page.locator('[data-testid="write-actions-toolbar"]');
    await expect(adminToolbar).toBeVisible();

    // 2. Logout ADMIN
    await page.click('button[title="Đăng xuất"]');
    await expect(page).toHaveURL(/\/login/);

    // 3. Login as TECHNICIAN via form
    await page.fill('input[type="email"]', SYNTHETIC_USERS.tech.email);
    await page.fill('input[type="password"]', 'ACM@dev2026!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // 4. Navigate to /transactions as TECHNICIAN
    await page.goto('/transactions');
    await expect(page).toHaveURL(/\/transactions/);

    // TECHNICIAN does not have write actions toolbar
    const techToolbar = page.locator('[data-testid="write-actions-toolbar"]');
    await expect(techToolbar).toHaveCount(0);
  });

  test('E2E-AUTH-05: F5 Reload trang duy trì phiên đăng nhập', async ({ page }) => {
    await injectAuthSession(page, SYNTHETIC_USERS.admin);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Reload browser page
    await page.reload();

    // Still on /dashboard, session maintained
    await expect(page).toHaveURL(/\/dashboard/);
    const headerProfile = page.locator('header');
    await expect(headerProfile).toContainText(SYNTHETIC_USERS.admin.fullName);
  });

  test('E2E-AUTH-06: Phản hồi 401 Unauthorized tự động kết thúc phiên và chuyển hướng về /login', async ({
    page,
  }) => {
    // Override /api/v1/reports/summary to return 401
    await setupModeANetworkGuard(page, {
      customHandlers: {
        '/api/v1/reports/summary': async (route) => {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ',
            }),
          });
          return true;
        },
      },
    });

    await injectAuthSession(page, SYNTHETIC_USERS.admin);
    await page.goto('/dashboard');

    // The 401 response from /reports/summary triggers axios interceptor
    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => localStorage.getItem('acm_token'));
    expect(token).toBeNull();
  });
});
