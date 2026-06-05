import { getPersistence } from '../storage/factory.js';

export type AuditType =
  | 'api_request'
  | 'file_read'
  | 'file_write'
  | 'network_request'
  | 'backup'
  | 'restore'
  | 'system';

export function logAudit(
  type: AuditType,
  detail: string,
  auditPath?: string,
  success = true,
  sizeBytes?: number
): void {
  try {
    getPersistence().logAudit(type, detail, auditPath, success, sizeBytes);
  } catch {
    /* persistence may not be ready during early boot */
  }
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

