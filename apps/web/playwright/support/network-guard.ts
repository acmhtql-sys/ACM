import { Page, Route, Request } from '@playwright/test';
import {
  SYNTHETIC_USERS,
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_ITEMS,
  SYNTHETIC_LOCATIONS,
  SYNTHETIC_LOCATION_HIERARCHY,
  SYNTHETIC_BALANCES,
  SYNTHETIC_TRANSACTIONS,
  SYNTHETIC_TRANSACTION_DETAILS,
} from '../fixtures/synthetic-data';

export interface IsolationViolation {
  method: string;
  url: string;
  timestamp: string;
}

const isolationViolations: IsolationViolation[] = [];

export function recordIsolationViolation(method: string, url: string): void {
  isolationViolations.push({
    method,
    url,
    timestamp: new Date().toISOString(),
  });
}

export function getIsolationViolations(): IsolationViolation[] {
  return [...isolationViolations];
}

export function clearIsolationViolations(): void {
  isolationViolations.length = 0;
}

const activeCustomHandlers = new Map<
  string,
  (route: Route, request: Request) => Promise<boolean>
>();

export function registerCustomMockHandler(
  pattern: string,
  handler: (route: Route, request: Request) => Promise<boolean>
): void {
  activeCustomHandlers.set(pattern, handler);
}

export function clearCustomMockHandlers(): void {
  activeCustomHandlers.clear();
}

export interface NetworkGuardOptions {
  customHandlers?: Record<string, (route: Route, request: Request) => Promise<boolean>>;
}

/**
 * Sets up strict Default-Deny Mode A Network Guard for Playwright page.
 * Fulfills synthetic responses for registered API endpoints.
 * Aborts unmocked API requests with 'blockedbyclient'.
 * Guarantees zero network egress to live backend or external hosts.
 */
