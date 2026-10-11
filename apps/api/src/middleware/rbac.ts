import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/AppError';
import { UserRole } from '@prisma/client';

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Yêu cầu xác thực tài khoản trước', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Bạn không có quyền thực hiện hành động này. Yêu cầu một trong các quyền: [${allowedRoles.join(', ')}]`,
          403
        )
      );
    }

    next();
  };
}
