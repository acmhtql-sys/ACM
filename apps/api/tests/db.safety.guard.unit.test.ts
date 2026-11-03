import { describe, it, expect } from 'vitest';
import {
  validateDatabaseUrl,
  validateShadowDatabaseUrl,
  assertSafeTestDatabaseUrl,
  assertRuntimeDatabaseIsTest,
  sanitizeDatabaseUrl,
  ALLOWED_LOCAL_TEST_HOSTS,
  DEFAULT_TEST_DATABASE_NAME,
} from '../src/config/databaseGuard';

describe('Database Safety Guard Unit Tests (100% Mock / Non-DB)', () => {
  describe('ALLOWED_LOCAL_TEST_HOSTS and Constants', () => {
    it('defines allowed local test hosts', () => {
      expect(ALLOWED_LOCAL_TEST_HOSTS).toContain('localhost');
      expect(ALLOWED_LOCAL_TEST_HOSTS).toContain('127.0.0.1');
      expect(ALLOWED_LOCAL_TEST_HOSTS).toContain('::1');
      expect(ALLOWED_LOCAL_TEST_HOSTS).toContain('[::1]');
      expect(ALLOWED_LOCAL_TEST_HOSTS).toContain('host.docker.internal');
      expect(ALLOWED_LOCAL_TEST_HOSTS).toContain('postgres');
      expect(DEFAULT_TEST_DATABASE_NAME).toBe('acm_inventory_test');
    });
  });

  describe('validateDatabaseUrl — Valid Test Database Targets', () => {
    it('accepts valid localhost URL with default port', () => {
      const res = validateDatabaseUrl('postgresql://user:pass@localhost:5432/acm_inventory_test');
      expect(res.valid).toBe(true);
      expect(res.parsed?.database).toBe('acm_inventory_test');
      expect(res.parsed?.hostname).toBe('localhost');
      expect(res.parsed?.port).toBe('5432');
    });

    it('accepts 127.0.0.1 with query parameters (e.g. schema=public)', () => {
      const res = validateDatabaseUrl(
        'postgresql://acm_user:secret@127.0.0.1:5432/acm_inventory_test?schema=public'
      );
      expect(res.valid).toBe(true);
      expect(res.parsed?.database).toBe('acm_inventory_test');
      expect(res.parsed?.hostname).toBe('127.0.0.1');
    });

    it('accepts postgres service hostname (used in GitHub Actions CI container)', () => {
      const res = validateDatabaseUrl('postgresql://postgres:postgres@postgres:5432/acm_inventory_test');
      expect(res.valid).toBe(true);
      expect(res.parsed?.hostname).toBe('postgres');
    });

    it('accepts host.docker.internal and IPv6 addresses', () => {
      const resDocker = validateDatabaseUrl('postgres://user:pass@host.docker.internal:5432/acm_inventory_test');
      expect(resDocker.valid).toBe(true);

      const resIpv6 = validateDatabaseUrl('postgresql://user:pass@[::1]:5432/acm_inventory_test');
      expect(resIpv6.valid).toBe(true);
    });

    it('accepts postgres: protocol in addition to postgresql:', () => {
      const res = validateDatabaseUrl('postgres://user:pass@localhost:5432/acm_inventory_test');
      expect(res.valid).toBe(true);
      expect(res.parsed?.protocol).toBe('postgres:');
    });
  });

  describe('validateDatabaseUrl — Strict Rejection of Remote / Cloud Hosts', () => {
    it('rejects Supabase cloud database URLs', () => {
      const res = validateDatabaseUrl(
        'postgresql://postgres.xxx:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/acm_inventory_test'
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Untrusted / Remote database host');
    });

    it('rejects AWS RDS database URLs', () => {
      const res = validateDatabaseUrl(
        'postgresql://admin:secret@acm-prod.c3m4k5.us-east-1.rds.amazonaws.com:5432/acm_inventory_test'
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Untrusted / Remote database host');
    });

    it('rejects Neon database URLs', () => {
      const res = validateDatabaseUrl(
        'postgresql://acm:secret@ep-silent-sea.us-east-1.aws.neon.tech:5432/acm_inventory_test'
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Untrusted / Remote database host');
    });

    it('rejects arbitrary remote IPs (e.g. 192.168.1.100 or 10.0.0.5)', () => {
      const res = validateDatabaseUrl('postgresql://user:pass@192.168.1.100:5432/acm_inventory_test');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Untrusted / Remote database host');
    });
  });

  describe('validateDatabaseUrl — Rejection of Non-Test Databases & Spoofing', () => {
    it('rejects development database "acm_inventory"', () => {
      const res = validateDatabaseUrl('postgresql://localhost:5432/acm_inventory');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("does not match expected test database 'acm_inventory_test'");
    });

    it('rejects default postgres database', () => {
      const res = validateDatabaseUrl('postgresql://localhost:5432/postgres');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("does not match expected test database 'acm_inventory_test'");
    });

    it('rejects missing database name', () => {
      const res = validateDatabaseUrl('postgresql://localhost:5432/');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('No database name specified');
    });

    it('rejects query parameter spoofing where pathname is development database', () => {
      const res = validateDatabaseUrl(
        'postgresql://localhost:5432/acm_inventory?db=acm_inventory_test&target=acm_inventory_test'
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("does not match expected test database 'acm_inventory_test'");
    });

    it('rejects username spoofing where remote host is used', () => {
      const res = validateDatabaseUrl(
        'postgresql://acm_inventory_test:pass@remote.domain.com:5432/acm_inventory_test'
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Untrusted / Remote database host');
    });

    it('rejects multi-segment database paths', () => {
      const res = validateDatabaseUrl('postgresql://localhost:5432/acm_inventory_test/extra_segment');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Multi-segment database paths are not allowed');
    });

    it('rejects non-postgres protocols (mysql, http, mongodb)', () => {
      const resMysql = validateDatabaseUrl('mysql://localhost:3306/acm_inventory_test');
      expect(resMysql.valid).toBe(false);
      expect(resMysql.reason).toContain("Invalid database protocol 'mysql:'");

      const resHttp = validateDatabaseUrl('http://localhost:5432/acm_inventory_test');
      expect(resHttp.valid).toBe(false);
    });

    it('rejects undefined, null, and empty string', () => {
      expect(validateDatabaseUrl(undefined).valid).toBe(false);
      expect(validateDatabaseUrl(null).valid).toBe(false);
      expect(validateDatabaseUrl('').valid).toBe(false);
      expect(validateDatabaseUrl('   ').valid).toBe(false);
    });

    it('rejects malformed URLs', () => {
      expect(validateDatabaseUrl('not a url at all').valid).toBe(false);
    });
  });

  describe('validateShadowDatabaseUrl', () => {
    it('accepts valid local shadow databases', () => {
      const res1 = validateShadowDatabaseUrl('postgresql://user:pass@localhost:5432/acm_inventory_shadow');
      expect(res1.valid).toBe(true);

      const res2 = validateShadowDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/acm_inventory_test_shadow');
      expect(res2.valid).toBe(true);
    });

    it('rejects remote shadow database hosts', () => {
      const res = validateShadowDatabaseUrl('postgresql://user:pass@supabase.co:5432/acm_inventory_shadow');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Untrusted shadow database host');
    });

    it('rejects wrong shadow database name', () => {
      const res = validateShadowDatabaseUrl('postgresql://localhost:5432/acm_inventory_prod');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Shadow database');
    });
  });

  describe('assertSafeTestDatabaseUrl', () => {
    it('does not throw on valid test database URL', () => {
      expect(() => {
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/acm_inventory_test');
      }).not.toThrow();
    });

    it('throws descriptive error on unsafe URL', () => {
      expect(() => {
        assertSafeTestDatabaseUrl('postgresql://user:pass@remote.domain.com:5432/acm_inventory_test');
      }).toThrowError(/CRITICAL DATABASE SAFETY VIOLATION/);
    });
  });

  describe('assertRuntimeDatabaseIsTest', () => {
    it('does not throw when connected database equals acm_inventory_test', () => {
      expect(() => {
        assertRuntimeDatabaseIsTest('acm_inventory_test');
      }).not.toThrow();
    });

    it('throws error when connected database is development or non-test', () => {
      expect(() => {
        assertRuntimeDatabaseIsTest('acm_inventory');
      }).toThrowError(/Runtime database identity mismatch/);

      expect(() => {
        assertRuntimeDatabaseIsTest('postgres');
      }).toThrowError(/Runtime database identity mismatch/);

      expect(() => {
        assertRuntimeDatabaseIsTest(undefined);
      }).toThrowError(/Runtime database identity mismatch/);
    });
  });

  describe('sanitizeDatabaseUrl', () => {
    it('masks password in standard postgresql URL', () => {
      const sanitized = sanitizeDatabaseUrl('postgresql://acm_user:SuperSecretPassword123@localhost:5432/acm_inventory_test');
      expect(sanitized).not.toContain('SuperSecretPassword123');
      expect(sanitized).toContain('****');
      expect(sanitized).toContain('acm_user');
      expect(sanitized).toContain('acm_inventory_test');
    });

    it('handles empty or invalid inputs gracefully', () => {
      expect(sanitizeDatabaseUrl('')).toBe('[EMPTY_OR_INVALID_URL]');
      expect(sanitizeDatabaseUrl(null as any)).toBe('[EMPTY_OR_INVALID_URL]');
    });
  });
});
