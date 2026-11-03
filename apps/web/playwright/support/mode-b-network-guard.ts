import { Page, Route, Request } from '@playwright/test';

export interface ModeBViolation {
  method: string;
  url: string;
  timestamp: string;
}

const modeBViolations: ModeBViolation[] = [];

/**
 * Sanitizes URLs by stripping credentials, tokens, or sensitive query strings
 */
function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Remove potential token query parameters
    parsed.searchParams.delete('token');
    parsed.searchParams.delete('secret');
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
}

export function recordModeBViolation(method: string, rawUrl: string): void {
  modeBViolations.push({
    method,
    url: sanitizeUrl(rawUrl),
    timestamp: new Date().toISOString(),
  });
}

export function getModeBViolations(): ModeBViolation[] {
  return [...modeBViolations];
}

export function clearModeBViolations(): void {
  modeBViolations.length = 0;
}

/**
 * Asserts that no unexpected violations occurred.
 */
export function assertZeroModeBViolations(allowedPatterns: string[] = []): void {
  const defaultAllowed = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  const allAllowed = [...defaultAllowed, ...allowedPatterns];

  const unexpected = modeBViolations.filter(
    (v) => !allAllowed.some((pattern) => v.url.includes(pattern))
  );

  if (unexpected.length > 0) {
    throw new Error(
      `Phát hiện ${unexpected.length} vi phạm cách ly Mode B không mong đợi: ${JSON.stringify(
        unexpected,
        null,
        2
      )}`
    );
  }
}

/**
 * Exact allowlist of GET endpoints on Backend Test Port 5001
 */
const ALLOWED_GET_API_PATTERNS = [
  /^\/api\/v1\/health(\/.*)?$/,
  /^\/api\/v1\/auth\/me$/,
  /^\/api\/v1\/reports\/summary$/,
  /^\/api\/v1\/inventory\/summary$/,
  /^\/api\/v1\/inventory\/balance(\/.*)?$/,
  /^\/api\/v1\/locations\/tree$/,
  /^\/api\/v1\/locations(\/.*)?$/,
  /^\/api\/v1\/items(\/.*)?$/,
  /^\/api\/v1\/categories(\/.*)?$/,
  /^\/api\/v1\/stock-transactions(\/.*)?$/,
  /^\/api\/v1\/stock-movements(\/.*)?$/,
  /^\/api\/v1\/audit-logs(\/.*)?$/,
];

/**
 * Sets up strict Default-Deny Mode B Network Guard for Playwright.
 * - Allows GET/HEAD static assets on Frontend Port 4175.
 * - Allows GET only for allowlisted endpoints on Test Backend Port 5001.
 * - Blocks ALL POST / PUT / PATCH / DELETE requests.
 * - Blocks port 5000 (Dev API) and all unauthorized external hosts.
 */
export async function setupModeBNetworkGuard(page: Page): Promise<void> {
  const context = page.context();
  await context.route('**/*', async (route: Route) => {
    const request: Request = route.request();
    const method = request.method();
    const rawUrl = request.url();
    const url = new URL(rawUrl);

    // 1. Explicitly abort connection to Dev API Port 5000
    if (url.port === '5000') {
      console.warn(`[MODE B GUARD ABORT] Cố gắng kết nối Dev API port 5000: ${method} ${url.pathname}`);
      recordModeBViolation(method, rawUrl);
      return route.abort('blockedbyclient');
    }

    // 2. Local Frontend Test Server (127.0.0.1:4175)
    const isFrontendTest =
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === '4175';

    if (isFrontendTest && !url.pathname.startsWith('/api/')) {
      // Only GET and HEAD allowed for static assets
      if (method === 'GET' || method === 'HEAD') {
        return route.continue();
      }
      console.warn(`[MODE B GUARD ABORT] Mutation cùng origin ngoài API path: ${method} ${url.pathname}`);
      recordModeBViolation(method, rawUrl);
      return route.abort('blockedbyclient');
    }

    // 3. Local Backend Test API (127.0.0.1:5001)
    const isBackendTest =
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === '5001';

    if (isBackendTest && url.pathname.startsWith('/api/v1/')) {
      // Allow browser CORS preflight OPTIONS for approved read-only endpoints
      if (method === 'OPTIONS') {
        const isAllowedEndpoint = ALLOWED_GET_API_PATTERNS.some((pattern) =>
          pattern.test(url.pathname)
        );
        if (isAllowedEndpoint) {
          return route.continue();
        }
      }

      // RULE: Strictly block ALL non-GET methods (POST, PUT, PATCH, DELETE)
      if (method !== 'GET') {
        console.warn(`[MODE B GUARD ABORT] Chặn triệt để mutation request tới Backend: ${method} ${url.pathname}`);
        recordModeBViolation(method, rawUrl);
        return route.abort('blockedbyclient');
      }

      // Check against allowlist of GET endpoints
      const isAllowedEndpoint = ALLOWED_GET_API_PATTERNS.some((pattern) =>
        pattern.test(url.pathname)
      );

      if (isAllowedEndpoint) {
        // Forward real read-only query to Test API
        return route.continue();
      }

      console.warn(`[MODE B GUARD ABORT] Endpoint GET chưa được duyệt allowlist: ${url.pathname}`);
      recordModeBViolation(method, rawUrl);
      return route.abort('blockedbyclient');
    }

    // 4. Default-Deny: External origins, unlisted hosts, Service Workers, etc.
    console.warn(`[MODE B GUARD ABORT] Yêu cầu ra ngoài origin/chính sách Mode B: ${method} ${url.host}${url.pathname}`);
    recordModeBViolation(method, rawUrl);
    return route.abort('blockedbyclient');
  });
}
