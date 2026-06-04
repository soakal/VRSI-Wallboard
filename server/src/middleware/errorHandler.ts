import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const rawMessage = err.message ?? 'Internal Server Error';

  logger.error('Unhandled error', {
    status,
    message: rawMessage,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  const clientMessage = status >= 500 ? 'Internal Server Error' : rawMessage;
  res.status(status).json({
    error: { code: 'error', message: clientMessage },
    status,
  });
}
