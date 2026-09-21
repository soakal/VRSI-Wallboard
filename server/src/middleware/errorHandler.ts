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
  // better-sqlite3 throws SQLITE_BUSY* when another process (backup/AV/sync
  // tool, or the .db open in a viewer) holds a lock past the 5s busy timeout.
  // Surface it as a retryable 503 with an actionable message instead of a
  // generic "Internal Server Error" — the board UI shows this text to the
  // user, who would otherwise see a save silently fail.
  const sqliteCode = (err as { code?: unknown }).code;
  if (typeof sqliteCode === 'string' && sqliteCode.startsWith('SQLITE_BUSY')) {
    logger.error('SQLite database is locked by another process', {
      code: sqliteCode,
      path: req.path,
      method: req.method,
      message: err.message,
    });
    res.status(503).json({
      error: {
        code: 'db_busy',
        message:
          'The job database is locked by another program (backup, antivirus, or a database viewer). Your change was NOT saved — try again in a moment.',
      },
    });
    return;
  }

  // Read-only / permission / disk-full / I/O failures are environment problems
  // (folder permissions changed, disk full) that a restart won't fix.  Say so
  // instead of a bare 500 — and log the real code, which was invisible before.
  if (typeof sqliteCode === 'string' && /^SQLITE_(READONLY|CANTOPEN|PERM|FULL|IOERR)/.test(sqliteCode)) {
    logger.error('SQLite database is not writable', {
      code: sqliteCode,
      path: req.path,
      method: req.method,
      message: err.message,
    });
    res.status(500).json({
      error: {
        code: 'db_unwritable',
        message:
          "The server can't write to its data folder (permissions or disk space). Your change was NOT saved — ask IT to check the WallBoard data folder permissions and free disk space.",
      },
    });
    return;
  }

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
  // Body matches the route contract exactly: { error: { code, message } }.
  // The HTTP status line carries the status code (no redundant body field).
  res.status(status).json({
    error: { code: 'error', message: clientMessage },
  });
}
