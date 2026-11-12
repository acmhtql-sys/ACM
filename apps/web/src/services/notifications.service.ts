import { apiClient } from './api';

export type NotificationType = 'warning' | 'info' | 'success';

export interface SystemNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  categoryLabel: string;
  entity: string;
  action: string;
  actorName: string;
  createdAt: string;
}

export interface NotificationReadState {
  readAllBefore: string | null;
  readIds: string[];
}

export interface ParsedSseEvent {
  event: string;
  data: string;
}

const READ_STORAGE_PREFIX = 'acm_notif_read_v1_';
const MAX_STORED_READ_IDS = 200;

function readStorageKey(userId?: string): string | null {
  return userId ? `${READ_STORAGE_PREFIX}${userId}` : null;
}

export function loadNotificationReadState(userId?: string): NotificationReadState {
  const key = readStorageKey(userId);
  if (!key || typeof window === 'undefined') {
    return { readAllBefore: null, readIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { readAllBefore: null, readIds: [] };
    const parsed = JSON.parse(raw);
    return {
      readAllBefore: typeof parsed?.readAllBefore === 'string' ? parsed.readAllBefore : null,
      readIds: Array.isArray(parsed?.readIds)
        ? parsed.readIds.filter((id: unknown): id is string => typeof id === 'string').slice(-MAX_STORED_READ_IDS)
        : [],
    };
  } catch {
    return { readAllBefore: null, readIds: [] };
  }
}

function saveNotificationReadState(userId: string | undefined, state: NotificationReadState): void {
  const key = readStorageKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        readAllBefore: state.readAllBefore,
        readIds: state.readIds.slice(-MAX_STORED_READ_IDS),
      })
    );
  } catch {
    // Ignore storage quota / restricted mode errors
  }
}

export function isNotificationRead(
  item: Pick<SystemNotification, 'id' | 'createdAt'>,
  state: NotificationReadState
): boolean {
  if (state.readIds.includes(item.id)) return true;
  if (state.readAllBefore && item.createdAt <= state.readAllBefore) return true;
  return false;
}

export function markNotificationIdRead(
  userId: string | undefined,
  id: string,
  current: NotificationReadState
): NotificationReadState {
  if (current.readIds.includes(id)) return current;
  const next: NotificationReadState = {
    ...current,
    readIds: [...current.readIds, id].slice(-MAX_STORED_READ_IDS),
  };
  saveNotificationReadState(userId, next);
  return next;
}

export function markAllNotificationsRead(
  userId: string | undefined,
  latestCreatedAt?: string
): NotificationReadState {
  const next: NotificationReadState = {
    readAllBefore: latestCreatedAt || new Date().toISOString(),
    readIds: [],
  };
  saveNotificationReadState(userId, next);
  return next;
}

export function formatRelativeTimeVi(isoTimestamp: string, nowMs = Date.now()): string {
  const ts = Date.parse(isoTimestamp);
  if (!Number.isFinite(ts)) return 'Vừa xong';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

export function parseSseChunkBuffer(buffer: string): {
  events: ParsedSseEvent[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';
  const events: ParsedSseEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith(':') || !line) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }

  return { events, remainder };
}

export async function fetchNotifications(limit = 25): Promise<SystemNotification[]> {
  const res = await apiClient.get('/notifications', { params: { limit } });
  return Array.isArray(res.data?.data) ? (res.data.data as SystemNotification[]) : [];
}

export type StreamFailureReason = 'NOT_SUPPORTED' | 'UNAUTHORIZED' | 'DISCONNECTED';

export interface SubscribeNotificationStreamOptions {
  token: string;
  signal: AbortSignal;
  onConnected?: () => void;
  onNotification: (item: SystemNotification) => void;
  onDisconnect?: (reason: StreamFailureReason) => void;
}

export async function subscribeToNotificationStream({
  token,
  signal,
  onConnected,
  onNotification,
  onDisconnect,
}: SubscribeNotificationStreamOptions): Promise<void> {
  const baseUrl = (apiClient.defaults.baseURL || 'http://localhost:5000/api/v1').replace(/\/$/, '');

  try {
    const response = await fetch(`${baseUrl}/notifications/stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      cache: 'no-store',
      signal,
    });

    if (response.status === 404) {
      onDisconnect?.('NOT_SUPPORTED');
      return;
    }
    if (response.status === 401 || response.status === 403) {
      onDisconnect?.('UNAUTHORIZED');
      return;
    }
    if (!response.ok || !response.body) {
      onDisconnect?.('DISCONNECTED');
      return;
    }

    onConnected?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSseChunkBuffer(buffer);
      buffer = remainder;

      for (const evt of events) {
        if (evt.event === 'notification') {
          try {
            const parsed = JSON.parse(evt.data) as SystemNotification;
            if (parsed && typeof parsed.id === 'string') {
              onNotification(parsed);
            }
          } catch {
            // Skip malformed frame cleanly
          }
        }
      }
    }

    if (!signal.aborted) {
      onDisconnect?.('DISCONNECTED');
    }
  } catch {
    if (!signal.aborted) {
      onDisconnect?.('DISCONNECTED');
    }
  }
}
