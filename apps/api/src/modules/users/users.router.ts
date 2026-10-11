import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../shared/response';
import { authenticate } from '../../middleware/auth';
import { authorizeRoles } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';

export const usersRouter = Router();

usersRouter.get(
  '/',
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.LAB_MANAGER),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          studentOrStaffId: true,
          department: true,
          isActive: true,
          isLocked: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return sendSuccess(res, users, 'Danh sách người dùng từ Database');
    } catch (err) {
      next(err);
    }
  }
);
