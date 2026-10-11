import { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Thành công',
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  details?: any
): Response {
  return res.status(statusCode).json({
    success: false,
    message,
    details,
  });
}
