import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { sendSuccess } from '../../shared/response';
import { notificationHub } from './notifications.hub';
import {
  canUserReceiveAuditNotification,
  mapAuditLogToNotification,
} from './notifications.mapper';

export const notificationsRouter = Router();

function buildRoleEntityFilter(role: string) {
  if (role === 'ADMIN') return undefined;
  if (role === 'LAB_MANAGER' || role === 'TECHNICIAN') {
    return {
      entity: {
        in: [
          'Item',
          'Category',
          'Kit',
          'Location',
          'StockTransaction',
          'BorrowRequest',
          'BorrowReturnOperation',
        ],
      },
    };
  }
  return {
    entity: {
      in: ['Item', 'Category', 'Kit', 'BorrowRequest', 'BorrowReturnOperation'],
    },
  };
}

/**
 * GET /api/v1/notifications
 * Returns recent system change notifications filtered strictly by caller's RBAC scope.
 */
notificationsRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const rawLimit = req.query?.limit ? parseInt(String(req.query.limit), 10) || 25 : 25;
      const limit = Math.min(50, Math.max(1, rawLimit));

      const logs = await prisma.auditLog.findMany({
        where: buildRoleEntityFilter(user.role),
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, limit * 3),
      });

      const items = logs
        .filter((log) => canUserReceiveAuditNotification(user.role, user.id, log))
        .slice(0, limit)
        .map((log) => mapAuditLogToNotification(log, user.role));

      return sendSuccess(res, items, 'Danh sách thông báo hệ thống');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/notifications/stream
 * Server-Sent Events (SSE) stream pushing realtime system changes over authenticated Bearer fetch.
 */
notificationsRouter.get(
  '/stream',
  authenticate,
  (req: Request, res: Response) => {
    const user = req.user!;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const clientId = notificationHub.registerClient(user.id, user.role, res);
    if (!clientId) {
      res.status(503).end();
      return;
    }

    req.on('close', () => {
      notificationHub.unregisterClient(clientId);
    });
  }
);
