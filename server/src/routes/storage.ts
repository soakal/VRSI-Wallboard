import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { resolveBackupDir, resolveDataDir, resolveLogsDir, dbPath } from '../lib/paths.js';
import { listBackupFilesOnDisk } from '../lib/backupFiles.js';
import { isPathInsideDir } from '../lib/pathSafety.js';
import { logger } from '../utils/logger.js';
import { getPersistence, reloadPersistence } from '../storage/factory.js';
import { runBackup, type BackupTrigger } from '../services/backupService.js';
import { withBoardWriteLock } from '../services/boardService.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { logAudit } from '../services/auditService.js';
import {
  buildSupportBundle,
  cleanupSupportTemp,
  resolveSupportEmail,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_CONTACT_MAX,
} from '../services/supportService.js';

export const storageRouter = Router();
storageRouter.use(requireAdminToken);

storageRouter.get('/status', async (_req: Request, res: Response) => {
  const store = getPersistence();
  const status = await store.getStatus();
  if (!status.ok) {
    res.status(500).json({ error: status.error });
    return;
  }
  res.json({ data: status.data });
});

storageRouter.get('/backups', (_req: Request, res: Response) => {
  const backups = listBackupFilesOnDisk();
  res.json({
    data: {
      directory: resolveBackupDir(),
      scheduleNote:
        'Backups when you close the app or stop the server; also every 6 hours if the Windows backup task is registered (keeps 28 files).',
      backups,
    },
  });
});

storageRouter.post('/backup', async (req: Request, res: Response) => {
  const raw = req.body?.source ?? req.body?.trigger;
  const trigger: BackupTrigger =
    raw === 'browser_close' || raw === 'server_shutdown' || raw === 'scheduled'
      ? raw
      : 'manual';

  const dest = resolveBackupDir();
  const run = await runBackup(trigger);
  if (!run.ran) {
    res.json({ data: { skipped: true, reason: run.reason, destination: dest } });
    return;
  }
  if (!run.result.ok) {
    res.status(500).json({ error: run.result.error });
    return;
  }
  res.json({
    data: {
      skipped: false,
      destination: dest,
      file: run.result.data.file,
      path: run.result.data.path,
      sizeBytes: run.result.data.sizeBytes,
      createdAt: run.result.data.createdAt,
    },
  });
});

storageRouter.post('/restore', async (req: Request, res: Response) => {
  const file = typeof req.body?.file === 'string' ? req.body.file.trim() : '';
  if (!file) {
    res.status(400).json({ error: { code: 'invalid', message: 'body.file (backup filename) is required' } });
    return;
  }

  const backupDir = path.resolve(resolveBackupDir());
  const basename = path.basename(file);
  if (!/^wallboard[\w.-]*\.db$/.test(basename)) {
    res.status(400).json({ error: { code: 'invalid', message: 'Invalid backup file name' } });
    return;
  }
  const source = path.resolve(backupDir, basename);
  if (!isPathInsideDir(source, backupDir)) {
    res.status(400).json({ error: { code: 'invalid', message: 'Invalid backup file path' } });
    return;
  }
  if (!fs.existsSync(source)) {
    res.status(404).json({ error: { code: 'not_found', message: 'Backup file not found' } });
    return;
  }

  let result;
  try {
    result = await withBoardWriteLock(() => getPersistence().restore(source));
  } catch (e) {
    logger.error('Restore route error', { error: e });
    reloadPersistence();
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { code: 'restore_failed', message } });
    return;
  }

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }
  if (result.data.conflicts.length > 0) {
    res.status(409).json({
      error: {
        code: 'restore_conflict',
        message: `${result.data.conflicts.length} restore conflict(s) require user resolution. Live data was not changed.`,
        details: { conflicts: result.data.conflicts },
      },
    });
    return;
  }
  res.json({
    data: {
      restoredFrom: source,
      preRestoreFile: result.data.preRestoreFile ?? null,
      conflicts: [],
      message: 'Database restored. Reload the page to see updated data.',
    },
  });
});

/** Support contact + limits for the in-app support form. */
storageRouter.get('/support-info', (_req: Request, res: Response) => {
  res.json({
    data: {
      supportEmail: resolveSupportEmail(),
      maxMessageLength: SUPPORT_MESSAGE_MAX,
      maxContactLength: SUPPORT_CONTACT_MAX,
    },
  });
});

