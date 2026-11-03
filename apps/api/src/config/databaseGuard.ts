/**
 * ACM Database Safety Guard
 * Strict validation and verification for Test Database connections.
 * Prevents accidental connection, migration, seeding, or test execution against
 * production, Supabase cloud, staging, or local development databases.
 */

export const ALLOWED_LOCAL_TEST_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
  'postgres',
] as const;

export const DEFAULT_TEST_DATABASE_NAME = 'acm_inventory_test';

export const ALLOWED_SHADOW_DATABASE_NAMES = [
  'acm_inventory_shadow',
  'acm_inventory_test_shadow',
] as const;

export interface ParsedDatabaseUrl {
  protocol: string;
  hostname: string;
  port: string;
  database: string;
  username: string;
}

export interface DatabaseValidationResult {
  valid: boolean;
  reason?: string;
  parsed?: ParsedDatabaseUrl;
}

/**
 * Masks credentials (passwords) from database URLs for safe logging and error reporting.
 */
export function sanitizeDatabaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '[EMPTY_OR_INVALID_URL]';
  }
  try {
    const url = new URL(rawUrl);
    if (url.password) {
      url.password = '****';
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  }
}

/**
 * Validates whether a given database URL strictly targets an isolated local/CI test database.
 */
export function validateDatabaseUrl(
  rawUrl: string | undefined | null,
  expectedDbName: string = DEFAULT_TEST_DATABASE_NAME
): DatabaseValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return {
      valid: false,
      reason: 'DATABASE_URL is empty or undefined',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (err: any) {
    return {
      valid: false,
      reason: `Malformed database URL: ${err.message}`,
    };
  }

  // 1. Protocol check
  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    return {
      valid: false,
      reason: `Invalid database protocol '${protocol}'. Expected 'postgresql:' or 'postgres:'`,
    };
  }

  // 2. Hostname check (case-insensitive, strip IPv6 brackets if present)
  const rawHostname = parsedUrl.hostname.toLowerCase();
  const normalizedHostname = rawHostname.replace(/^\[|\]$/g, '');
  const isAllowedHost = (ALLOWED_LOCAL_TEST_HOSTS as readonly string[]).some(
    (allowed) => allowed.replace(/^\[|\]$/g, '').toLowerCase() === normalizedHostname
  );

  if (!isAllowedHost) {
    return {
      valid: false,
      reason: `Untrusted / Remote database host '${parsedUrl.hostname}'. Test execution must be strictly confined to local or CI containers (${ALLOWED_LOCAL_TEST_HOSTS.join(', ')}). Remote hosts, cloud poolers (Supabase, Neon, AWS RDS), and staging/production databases are strictly forbidden.`,
    };
  }

  // 3. Database name (pathname) check
  const rawPath = parsedUrl.pathname.replace(/^\/+/, '');
  const pathSegments = rawPath.split('/').filter(Boolean);

  if (pathSegments.length === 0) {
    return {
      valid: false,
      reason: 'No database name specified in URL path',
    };
  }

  if (pathSegments.length > 1) {
    return {
      valid: false,
      reason: `Invalid database path '${parsedUrl.pathname}'. Multi-segment database paths are not allowed.`,
    };
  }

  const databaseName = pathSegments[0];
  if (databaseName !== expectedDbName) {
    return {
      valid: false,
      reason: `Database name '${databaseName}' does not match expected test database '${expectedDbName}'. Connecting to development or non-test databases is forbidden.`,
    };
  }

  return {
    valid: true,
    parsed: {
      protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || '5432',
      database: databaseName,
      username: parsedUrl.username,
    },
  };
}

/**
 * Validates shadow database URL (used for Prisma migrations in dev/test).
 */
export function validateShadowDatabaseUrl(
  rawUrl: string | undefined | null
): DatabaseValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return {
      valid: false,
      reason: 'SHADOW_DATABASE_URL is empty or undefined',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (err: any) {
    return {
      valid: false,
      reason: `Malformed shadow database URL: ${err.message}`,
    };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    return {
      valid: false,
      reason: `Invalid shadow database protocol '${protocol}'`,
    };
  }

  const rawHostname = parsedUrl.hostname.toLowerCase();
  const normalizedHostname = rawHostname.replace(/^\[|\]$/g, '');
  const isAllowedHost = (ALLOWED_LOCAL_TEST_HOSTS as readonly string[]).some(
    (allowed) => allowed.replace(/^\[|\]$/g, '').toLowerCase() === normalizedHostname
  );

  if (!isAllowedHost) {
    return {
      valid: false,
      reason: `Untrusted shadow database host '${parsedUrl.hostname}'. Must be local/CI container.`,
    };
  }

  const rawPath = parsedUrl.pathname.replace(/^\/+/, '');
  const pathSegments = rawPath.split('/').filter(Boolean);
  const databaseName = pathSegments[0] || '';

  if (!(ALLOWED_SHADOW_DATABASE_NAMES as readonly string[]).includes(databaseName as any)) {
    return {
      valid: false,
      reason: `Shadow database '${databaseName}' must be one of: ${ALLOWED_SHADOW_DATABASE_NAMES.join(', ')}`,
    };
  }

  return {
    valid: true,
    parsed: {
      protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || '5432',
      database: databaseName,
      username: parsedUrl.username,
    },
  };
}

/**
 * Throws a descriptive error if the URL is not a safe test database.
 */
export function assertSafeTestDatabaseUrl(
  rawUrl: string | undefined | null,
  expectedDbName: string = DEFAULT_TEST_DATABASE_NAME
): void {
  const result = validateDatabaseUrl(rawUrl, expectedDbName);
  if (!result.valid) {
    const sanitized = rawUrl ? sanitizeDatabaseUrl(rawUrl) : 'UNDEFINED';
    throw new Error(
      `❌ [CRITICAL DATABASE SAFETY VIOLATION] Target database URL is not safe for testing!\n` +
      `   Target: ${sanitized}\n` +
      `   Reason: ${result.reason}\n` +
      `   Tests, migrations, and seeds must run strictly against isolated local/CI '${expectedDbName}'.`
    );
  }
}

/**
 * Validates the runtime database returned by SELECT current_database();
 */
export function assertRuntimeDatabaseIsTest(
  currentDb: string | undefined | null,
  expectedDbName: string = DEFAULT_TEST_DATABASE_NAME
): void {
  if (!currentDb || currentDb !== expectedDbName) {
    throw new Error(
      `❌ [CRITICAL DATABASE SAFETY VIOLATION] Runtime database identity mismatch!\n` +
      `   Expected: "${expectedDbName}"\n` +
      `   Connected to: "${currentDb || 'UNKNOWN'}"\n` +
      `   Operation aborted immediately to prevent accidental data corruption.`
    );
  }
}