export async function setupModeANetworkGuard(
  page: Page,
  options: NetworkGuardOptions = {}
): Promise<void> {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    const urlString = request.url();
    const url = new URL(urlString);

    // 1. Explicitly abort any connection attempt to Dev (5000) or Test (5001) Backend APIs
    if (url.port === '5000' || url.port === '5001') {
      console.warn(
        `[STRICT ISOLATION ABORT] Phát hiện request tới Backend port ${url.port}: ${urlString}`
      );
      recordIsolationViolation(method, urlString);
      return route.abort('blockedbyclient');
    }

    // 2. Allow local Vite preview static assets (JS, CSS, HTML, fonts, images) on port 4173 or 4174
    const isLocalVite =
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      (url.port === '4173' || url.port === '4174');

    if (isLocalVite && !url.pathname.startsWith('/api/')) {
      // Strictly allow GET and HEAD only for static assets; abort any mutation attempts
      if (method === 'GET' || method === 'HEAD') {
        return route.continue();
      }
      console.warn(
        `[STRICT ISOLATION ABORT] Phát hiện non-GET request tới same-origin static path: ${method} ${urlString}`
      );
      recordIsolationViolation(method, urlString);
      return route.abort('blockedbyclient');
    }

    // 3. Custom override handlers (dynamic or per-options)
    for (const [pattern, handler] of activeCustomHandlers.entries()) {
      if (urlString.includes(pattern) || url.pathname.includes(pattern)) {
        const handled = await handler(route, request);
        if (handled) return;
      }
    }

    if (options.customHandlers) {
      for (const [pattern, handler] of Object.entries(options.customHandlers)) {
        if (urlString.includes(pattern) || url.pathname.includes(pattern)) {
          const handled = await handler(route, request);
          if (handled) return;
        }
      }
    }

    // 3. API Route Interception: Local or Proxy (http://localhost:5000/api/v1/*, http://127.0.0.1:4173/api/v1/*)
    if (url.pathname.startsWith('/api/v1/')) {
      const pathname = url.pathname;

      // POST /api/v1/auth/login
      if (pathname === '/api/v1/auth/login' && method === 'POST') {
        const postData = request.postDataJSON() || {};
        const { email, password } = postData;

        let matchedUser = Object.values(SYNTHETIC_USERS).find((u) => u.email === email);
        if (matchedUser && password === 'ACM@dev2026!') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                token: `mock-jwt-token-${matchedUser.role.toLowerCase()}-${Date.now()}`,
                user: matchedUser,
              },
            }),
          });
        }

        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Email hoặc mật khẩu không chính xác',
          }),
        });
      }

      // GET /api/v1/reports/summary
      if (pathname === '/api/v1/reports/summary' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              kpis: {
                totalItems: 4,
                totalOnHand: 295,
                totalAvailable: 265,
                activeBorrows: 3,
                pendingApprovalBorrows: 1,
                lowStockCount: 0,
              },
              distribution: [
                { name: 'Khả dụng (Available)', value: 265 },
                { name: 'Đang mượn (Borrowed)', value: 12 },
                { name: 'Giữ chỗ (Reserved)', value: 20 },
                { name: 'Gán Kit (KitAllocated)', value: 4 },
                { name: 'Cách ly lỗi (Quarantined)', value: 4 },
              ],
              monthlyTrends: [
                { month: 'T10', imports: 10, exports: 5, borrows: 3 },
              ],
            },
          }),
        });
      }

      // GET /api/v1/inventory/summary
      if (pathname === '/api/v1/inventory/summary' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              totalItems: 4,
              totalOnHand: 295,
              totalAvailable: 265,
              totalReserved: 20,
              totalQuarantined: 4,
              lowStockCount: 0,
            },
          }),
        });
      }

      // GET /api/v1/inventory/balance
      if (pathname === '/api/v1/inventory/balance' && method === 'GET') {
        const search = url.searchParams.get('search')?.toLowerCase() || '';
        let filtered = SYNTHETIC_BALANCES;
        if (search) {
          filtered = SYNTHETIC_BALANCES.filter(
            (b) =>
              b.item.code.toLowerCase().includes(search) ||
              b.item.name.toLowerCase().includes(search)
          );
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: filtered,
            meta: {
              page: 1,
              limit: 20,
              totalItems: filtered.length,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          }),
        });
      }

      // GET /api/v1/locations/tree
      if (pathname === '/api/v1/locations/tree' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: SYNTHETIC_LOCATION_HIERARCHY,
          }),
        });
      }

      // GET /api/v1/locations/:id
      if (pathname.startsWith('/api/v1/locations/') && method === 'GET' && !pathname.endsWith('/tree')) {
        const locId = pathname.replace('/api/v1/locations/', '');
        const loc = SYNTHETIC_LOCATIONS.find((l) => l.id === locId) || SYNTHETIC_LOCATIONS[0];
        const balances = SYNTHETIC_BALANCES.filter((b) => b.locationId === loc.id);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              ...loc,
              balances,
              children: SYNTHETIC_LOCATIONS.filter((l) => l.parentId === loc.id),
            },
          }),
        });
      }

      // GET /api/v1/locations
      if (pathname === '/api/v1/locations' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: SYNTHETIC_LOCATIONS,
          }),
        });
      }

      // GET /api/v1/items
      if (pathname === '/api/v1/items' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: SYNTHETIC_ITEMS,
            meta: {
              totalItems: SYNTHETIC_ITEMS.length,
              page: 1,
              limit: 100,
              totalPages: 1,
            },
          }),
        });
      }

      // GET /api/v1/categories
      if (pathname === '/api/v1/categories' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: SYNTHETIC_CATEGORIES,
          }),
        });
      }

      // GET /api/v1/stock-transactions/:id
      if (pathname.startsWith('/api/v1/stock-transactions/') && method === 'GET') {
        const txId = pathname.replace('/api/v1/stock-transactions/', '');
        const detail = SYNTHETIC_TRANSACTION_DETAILS[txId];
        if (detail) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: detail,
            }),
          });
        }
        // Fallback for single tx
        const txSummary = SYNTHETIC_TRANSACTIONS.find((t) => t.id === txId);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: txSummary ? { ...txSummary, details: [] } : null,
          }),
        });
      }

      // GET /api/v1/stock-transactions
      if (pathname === '/api/v1/stock-transactions' && method === 'GET') {
        const search = url.searchParams.get('search')?.toLowerCase() || '';
        let list = SYNTHETIC_TRANSACTIONS;
        if (search) {
          list = list.filter(
            (t) =>
              t.transactionNumber.toLowerCase().includes(search) ||
              t.notes?.toLowerCase().includes(search)
          );
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: list,
            meta: {
              page: 1,
              limit: 20,
              totalItems: list.length,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          }),
        });
      }

      // DEFAULT-DENY FOR UNMOCKED API REQUEST:
      // Any API request not matching the synthetic fixtures is aborted with blockedbyclient
      console.warn(
        `[STRICT ISOLATION ABORT] Phát hiện unmocked API request: ${method} ${pathname}`
      );
      recordIsolationViolation(method, pathname);
      return route.abort('blockedbyclient');
    }

    // 4. Default-Deny for all other origins / unhandled external requests
    console.warn(`[STRICT ISOLATION ABORT] Phát hiện request ra ngoài origin cho phép: ${urlString}`);
    recordIsolationViolation(method, urlString);
    return route.abort('blockedbyclient');
  });
}

/**
 * Injects authenticated user session into browser localStorage
 * without persisting an init script that overwrites storage on every navigation.
 */
export async function injectAuthSession(page: Page, user: any): Promise<void> {
  const token = `mock-jwt-token-${user.role.toLowerCase()}-${Date.now()}`;
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
export async function clearAuthSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('acm_token');
    localStorage.removeItem('acm_user');
  });
}

/**
 * Asserts that no unexpected isolation violations occurred during test execution.
 */
export function assertZeroUnexpectedViolations(allowedPatterns: string[] = []): void {
  const defaultAllowed = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  const allAllowed = [...defaultAllowed, ...allowedPatterns];
  const unexpected = isolationViolations.filter(
    (v) => !allAllowed.some((pattern) => v.url.includes(pattern))
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Phát hiện ${unexpected.length} vi phạm cách ly mạng không mong đợi: ${JSON.stringify(
        unexpected,
        null,
        2
      )}`
    );
  }
}

