import cron from 'node-cron';
import { getPersistence } from '../storage/factory.js';
import { logger } from '../utils/logger.js';

/** Audit entries older than this are deleted at startup and daily at 3:30 AM. */
const AUDIT_RETENTION_DAYS = 90;

export type AuditType =
  | 'api_request'
  | 'file_read'
  | 'file_write'
  | 'network_request'
  | 'backup'
  | 'restore'
  | 'system';

/** A broken audit write repeats on every request — warn at most this often. */
const AUDIT_WARN_INTERVAL_MS = 5 * 60 * 1000;
let lastAuditWarnAt = 0;

export function logAudit(
  type: AuditType,
  detail: string,
  auditPath?: string,
  success = true,
  sizeBytes?: number
): void {
  try {
    getPersistence().logAudit(type, detail, auditPath, success, sizeBytes);
  } catch (e) {
    // Persistence may not be ready during early boot, but a failure that keeps
    // happening means the DB is unwritable (permissions / disk) — say so once
    // in a while instead of failing silently for days.
    const now = Date.now();
    if (now - lastAuditWarnAt >= AUDIT_WARN_INTERVAL_MS) {
      lastAuditWarnAt = now;
      logger.warn('Audit log write failed', {
        code: typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

function pruneAuditLog(): void {
  try {
    const removed = getPersistence().pruneAuditLog(AUDIT_RETENTION_DAYS);
    if (removed > 0) {
      logger.info('Audit log pruned', { removed, retentionDays: AUDIT_RETENTION_DAYS });
    }
  } catch (e) {
    logger.warn('Audit log prune failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Prune once now and every day at 3:30 AM (after the kiosk's 3 AM reload),
 * so the audit table stays bounded on machines that run for years.
 */
export function startAuditPruneCron(): void {
  pruneAuditLog();
  cron.schedule('30 3 * * *', pruneAuditLog);
}

/** Log outbound HTTP(S) — never pass tokens or secrets in detail/path. */
export function logNetworkRequest(
  method: string,
  url: string,
  success: boolean,
  statusCode?: number,
  note?: string
): void {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw path for relative URLs */
  }

  const azureOff = process.env.DISABLE_AZURE === 'true';
  const detail = azureOff
    ? `[test mode] ${method} ${host}${note ? ` — ${note}` : ''}`
    : `${method} ${host} → ${statusCode ?? '—'}${note ? ` — ${note}` : ''}`;

  logAudit('network_request', detail, url.split('?')[0], success);
}

