import { Request } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface AuditParams {
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  req?: Request;
}

export async function recordAuditLog(params: AuditParams): Promise<void> {
  try {
    const ipAddress = params.req?.ip || params.req?.socket?.remoteAddress;
    const userAgent = params.req?.headers['user-agent'];

    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        oldValue: params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : undefined,
        newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : undefined,
        ipAddress: typeof ipAddress === 'string' ? ipAddress : undefined,
        userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      },
    });
  } catch (err: any) {
    logger.error(`Failed to write AuditLog: ${err.message}`);
  }
}
