import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';
import { auditLogsRouter } from '../src/modules/audit-logs/audit-logs.router';
import {
  deepRedactSensitiveData,
  isSensitiveKey,
} from '../src/modules/audit-logs/audit-logs.security';
import { prisma } from '../src/config/database';
import { AppError } from '../src/shared/AppError';

// Mock prisma client
vi.mock('../src/config/database', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock auth middleware so we can control req.user and test RBAC / route logic
vi.mock('../src/middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    if (!req.headers?.authorization) {
      return next(new AppError('Không có token xác thực', 401));
    }
    next();
  }),
}));

class MockResponse {
  statusCode: number = 200;
  headers: Record<string, string> = {};
  body: any = null;
  ended: boolean = false;
  private onEnd?: (res: MockResponse) => void;

  setOnEnd(cb: (res: MockResponse) => void) {
    this.onEnd = cb;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: any) {
    this.body = payload;
    this.ended = true;
    if (this.onEnd) this.onEnd(this);
    return this;
  }

  send(payload: any) {
    this.body = payload;
    this.ended = true;
    if (this.onEnd) this.onEnd(this);
    return this;
  }
}

function invokeRouter(
  router: any,
  req: any,
  res: MockResponse
): Promise<{ req: any; res: MockResponse; err?: any }> {
  return new Promise((resolve) => {
    res.setOnEnd(() => {
      resolve({ req, res });
    });
    router(req, res, (err: any) => {
      resolve({ req, res, err });
    });
  });
}

