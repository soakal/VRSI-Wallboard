import { resolveBackupDir } from '../lib/paths.js';
import { getPersistence } from '../storage/factory.js';
import type { BackupFileInfo } from '../storage/storageTypes.js';
import type { Result } from '../lib/result.js';
import { logger } from '../utils/logger.js';

export type BackupTrigger = 'manual' | 'scheduled' | 'browser_close' | 'server_shutdown';

/** Skip redundant exit backups if one succeeded recently (e.g. dev page refresh). */
const BROWSER_CLOSE_MIN_INTERVAL_MS = 10 * 60 * 1000;

export type BackupRunResult =
  | { ran: true; result: Result<BackupFileInfo> }
  | { ran: false; reason: 'throttled' };

function recentBackupWithin(ms: number): boolean {
  const latest = getPersistence().listBackups()[0];
  if (!latest) return false;
  const age = Date.now() - new Date(latest.createdAt).getTime();
  return age < ms;
}

export async function runBackup(trigger: BackupTrigger): Promise<BackupRunResult> {
  if (trigger === 'browser_close' && recentBackupWithin(BROWSER_CLOSE_MIN_INTERVAL_MS)) {
    logger.info('Browser-close backup skipped (backup created within last 10 minutes)');
    return { ran: false, reason: 'throttled' };
  }

  const dest = resolveBackupDir();
  const result = await getPersistence().backup(dest, { trigger });
  if (result.ok) {
    logger.info('Backup completed', { trigger, file: result.data.file });
  } else {
    logger.warn('Backup failed', { trigger, error: result.error });
  }
  return { ran: true, result };
}
