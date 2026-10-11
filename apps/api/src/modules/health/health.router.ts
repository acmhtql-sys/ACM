import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../../config/database';

export const healthRouter = Router();

/**
 * GET /api/v1/health
 * General health check endpoint matching Phase 1 spec
 */
healthRouter.get('/', async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();

  res.status(200).json({
    status: 'ok',
    service: 'ACM API',
    timestamp: new Date().toISOString(),
    database: dbStatus.connected ? 'connected' : 'disconnected',
  });
});

/**
 * GET /api/v1/health/liveness
 * Checks if the Node.js/Express process is running and alive
 */
healthRouter.get('/liveness', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'ACM API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/health/readiness
 * Checks if API is ready to serve database-dependent requests
 * Returns 503 if Database is disconnected
 */
healthRouter.get('/readiness', async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();

  if (!dbStatus.connected) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'ACM API',
      database: 'disconnected',
      message: 'Dịch vụ chưa sẵn sàng: Cơ sở dữ liệu chưa kết nối thành công',
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json({
    status: 'ready',
    service: 'ACM API',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});
