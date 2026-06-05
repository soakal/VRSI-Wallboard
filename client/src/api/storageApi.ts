export interface AuditEntry {
  id: number;
  timestamp: string;
  type: string;
  detail: string;
  path?: string | null;
  success: number | boolean;
  sizeBytes?: number | null;
}

export interface SecurityReport {
  generatedAt: string;
  standaloneMode: boolean;
  azureEnabled: boolean;
  dataDirectory: string;
  databaseFile: string;
  backupDirectory: string;
  logDirectory: string;
  auditCountsByType: Array<{ type: string; count: number }>;
  externalHostsContacted: string[];
  recentNetworkActivity: Array<{ timestamp: string; detail: string; path?: string; success: number }>;
  lastSuccessfulBackup: { timestamp: string; detail: string; path?: string } | null;
  safetySummary: string[];
}

export async function fetchAuditLog(limit = 200): Promise<AuditEntry[]> {
  const res = await fetch(`/api/storage/audit-log?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load audit log');
  const json = (await res.json()) as { data: AuditEntry[] };
  return json.data;
}

export async function fetchSecurityReport(): Promise<SecurityReport> {
  const res = await fetch('/api/storage/security-report');
  if (!res.ok) throw new Error('Failed to load security report');
  const json = (await res.json()) as { data: SecurityReport };
  return json.data;
}

export interface BackupFile {
  file: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupsResponse {
  directory: string;
  scheduleNote: string;
  backups: BackupFile[];
}

export interface RestoreConflict {
  jobNumber: string;
  backup: {
    version: number;
    updatedAt: string;
    status: string;
  };
  live: {
    version: number;
    updatedAt: string;
    status: string;
  };
}

export class RestoreConflictError extends Error {
  conflicts: RestoreConflict[];
  preRestoreFile: string | null;

  constructor(message: string, conflicts: RestoreConflict[], preRestoreFile: string | null) {
    super(message);
    this.name = 'RestoreConflictError';
    this.conflicts = conflicts;
    this.preRestoreFile = preRestoreFile;
  }
}

export async function fetchBackups(): Promise<BackupsResponse> {
  const res = await fetch('/api/storage/backups');
  if (!res.ok) throw new Error('Failed to list backups');
  const json = (await res.json()) as { data: BackupsResponse };
  return json.data;
}

export async function runBackupNow(): Promise<{ file: string; path: string; sizeBytes: number }> {
  const res = await fetch('/api/storage/backup', { method: 'POST' });
  if (!res.ok) throw new Error('Backup failed');
  const json = (await res.json()) as { data: { file: string; path: string; sizeBytes: number } };
  return json.data;
}

export async function restoreBackup(file: string): Promise<{ preRestoreFile: string | null; conflicts: RestoreConflict[] }> {
  const res = await fetch('/api/storage/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string } | string;
      data?: { conflicts?: RestoreConflict[]; preRestoreFile?: string | null };
    };
    const e = err.error;
    const msg =
      typeof e === 'object' && e?.message
        ? e.message
        : typeof e === 'string'
          ? e
          : 'Restore failed';
    if (typeof e === 'object' && e?.code === 'restore_conflict') {
      throw new RestoreConflictError(msg, err.data?.conflicts ?? [], err.data?.preRestoreFile ?? null);
    }
    throw new Error(msg);
  }
  const json = (await res.json()) as { data: { preRestoreFile: string | null; conflicts: RestoreConflict[] } };
  return json.data;
}
