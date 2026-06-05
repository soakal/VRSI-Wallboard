import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { resolveBackupDir, resolveDataDir, resolveLogsDir, dbPath } from '../lib/paths.js';
import { listBackupFilesOnDisk } from '../lib/backupFiles.js';
import { isPathInsideDir } from '../lib/pathSafety.js';
import { logger } from '../utils/logger.js';
import { getPersistence, reloadPersistence } from '../storage/factory.js';
import { runBackup, type BackupTrigger } from '../services/backupService.js';
import { requireAdminToken } from '../middleware/adminAuth.js';

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
    result = await getPersistence().restore(source);
  } catch (e) {
    logger.error('Restore route error', { error: e });
    reloadPersistence();
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { code: 'restore_failed', message } });
    return;
  }

  reloadPersistence();

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }
  if (result.data.conflicts.length > 0) {
    res.status(409).json({
      error: {
        code: 'restore_conflict',
        message: `${result.data.conflicts.length} restore conflict(s) require user resolution. Live data was not changed.`,
      },
      data: {
        restoredFrom: source,
        preRestoreFile: result.data.preRestoreFile ?? null,
        conflicts: result.data.conflicts,
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
