import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  canUserReceiveAuditNotification,
  mapAuditLogToNotification,
} from '../src/modules/notifications/notifications.mapper';
import { notificationHub } from '../src/modules/notifications/notifications.hub';
import { notificationsRouter } from '../src/modules/notifications/notifications.router';
import { prisma } from '../src/config/database';
import { AppError } from '../src/shared/AppError';

vi.mock('../src/config/database', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../src/middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    if (!req.headers?.authorization) {
      return next(new AppError('Missing token', 401));
    }
    next();
  }),
}));

describe('System Notifications Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapAuditLogToNotification', () => {
    it('maps every core entity to its matching frontend route and Vietnamese copy', () => {
      const cases = [
        { entity: 'Item', action: 'CREATE_ITEM', expectedLink: '/items', expectedType: 'success' },
        { entity: 'Category', action: 'UPDATE', expectedLink: '/categories', expectedType: 'info' },
        { entity: 'Kit', action: 'DELETE_KIT', expectedLink: '/kits', expectedType: 'warning' },
        { entity: 'Location', action: 'CREATE_LOCATION', expectedLink: '/inventory', expectedType: 'success' },
        { entity: 'StockTransaction', action: 'EXPORT_STOCK', expectedLink: '/transactions', expectedType: 'warning' },
        { entity: 'BorrowRequest', action: 'APPROVE', expectedLink: '/borrow-return', expectedType: 'success' },
        { entity: 'BorrowReturnOperation', action: 'STAGE4C_RETURN_COMMIT', expectedLink: '/borrow-return', expectedType: 'success' },
        { entity: 'User', action: 'RESET_PASSWORD', expectedLink: '/users', expectedType: 'warning' },
      ];

      for (const c of cases) {
        const dto = mapAuditLogToNotification(
          {
            id: `log-${c.entity}`,
            action: c.action,
            entity: c.entity,
            entityId: '11111111-1111-1111-1111-111111111111',
            newValue: { code: 'CODE-01', name: 'Test Entity' },
            createdAt: new Date('2026-11-12T15:00:00Z'),
            user: { fullName: 'Quản trị viên' },
          },
          'ADMIN'
        );
        expect(dto.link).toBe(c.expectedLink);
        expect(dto.type).toBe(c.expectedType);
        expect(dto.title).toContain('CODE-01 (Test Entity)');
        expect(dto.actorName).toBe('Quản trị viên');
      }
    });

    it('redacts sensitive secrets from payload while keeping safe labels', () => {
      const dto = mapAuditLogToNotification(
        {
          id: 'log-secret',
          action: 'UPDATE',
          entity: 'User',
          entityId: 'user-1',
          newValue: { fullName: 'Nguyễn Văn A', passwordHash: 'secret-bcrypt-hash', token: 'eyJhbGciOiJIUzI1NiJ9.aaa.bbb' },
          createdAt: '2026-11-12T15:00:00Z',
          user: { fullName: 'Admin' },
        },
        'ADMIN'
      );
      expect(dto.title).toContain('Nguyễn Văn A');
      expect(JSON.stringify(dto)).not.toContain('secret-bcrypt-hash');
      expect(JSON.stringify(dto)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    });
  });

  describe('canUserReceiveAuditNotification RBAC', () => {
    it('enforces strict role scoping across ADMIN, LAB_MANAGER, TECHNICIAN and STUDENT', () => {
      const userEntityLog = { entity: 'User', userId: 'admin-1', newValue: {} };
      const stockLog = { entity: 'StockTransaction', userId: 'tech-1', newValue: {} };
      const itemLog = { entity: 'Item', userId: 'admin-1', newValue: {} };
      const ownBorrowLog = { entity: 'BorrowRequest', userId: 'student-1', newValue: { borrowerId: 'student-1' } };
      const otherBorrowLog = { entity: 'BorrowRequest', userId: 'student-2', newValue: { borrowerId: 'student-2' } };

      expect(canUserReceiveAuditNotification('ADMIN', 'admin-1', userEntityLog)).toBe(true);
      expect(canUserReceiveAuditNotification('LAB_MANAGER', 'mgr-1', userEntityLog)).toBe(false);
      expect(canUserReceiveAuditNotification('LAB_MANAGER', 'mgr-1', stockLog)).toBe(true);
      expect(canUserReceiveAuditNotification('TECHNICIAN', 'tech-1', otherBorrowLog)).toBe(true);

      expect(canUserReceiveAuditNotification('STUDENT', 'student-1', itemLog)).toBe(true);
      expect(canUserReceiveAuditNotification('STUDENT', 'student-1', ownBorrowLog)).toBe(true);
      expect(canUserReceiveAuditNotification('STUDENT', 'student-1', otherBorrowLog)).toBe(false);
      expect(canUserReceiveAuditNotification('STUDENT', 'student-1', stockLog)).toBe(false);
      expect(canUserReceiveAuditNotification('STUDENT', 'student-1', userEntityLog)).toBe(false);
    });
  });

  describe('notificationHub SSE broadcasting', () => {
    it('pushes new audit logs only to authorized clients and deduplicates repeated syncs', async () => {
      const writtenAdmin: string[] = [];
      const writtenStudent: string[] = [];

      const adminRes: any = {
        writableEnded: false,
        destroyed: false,
        write: (chunk: string) => {
          writtenAdmin.push(chunk);
        },
      };
      const studentRes: any = {
        writableEnded: false,
        destroyed: false,
        write: (chunk: string) => {
          writtenStudent.push(chunk);
        },
      };

      const adminClient = notificationHub.registerClient('admin-1', 'ADMIN', adminRes)!;
      const studentClient = notificationHub.registerClient('student-1', 'STUDENT', studentRes)!;
      expect(adminClient).toBeTruthy();
      expect(studentClient).toBeTruthy();

      (prisma.auditLog.findMany as any).mockResolvedValue([
        {
          id: 'evt-user-1',
          userId: 'admin-1',
          action: 'CREATE',
          entity: 'User',
          entityId: 'user-2',
          newValue: { fullName: 'Trần Thị B' },
          createdAt: new Date(Date.now() + 5000),
          user: { fullName: 'Admin' },
        },
        {
          id: 'evt-item-1',
          userId: 'admin-1',
          action: 'CREATE_ITEM',
          entity: 'Item',
          entityId: 'item-1',
          newValue: { code: 'ESP32-S3', name: 'Board ESP32' },
          createdAt: new Date(Date.now() + 6000),
          user: { fullName: 'Admin' },
        },
      ]);

      await notificationHub.syncNewAuditLogs();
      await notificationHub.syncNewAuditLogs();

      notificationHub.unregisterClient(adminClient);
      notificationHub.unregisterClient(studentClient);

      const adminPayload = writtenAdmin.join('');
      const studentPayload = writtenStudent.join('');

      expect(adminPayload).toContain('evt-user-1');
      expect(adminPayload).toContain('evt-item-1');
      expect(studentPayload).not.toContain('evt-user-1');
      expect(studentPayload).toContain('evt-item-1');
      // Deduplicated: evt-item-1 appears only once
      expect(studentPayload.match(/evt-item-1/g)?.length).toBe(2); // id line + JSON data id field
    });
  });

  describe('notificationsRouter HTTP handlers', () => {
    it('GET / returns RBAC-filtered notifications and /stream registers SSE connection', async () => {
      (prisma.auditLog.findMany as any).mockResolvedValue([
        {
          id: 'log-1',
          userId: 'admin-1',
          action: 'IMPORT_STOCK',
          entity: 'StockTransaction',
          entityId: 'tx-1',
          newValue: { transactionNumber: 'IMP-001' },
          createdAt: new Date('2026-11-12T15:10:00Z'),
          user: { fullName: 'Thủ kho' },
        },
      ]);

      const listLayer = notificationsRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.get
      );
      expect(listLayer).toBeTruthy();

      const handler = listLayer!.route!.stack[listLayer!.route!.stack.length - 1].handle;
      let status = 200;
      let body: any = null;
      const res: any = {
        status(code: number) {
          status = code;
          return this;
        },
        json(payload: any) {
          body = payload;
          return this;
        },
      };

      await handler(
        {
          user: { id: 'tech-1', role: 'TECHNICIAN', fullName: 'Tech', email: 't@acm.local' },
          query: { limit: '10' },
        } as any,
        res,
        vi.fn()
      );

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].link).toBe('/transactions');

      const streamLayer = notificationsRouter.stack.find(
        (l: any) => l.route?.path === '/stream' && l.route?.methods?.get
      );
      expect(streamLayer).toBeTruthy();

      const streamHandler = streamLayer!.route!.stack[streamLayer!.route!.stack.length - 1].handle;
      const headers: Record<string, string> = {};
      const chunks: string[] = [];
      const reqEmitter = new EventEmitter() as any;
      reqEmitter.user = { id: 'tech-1', role: 'TECHNICIAN', fullName: 'Tech', email: 't@acm.local' };

      const sseRes: any = {
        writableEnded: false,
        destroyed: false,
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        flushHeaders: vi.fn(),
        write: (c: string) => {
          chunks.push(c);
        },
      };

      streamHandler(reqEmitter, sseRes, vi.fn());
      expect(headers['Content-Type']).toContain('text/event-stream');
      expect(headers['X-Accel-Buffering']).toBe('no');
      expect(chunks.join('')).toContain(': connected');

      reqEmitter.emit('close');
    });
  });
});