/**
 * Build a support zip (message + system info + optional logs), save a Desktop
 * copy when possible, and stream the zip for browser download. Client opens
 * mailto: — no Graph mail.
 */
storageRouter.post('/support', (req: Request, res: Response) => {
  const body = req.body as {
    message?: unknown;
    contactName?: unknown;
    replyTo?: unknown;
    attachLogs?: unknown;
  };

  const message = typeof body.message === 'string' ? body.message : '';
  const contactName = typeof body.contactName === 'string' ? body.contactName : undefined;
  const replyTo = typeof body.replyTo === 'string' ? body.replyTo : undefined;
  const attachLogs = body.attachLogs !== false && body.attachLogs !== 'false';

  let bundle: ReturnType<typeof buildSupportBundle>;
  try {
    bundle = buildSupportBundle({ message, contactName, replyTo, attachLogs });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'validation_error') {
      res.status(400).json({
        error: { code: 'validation_error', message: err.message ?? 'Invalid support request' },
      });
      return;
    }
    logger.warn('Support bundle failed', { error: e });
    res.status(500).json({
      error: { code: 'support_bundle_failed', message: 'Could not build the support package' },
    });
    return;
  }

  logAudit('system', 'Support report packaged', bundle.savedPath ?? bundle.filename, true, bundle.sizeBytes);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${bundle.filename}"`);
  res.setHeader('X-VRSI-Support-Email', bundle.supportEmail);
  res.setHeader('X-VRSI-Filename', bundle.filename);
  if (bundle.savedPath) {
    res.setHeader('X-VRSI-Saved-Path', bundle.savedPath);
  }

  const stream = fs.createReadStream(bundle.zipPath);
  stream.on('close', () => cleanupSupportTemp(bundle.zipPath));
  stream.on('error', (e) => {
    logger.warn('Support zip stream failed', { error: e });
    cleanupSupportTemp(bundle.zipPath);
    if (!res.headersSent) {
      res.status(500).json({
        error: { code: 'support_bundle_failed', message: 'Could not send the support package' },
      });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
});

/** Download the combined server log (tail-capped) so IT can diagnose remotely. */
storageRouter.get('/logs-export', (_req: Request, res: Response) => {
  try {
    const file = path.join(resolveLogsDir(), 'combined.log');
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: { code: 'not_found', message: 'No log file yet' } });
      return;
    }
    const MAX_BYTES = 5 * 1024 * 1024; // return at most the last 5 MB
    const { size } = fs.statSync(file);
    const start = size > MAX_BYTES ? size - MAX_BYTES : 0;
    const fd = fs.openSync(file, 'r');
    try {
      const length = size - start;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="wallboard-log-${stamp}.txt"`);
      if (start > 0) res.write(`[…truncated to last ${Math.round(MAX_BYTES / 1024 / 1024)} MB…]\n`);
      res.end(buf);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    logger.warn('Log export failed', { error: e });
    res.status(500).json({ error: { code: 'log_export_failed', message: 'Could not read logs' } });
  }
});

storageRouter.get('/audit-log', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1000);
  const entries = getPersistence().getAuditLog(limit);
  res.json({ data: entries });
});

/** IT-facing summary: data location, audit counts, network hosts, safety bullets. */
storageRouter.get('/security-report', (_req: Request, res: Response) => {
  try {
    const report = getPersistence().getSecurityReport();
    res.json({ data: report });
  } catch (e) {
    logger.warn('Security report unavailable', { error: e });
    const dataDir = resolveDataDir();
    res.json({
      data: {
        generatedAt: new Date().toISOString(),
        standaloneMode: process.env.DISABLE_AZURE === 'true',
        azureEnabled: process.env.DISABLE_AZURE !== 'true',
        dataDirectory: dataDir,
        databaseFile: dbPath(dataDir),
        backupDirectory: resolveBackupDir(),
        logDirectory: resolveLogsDir(),
        auditCountsByType: [],
        externalHostsContacted: [],
        recentNetworkActivity: [],
        lastSuccessfulBackup: null,
        safetySummary: [
          'IT summary could not be loaded from the database (it may be busy or recovering after restore).',
          'Use the Backup & restore tab to recover from a .db backup file.',
          'Restart the WallBoard server if backup or restore buttons do not work.',
        ],
        degraded: true,
      },
    });
  }
});
