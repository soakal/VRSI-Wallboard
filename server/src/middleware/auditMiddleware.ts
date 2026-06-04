import type { Request, Response, NextFunction } from 'express';
import { logAudit } from '../services/auditService.js';

/** Record every API request when the response finishes (for IT visibility). */
export function auditApiMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }

  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    const pathOnly = req.originalUrl.split('?')[0];
    const success = res.statusCode < 400;
    logAudit(
      'api_request',
      `${req.method} ${pathOnly} → ${res.statusCode} (${ms}ms)`,
      pathOnly,
      success
    );
  });

  next();
}
