import { Request, Response, NextFunction } from 'express';
import { idempotencyService } from '../modules/inventory/idempotency.service';
import { AppError } from '../shared/AppError';

export interface IdempotencyRequest extends Request {
  idempotencyKey?: string;
}

/**
 * Middleware ensuring Idempotency-Key header is provided and strictly formatted.
 */
export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const rawKey = req.headers['idempotency-key'];

  if (!rawKey || typeof rawKey !== 'string') {
    return next(
      new AppError(
        "Header 'Idempotency-Key' là bắt buộc đối với thao tác ghi giao dịch kho",
        400
      )
    );
  }

  const trimmedKey = rawKey.trim();

  if (!idempotencyService.validateKey(trimmedKey)) {
    return next(
      new AppError(
        "Định dạng 'Idempotency-Key' không hợp lệ (yêu cầu từ 8 đến 64 ký tự chữ, số, gạch ngang, gạch dưới)",
        400
      )
    );
  }

  (req as IdempotencyRequest).idempotencyKey = trimmedKey;
  next();
}
