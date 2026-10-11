import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../shared/AppError';
import { sendSuccess } from '../../shared/response';
import { authenticate } from '../../middleware/auth';
import { loginSchema } from '@acm/shared';

export const authRouter = Router();

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials directly from PostgreSQL Database
 */
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Email hoặc mật khẩu không hợp lệ', 422, parsed.error.errors);
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new AppError('Email hoặc mật khẩu không chính xác', 401);
    }

    if (!user.isActive || user.isLocked) {
      throw new AppError('Tài khoản đã bị vô hiệu hóa hoặc tạm khóa', 403);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Email hoặc mật khẩu không chính xác', 401);
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };

    const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      },
      'Đăng nhập thành công'
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/me
 */
authRouter.get('/me', authenticate, (req: Request, res: Response) => {
  sendSuccess(res, { user: req.user }, 'Thông tin tài khoản hiện tại');
});
