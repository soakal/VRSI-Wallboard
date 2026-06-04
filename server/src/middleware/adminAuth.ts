import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

function isLocalhost(req: Request): boolean {
  const ip = req.ip ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// Kiosk threat model: the server binds to 127.0.0.1, so only local processes
// can reach it. TRUST_LOCALHOST=true (default) allows the kiosk browser through
// without a token. Set TRUST_LOCALHOST=false before any LAN exposure or if a
// reverse proxy is placed in front (which would forward its own loopback address).
const trustLocalhost = process.env.TRUST_LOCALHOST !== 'false';

let warnedOpen = false;

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  if (trustLocalhost && isLocalhost(req)) {
    next();
    return;
  }

  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected) {
    // No token configured and caller is not localhost — fail closed always.
    // Set ALLOW_OPEN_BOARD=true to opt into open access (non-production tooling only).
    if (process.env.ALLOW_OPEN_BOARD !== 'true') {
      if (!warnedOpen) {
        logger.warn('ADMIN_TOKEN not set and ALLOW_OPEN_BOARD not set — non-localhost board requests will be rejected');
        warnedOpen = true;
      }
      res.status(503).json({
        error: { code: 'admin_token_unconfigured', message: 'Admin access is not configured' },
      });
      return;
    }
    next();
    return;
  }

  const header = req.header('X-Admin-Token');
  const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const provided = (header ?? bearer ?? '').trim();

  // Constant-time comparison to prevent timing attacks.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid or missing admin token' },
    });
    return;
  }

  next();
}