describe('Audit Logs Module – Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Deep Redaction Security Helper (deepRedactSensitiveData)', () => {
    it('detects sensitive keys correctly', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('passwordHash')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('jwt')).toBe(true);
      expect(isSensitiveKey('secretKey')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('private_key')).toBe(true);
      expect(isSensitiveKey('sessionToken')).toBe(true);
      expect(isSensitiveKey('itemCode')).toBe(false);
      expect(isSensitiveKey('quantity')).toBe(false);
    });

    it('redacts sensitive keys in flat objects', () => {
      const input = {
        id: 'user-1',
        email: 'admin@acm.local',
        password: 'SuperSecret123!',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
      };
      const result: any = deepRedactSensitiveData(input);
      expect(result.id).toBe('user-1');
      expect(result.email).toBe('admin@acm.local');
      expect(result.password).toBe('[REDACTED]');
      expect(result.passwordHash).toBe('[REDACTED]');
    });

    it('redacts nested objects and arrays deeply', () => {
      const input = {
        action: 'UPDATE_USER',
        metadata: {
          session: {
            token: 'xyz-secret-token',
            jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMC6Y5nM3iMTWqHGnIrDH-eyAT2M',
          },
          roles: ['ADMIN'],
        },
        items: [
          { sku: 'RES-01', apiKey: 'sec_123' },
          { sku: 'CAP-02', apiKey: 'sec_456' },
        ],
      };
      const result: any = deepRedactSensitiveData(input);
      expect(result.action).toBe('UPDATE_USER');
      expect(result.metadata.session).toBe('[REDACTED]');
      expect(result.metadata.roles).toEqual(['ADMIN']);
      expect(result.items[0].sku).toBe('RES-01');
      expect(result.items[0].apiKey).toBe('[REDACTED]');
      expect(result.items[1].sku).toBe('CAP-02');
      expect(result.items[1].apiKey).toBe('[REDACTED]');
    });

    it('redacts stringified JSON containing secrets', () => {
      const jsonStr = JSON.stringify({
        userId: '123',
        passwordHash: 'secret_hash',
        name: 'Nguyen Van A',
      });
      const result: any = deepRedactSensitiveData(jsonStr);
      const parsed = JSON.parse(result);
      expect(parsed.userId).toBe('123');
      expect(parsed.name).toBe('Nguyen Van A');
      expect(parsed.passwordHash).toBe('[REDACTED]');
    });

    it('redacts raw standalone JWT token strings', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.abc123signature';
      expect(deepRedactSensitiveData(token)).toBe('[REDACTED_TOKEN]');
    });

    it('safely handles circular references without infinite recursion', () => {
      const circular: any = { name: 'Root' };
      circular.self = circular;
      const result: any = deepRedactSensitiveData(circular);
      expect(result.name).toBe('Root');
      expect(result.self).toBe('[CIRCULAR]');
    });

    it('handles null, undefined and primitive values safely', () => {
      expect(deepRedactSensitiveData(null)).toBeNull();
      expect(deepRedactSensitiveData(undefined)).toBeUndefined();
      expect(deepRedactSensitiveData(12345)).toBe(12345);
      expect(deepRedactSensitiveData(true)).toBe(true);
      expect(deepRedactSensitiveData('Regular string')).toBe('Regular string');
    });
  });

  describe('GET /api/v1/audit-logs Router Integration', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req: any = {
        method: 'GET',
        url: '/',
        headers: {},
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(auditLogsRouter, req, res);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
    });

    it('rejects non-ADMIN users with 403', async () => {
      const req: any = {
        method: 'GET',
        url: '/',
        headers: { authorization: 'Bearer token' },
        user: { id: 'u1', role: UserRole.STUDENT },
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(auditLogsRouter, req, res);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    it('allows ADMIN, queries max 50 logs and redacts sensitive details', async () => {
      const mockRawLogs = [
        {
          id: 'log-uuid-1',
          action: 'CREATE_USER',
          entity: 'User',
          entityId: 'u-target-1',
          createdAt: new Date('2026-11-04T10:00:00Z'),
          user: { fullName: 'Admin User' },
          newValue: {
            email: 'newuser@acm.local',
            passwordHash: '$2a$10$verySecretPasswordHash',
            role: 'TECHNICIAN',
          },
        },
        {
          id: 'log-uuid-2',
          action: 'BORROW_APPROVE',
          entity: 'BorrowRequest',
          entityId: 'BR-20261104-001',
          createdAt: new Date('2026-11-04T11:00:00Z'),
          user: null, // System event
          newValue: {
            borrowId: 'BR-20261104-001',
            status: 'APPROVED',
          },
        },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockRawLogs as any);

      const req: any = {
        method: 'GET',
        url: '/',
        headers: { authorization: 'Bearer admin-token' },
        user: { id: 'admin-id', role: UserRole.ADMIN },
      };
      const res = new MockResponse();
      await invokeRouter(auditLogsRouter, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);

      // Verify query limits to 50 ordered by desc
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Verify mapped structure
      const item1 = res.body.data[0];
      expect(item1.id).toBe('log-uuid-1');
      expect(item1.action).toBe('CREATE_USER');
      expect(item1.userName).toBe('Admin User');
      expect(item1.createdAt).toBe('2026-11-04T10:00:00.000Z');

      // Verify details string is redacted
      const details1 = JSON.parse(item1.details);
      expect(details1.email).toBe('newuser@acm.local');
      expect(details1.passwordHash).toBe('[REDACTED]');
      expect(details1.role).toBe('TECHNICIAN');

      // Verify item 2 system username
      const item2 = res.body.data[1];
      expect(item2.userName).toBe('System');
    });

    it('returns empty array when no audit logs exist', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      const req: any = {
        method: 'GET',
        url: '/',
        headers: { authorization: 'Bearer admin-token' },
        user: { id: 'admin-id', role: UserRole.ADMIN },
      };
      const res = new MockResponse();
      await invokeRouter(auditLogsRouter, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('forwards database error via next()', async () => {
      vi.mocked(prisma.auditLog.findMany).mockRejectedValue(new Error('DB Connection Timeout'));

      const req: any = {
        method: 'GET',
        url: '/',
        headers: { authorization: 'Bearer admin-token' },
        user: { id: 'admin-id', role: UserRole.ADMIN },
      };
      const res = new MockResponse();
      const { err } = await invokeRouter(auditLogsRouter, req, res);

      expect(err).toBeDefined();
      expect(err.message).toBe('DB Connection Timeout');
    });
  });
});
