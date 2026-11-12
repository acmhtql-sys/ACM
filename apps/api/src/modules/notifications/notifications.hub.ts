import { Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import {
  canUserReceiveAuditNotification,
  mapAuditLogToNotification,
} from './notifications.mapper';

interface SseClient {
  id: string;
  userId: string;
  role: string;
  res: Response;
}

const MAX_SSE_CLIENTS = 200;
const MAX_SEEN_IDS = 500;
const POLL_INTERVAL_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 20000;
const TRIGGER_DEBOUNCE_MS = 150;

class NotificationHub {
  private clients = new Map<string, SseClient>();
  private seenIds: string[] = [];
  private seenIdSet = new Set<string>();
  private cursorDate = new Date();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInFlight = false;
  private syncQueued = false;
  private nextClientSeq = 1;

  public registerClient(userId: string, role: string, res: Response): string | null {
    if (this.clients.size >= MAX_SSE_CLIENTS) {
      return null;
    }

    const clientId = `sse-${this.nextClientSeq++}`;
    if (this.clients.size === 0) {
      // Overlap slightly by 2s so changes committed right during initial fetch are not missed;
      // client state deduplicates notifications by ID.
      this.cursorDate = new Date(Date.now() - 2000);
      this.startBackgroundTimers();
    }

    this.clients.set(clientId, { id: clientId, userId, role, res });
    this.safeWrite(clientId, res, ': connected\n\n');
    return clientId;
  }

  public unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
    if (this.clients.size === 0) {
      this.stopBackgroundTimers();
    }
  }

  public scheduleSync(): void {
    if (this.clients.size === 0) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNewAuditLogs();
    }, TRIGGER_DEBOUNCE_MS);
    if (this.debounceTimer.unref) {
      this.debounceTimer.unref();
    }
  }

  private startBackgroundTimers(): void {
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        void this.syncNewAuditLogs();
      }, POLL_INTERVAL_MS);
      if (this.pollTimer.unref) this.pollTimer.unref();
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        for (const [id, client] of this.clients.entries()) {
          this.safeWrite(id, client.res, ': ping\n\n');
        }
      }, HEARTBEAT_INTERVAL_MS);
      if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
    }
  }

  private stopBackgroundTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private recordSeenId(id: string): void {
    this.seenIdSet.add(id);
    this.seenIds.push(id);
    while (this.seenIds.length > MAX_SEEN_IDS) {
      const oldest = this.seenIds.shift();
      if (oldest) this.seenIdSet.delete(oldest);
    }
  }

  private safeWrite(clientId: string, res: Response, chunk: string): void {
    if (res.writableEnded || res.destroyed) {
      this.unregisterClient(clientId);
      return;
    }
    try {
      res.write(chunk);
    } catch {
      this.unregisterClient(clientId);
    }
  }

  public async syncNewAuditLogs(): Promise<void> {
    if (this.clients.size === 0) return;
    if (this.syncInFlight) {
      this.syncQueued = true;
      return;
    }

    this.syncInFlight = true;
    try {
      const logs = await prisma.auditLog.findMany({
        where: {
          createdAt: { gte: this.cursorDate },
        },
        include: {
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const log of logs) {
        if (log.createdAt > this.cursorDate) {
          this.cursorDate = log.createdAt;
        }
        if (this.seenIdSet.has(log.id)) {
          continue;
        }
        this.recordSeenId(log.id);

        for (const [clientId, client] of this.clients.entries()) {
          if (!canUserReceiveAuditNotification(client.role, client.userId, log)) {
            continue;
          }
          const payload = mapAuditLogToNotification(log, client.role);
          const frame = `id: ${payload.id}\nevent: notification\ndata: ${JSON.stringify(payload)}\n\n`;
          this.safeWrite(clientId, client.res, frame);
        }
      }
    } catch (err: any) {
      logger.warn(`Notification sync failed: ${err?.message || err}`);
    } finally {
      this.syncInFlight = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        this.scheduleSync();
      }
    }
  }
}

export const notificationHub = new NotificationHub();
