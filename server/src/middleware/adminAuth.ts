import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

let warnedOpen = false;

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('ADMIN_TOKEN not set in production — refusing board API request');
      res.status(503).json({
        error: { code: 'admin_token_unconfigured', message: 'Admin access is not configured' },
      });
      return;
    }
    if (!warnedOpen) {
      logger.warn('ADMIN_TOKEN not set — board APIs are open (non-production only)');
      warnedOpen = true;
    }
    next();
    return;
  }

  const header = req.header('X-Admin-Token');
  const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const provided = header ?? bearer;

  if (provided !== expected) {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid or missing admin token' },
    });
    return;
  }

  next();
}
