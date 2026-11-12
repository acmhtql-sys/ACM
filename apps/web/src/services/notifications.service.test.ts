import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSseChunkBuffer,
  formatRelativeTimeVi,
  loadNotificationReadState,
  isNotificationRead,
  markNotificationIdRead,
  markAllNotificationsRead,
  subscribeToNotificationStream,
  type SystemNotification,
} from './notifications.service';

const sampleNotification: SystemNotification = {
  id: 'audit-1',
  type: 'info',
  title: 'Yêu cầu mượn mới',
  message: 'Tạo phiếu mượn Arduino Uno R3.',
  link: '/borrow-return',
  categoryLabel: 'Mượn & Trả',
  entity: 'BorrowRequest',
  action: 'CREATE',
  actorName: 'Nguyễn Văn An',
  createdAt: '2026-11-12T10:00:00.000Z',
};

describe('notifications.service', () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const store = new Map<string, string>();
    const mockWindow = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    };
    vi.stubGlobal('window', mockWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    }
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    }
  });

  describe('parseSseChunkBuffer', () => {
    it('parses complete notification and connected events and preserves partial trailing chunks', () => {
      const chunk =
        ': ping\n\n' +
        'event: connected\n' +
        'data: {"ok":true}\n\n' +
        'event: notification\n' +
        `data: ${JSON.stringify(sampleNotification)}\n\n` +
        'event: notification\n' +
        'data: {"id":"partial"';

      const result = parseSseChunkBuffer(chunk);
      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toEqual({ event: 'connected', data: '{"ok":true}' });
      expect(result.events[1].event).toBe('notification');
      expect(JSON.parse(result.events[1].data).id).toBe('audit-1');
      expect(result.remainder).toBe('event: notification\ndata: {"id":"partial"');
    });

    it('handles CRLF line endings cleanly', () => {
      const result = parseSseChunkBuffer('event: notification\r\ndata: {"id":"crlf-1"}\r\n\r\n');
      expect(result.events).toEqual([{ event: 'notification', data: '{"id":"crlf-1"}' }]);
      expect(result.remainder).toBe('');
    });
  });

  describe('formatRelativeTimeVi', () => {
    it('formats seconds, minutes, hours, and days in Vietnamese', () => {
      const now = Date.parse('2026-11-12T12:00:00.000Z');
      expect(formatRelativeTimeVi('2026-11-12T11:59:30.000Z', now)).toBe('Vừa xong');
      expect(formatRelativeTimeVi('2026-11-12T11:45:00.000Z', now)).toBe('15 phút trước');
      expect(formatRelativeTimeVi('2026-11-12T09:00:00.000Z', now)).toBe('3 giờ trước');
      expect(formatRelativeTimeVi('2026-11-10T12:00:00.000Z', now)).toBe('2 ngày trước');
      expect(formatRelativeTimeVi('invalid-date', now)).toBe('Vừa xong');
    });
  });

  describe('read-state persistence', () => {
    it('persists single-item read and mark-all-read scoped by userId', () => {
      const initial = loadNotificationReadState('user-1');
      expect(isNotificationRead(sampleNotification, initial)).toBe(false);

      const afterOne = markNotificationIdRead('user-1', 'audit-1', initial);
      expect(isNotificationRead(sampleNotification, afterOne)).toBe(true);
      expect(isNotificationRead(sampleNotification, loadNotificationReadState('user-1'))).toBe(true);
      expect(isNotificationRead(sampleNotification, loadNotificationReadState('user-2'))).toBe(false);

      const afterAll = markAllNotificationsRead('user-1', '2026-11-12T10:30:00.000Z');
      expect(isNotificationRead(sampleNotification, afterAll)).toBe(true);
      expect(
        isNotificationRead(
          { id: 'audit-2', createdAt: '2026-11-12T11:00:00.000Z' },
          afterAll
        )
      ).toBe(false);
    });
  });

  describe('subscribeToNotificationStream', () => {
    it('streams parsed notifications via Authorization Bearer fetch and notifies on disconnect', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode(': welcome\n\nevent: notification\ndata: '),
        encoder.encode(`${JSON.stringify(sampleNotification)}\n\n`),
      ];
      let index = 0;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (index < chunks.length) {
                return { value: chunks[index++], done: false };
              }
              return { value: undefined, done: true };
            },
          }),
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const controller = new AbortController();
      const received: SystemNotification[] = [];
      const onConnected = vi.fn();
      const onDisconnect = vi.fn();

      await subscribeToNotificationStream({
        token: 'jwt-secret-token',
        signal: controller.signal,
        onConnected,
        onNotification: (item) => received.push(item),
        onDisconnect,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toMatch(/\/notifications\/stream$/);
      expect(url).not.toContain('jwt-secret-token');
      expect(init.headers.Authorization).toBe('Bearer jwt-secret-token');
      expect(onConnected).toHaveBeenCalledTimes(1);
      expect(received).toEqual([sampleNotification]);
      expect(onDisconnect).toHaveBeenCalledWith('DISCONNECTED');
    });

    it('reports NOT_SUPPORTED on 404 and UNAUTHORIZED on 401', async () => {
      const controller = new AbortController();
      const onDisconnect = vi.fn();

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      await subscribeToNotificationStream({
        token: 'jwt',
        signal: controller.signal,
        onNotification: () => undefined,
        onDisconnect,
      });
      expect(onDisconnect).toHaveBeenLastCalledWith('NOT_SUPPORTED');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
      await subscribeToNotificationStream({
        token: 'jwt',
        signal: controller.signal,
        onNotification: () => undefined,
        onDisconnect,
      });
      expect(onDisconnect).toHaveBeenLastCalledWith('UNAUTHORIZED');
    });
  });
});
