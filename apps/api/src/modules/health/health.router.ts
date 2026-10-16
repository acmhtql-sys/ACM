import { Router, Request, Response, NextFunction } from 'express';
import { checkDatabaseConnection, prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { authorizeRoles } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';

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

/**
 * GET /api/v1/health/sandbox-attestation
 * Internal secure attestation endpoint for sandbox/test runner verification.
 * RBAC: Strictly ADMIN only.
 * Proves actual database connection pool identity of the running Express API process without exposing secrets.
 */
healthRouter.get(
  '/sandbox-attestation',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    // Task 5 Guard: Sandbox attestation is strictly disabled on Production and standard Dev/Test.
    // Setting ENABLE_SANDBOX_ATTESTATION=true ALONE is NEVER enough; active DB connection MUST target acm_inventory_sandbox_s2b.
    const isProduction = process.env.NODE_ENV === 'production';
    const isExplicitlyEnabled = process.env.ENABLE_SANDBOX_ATTESTATION === 'true';
    const isSandboxTargetConfigured =
      (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('acm_inventory_sandbox_s2b')) ||
      (process.env.DATABASE_URL_SANDBOX && process.env.DATABASE_URL_SANDBOX.includes('acm_inventory_sandbox_s2b'));

    // Critical Rejection: If DATABASE_URL targets standard Dev or Test DB, attestation is strictly forbidden
    const isDevOrTestDb =
      (process.env.DATABASE_URL && (process.env.DATABASE_URL.endsWith('/acm_inventory') || process.env.DATABASE_URL.includes('/acm_inventory?') || process.env.DATABASE_URL.includes('/acm_inventory_test'))) ||
      false;

    const isSandboxEnvironment = !isProduction && isExplicitlyEnabled && isSandboxTargetConfigured && !isDevOrTestDb;

    if (!isSandboxEnvironment) {
      return res.status(404).json({
        status: 'error',
        message: 'Endpoint không tồn tại hoặc đã bị vô hiệu hóa trong môi trường này',
      });
    }

    try {
      const rawCheck: any = await prisma.$queryRaw`
        SELECT 
          current_database() as db, 
          current_user as usr, 
          inet_server_addr() as server_addr, 
          inet_server_port() as server_port,
          pg_backend_pid() as backend_pid;
      `;
      const identity = Array.isArray(rawCheck) ? rawCheck[0] : rawCheck;

      // Fail-closed: Even if environment vars matched, if connection pool session is NOT acm_inventory_sandbox_s2b, reject with 404
      if (identity?.db !== 'acm_inventory_sandbox_s2b') {
        return res.status(404).json({
          status: 'error',
          message: 'Endpoint bị vô hiệu hóa vì connection pool không trỏ tới Sandbox database',
        });
      }

      return res.status(200).json({
        status: 'ok',
        service: 'ACM API',
        processPid: process.pid,
        databaseIdentity: {
          database: identity?.db || null,
          user: identity?.usr || null,
          serverAddr: identity?.server_addr || null,
          serverPort: identity?.server_port ? Number(identity.server_port) : null,
          backendPid: identity?.backend_pid ? Number(identity.backend_pid) : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
