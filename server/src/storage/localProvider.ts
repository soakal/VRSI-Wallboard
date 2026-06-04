import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { listBackupFilesOnDisk } from '../lib/backupFiles.js';
import { removeWalSidecars } from '../lib/dbSidecars.js';
import { dbPath, resolveBackupDir, resolveDataDir, resolveLogsDir } from '../lib/paths.js';
import { logger } from '../utils/logger.js';
import { ok, err, type Result } from '../lib/result.js';
import type { BoardConfig, ImportResult, Job, JobNote, JobStatus } from '@vrsi/wallboard-shared';
import { DEFAULT_BOARD_CONFIG as DEFAULT_BC } from '@vrsi/wallboard-shared';
import type { StorageMode, StorageProvider } from './storageTypes.js';
import { SCHEMA_SQL } from './schema.js';
import type { BoardPersistence, JobStateEntry, JobsFile } from './boardPersistence.js';
import { migrateJsonToSqliteIfNeeded } from './migrate.js';

const CONFIG_APP_KEY = 'app_config';
const CONFIG_BOARD_KEY = 'board_config';

export class LocalStorageProvider implements StorageProvider, BoardPersistence {
  private db: Database.Database;
  readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? resolveDataDir();
    fs.mkdirSync(this.dataDir, { recursive: true });
    const file = dbPath(this.dataDir);
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
    migrateJsonToSqliteIfNeeded(this);
    this.ensureJobsMetaRow();
  }

  private ensureJobsMetaRow(): void {
    const row = this.db.prepare('SELECT id FROM jobs_import_meta WHERE id = 1').get();
    if (!row) {
      this.db
        .prepare(
          `INSERT INTO jobs_import_meta (id, imported_at, source_file, new_job_numbers)
           VALUES (1, ?, '', '[]')`
        )
        .run(new Date().toISOString());
    }
  }

  // ---------------------------------------------------------------------------
  // BoardPersistence (sync — used by boardService)
  // ---------------------------------------------------------------------------

  loadJobsFile(): JobsFile | null {
    const rows = this.db
      .prepare(
        `SELECT job_number, pm, customer, materials_manager, pabs_complete,
                ship_to_pm, ship_to_customer
         FROM jobs ORDER BY job_number`
      )
      .all() as Array<Record<string, string | null>>;

    if (rows.length === 0) return null;

    const meta = this.db
      .prepare('SELECT imported_at, source_file, new_job_numbers FROM jobs_import_meta WHERE id = 1')
      .get() as { imported_at: string; source_file: string; new_job_numbers: string };

    return {
      jobs: rows.map((r) => ({
        jobNumber: r.job_number as string,
        pm: (r.pm as string) ?? '',
        customer: (r.customer as string) ?? '',
        materialsManager: (r.materials_manager as string) ?? '',
        pabsComplete: r.pabs_complete,
        shipToPm: r.ship_to_pm,
        shipToCustomer: r.ship_to_customer,
      })),
      importedAt: meta.imported_at,
      sourceFile: meta.source_file,
      newJobNumbers: JSON.parse(meta.new_job_numbers || '[]') as string[],
    };
  }

  saveJobsFile(data: JobsFile): void {
    const byNumber = new Map<string, Job>();
    for (const j of data.jobs) {
      byNumber.set(j.jobNumber, j);
    }
    const uniqueJobs = [...byNumber.values()];

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM jobs').run();
      const ins = this.db.prepare(
        `INSERT INTO jobs (job_number, pm, customer, materials_manager, pabs_complete,
          ship_to_pm, ship_to_customer, imported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const j of uniqueJobs) {
        ins.run(
          j.jobNumber,
          j.pm,
          j.customer,
          j.materialsManager,
          j.pabsComplete,
          j.shipToPm,
          j.shipToCustomer,
          data.importedAt
        );
      }
      this.db
        .prepare(
          `UPDATE jobs_import_meta SET imported_at = ?, source_file = ?, new_job_numbers = ? WHERE id = 1`
        )
        .run(data.importedAt, data.sourceFile, JSON.stringify(data.newJobNumbers));
    });
    tx();
    this.logAudit('file_write', 'Saved jobs to SQLite', dbPath(this.dataDir));
  }

  getBoardStateFile(): Record<string, JobStateEntry> {
    const states = this.db.prepare('SELECT * FROM board_state').all() as Array<{
      job_number: string;
      status: JobStatus;
      ship_date_override: string | null;
      ship_date_override_note: string | null;
      binder_printed: number;
      version: number;
      updated_at: string;
      updated_by: string | null;
    }>;

    const notes = this.db
      .prepare(
        `SELECT id, job_number, text, author_id, author_name, created_at, updated_at, is_ops_schedule
         FROM notes ORDER BY created_at`
      )
      .all() as Array<{
      id: string;
      job_number: string;
      text: string;
      author_id: string;
      author_name: string;
      created_at: string;
      updated_at: string | null;
      is_ops_schedule: number;
    }>;

    const notesByJob = new Map<string, JobNote[]>();
    for (const n of notes) {
      const list = notesByJob.get(n.job_number) ?? [];
      list.push({
        id: n.id,
        authorId: n.author_id,
        authorName: n.author_name,
        text: n.text,
        createdAt: n.created_at,
        ...(n.updated_at ? { updatedAt: n.updated_at } : {}),
      });
      notesByJob.set(n.job_number, list);
    }

    const result: Record<string, JobStateEntry> = {};
    for (const s of states) {
      result[s.job_number] = {
        status: s.status,
        shipDateOverride: s.ship_date_override,
        shipDateOverrideNote: s.ship_date_override_note ?? null,
        binderPrinted: s.binder_printed === 1,
        version: s.version,
        notes: notesByJob.get(s.job_number) ?? [],
        updatedAt: s.updated_at,
        ...(s.updated_by ? { updatedBy: s.updated_by } : {}),
      };
    }
    return result;
  }

  writeBoardState(state: Record<string, JobStateEntry>): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM notes').run();
      this.db.prepare('DELETE FROM board_state').run();

      const insState = this.db.prepare(
        `INSERT INTO board_state (job_number, status, ship_date_override, ship_date_override_note,
          binder_printed, version, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insNote = this.db.prepare(
        `INSERT INTO notes (id, job_number, text, author_id, author_name, created_at, updated_at, is_ops_schedule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const [jobNumber, entry] of Object.entries(state)) {
        insState.run(
          jobNumber,
          entry.status,
          entry.shipDateOverride,
          entry.shipDateOverrideNote ?? null,
          entry.binderPrinted ? 1 : 0,
          entry.version ?? 1,
          entry.updatedAt,
          entry.updatedBy ?? null
        );
        for (const n of entry.notes) {
          const isOps =
            n.authorId === 'system:ops-schedule' ? 1 : 0;
          insNote.run(
            n.id,
            jobNumber,
            n.text,
            n.authorId,
            n.authorName,
            n.createdAt,
            n.updatedAt ?? null,
            isOps
          );
        }
      }
    });
    tx();
    this.logAudit('file_write', 'Saved board state to SQLite', dbPath(this.dataDir));
  }

  getBoardConfigRaw(): Partial<BoardConfig> | null {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(CONFIG_BOARD_KEY) as
      | { value: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as Partial<BoardConfig>;
    } catch {
      return null;
    }
  }

  saveBoardConfigRaw(config: BoardConfig): void {
    this.db
      .prepare(
        `INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(CONFIG_BOARD_KEY, JSON.stringify(config));
    this.logAudit('file_write', 'Saved board config', CONFIG_BOARD_KEY);
  }

  loadAppConfig(): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(CONFIG_APP_KEY) as
      | { value: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  saveAppConfig(config: unknown): void {
    this.db
      .prepare(
        `INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(CONFIG_APP_KEY, JSON.stringify(config));
    this.logAudit('file_write', 'Saved app config', CONFIG_APP_KEY);
  }

  getConfigFlag(key: string): boolean {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value === 'true';
  }

  setConfigFlag(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  logAudit(
    type: string,
    detail: string,
    auditPath?: string,
    success = true,
    sizeBytes?: number
  ): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (timestamp, type, detail, path, success, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        new Date().toISOString(),
        type,
        detail,
        auditPath ?? null,
        success ? 1 : 0,
        sizeBytes ?? null
      );
  }

  // ---------------------------------------------------------------------------
  // StorageProvider (async wrappers)
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<Result<{ mode: StorageMode; healthy: boolean; dbPath: string }>> {
    try {
      this.db.prepare('SELECT 1').get();
      return ok({ mode: 'local', healthy: true, dbPath: dbPath(this.dataDir) });
    } catch (e) {
      return err('storage_unhealthy', String(e));
    }
  }

  async getBoardConfig(): Promise<Result<BoardConfig>> {
    const stored = this.getBoardConfigRaw();
    if (!stored) return ok({ ...DEFAULT_BC });
    return ok(deepMergeBoardConfig(DEFAULT_BC, stored));
  }

  async writeBoardConfig(partial: Partial<BoardConfig>): Promise<Result<BoardConfig>> {
    const currentResult = await this.getBoardConfig();
    const current = currentResult.ok ? currentResult.data : { ...DEFAULT_BC };
    const merged = deepMergeBoardConfig(current, partial);
    this.saveBoardConfigRaw(merged);
    return ok(merged);
  }

  async getJob(_jobNumber: string): Promise<Result<import('@vrsi/wallboard-shared').BoardJob>> {
    return err('not_implemented', 'Use /api/board/jobs');
  }

  async listJobs(_filter?: import('@vrsi/wallboard-shared').JobFilter): Promise<Result<import('@vrsi/wallboard-shared').BoardJob[]>> {
    return err('not_implemented', 'Use /api/board/jobs');
  }

  async writeJobState(_jobNumber: string, _state: import('@vrsi/wallboard-shared').JobState): Promise<Result<void>> {
    return err('not_implemented', 'Use board API routes');
  }

  async deleteJobState(_jobNumber: string): Promise<Result<void>> {
    return err('not_implemented', 'Use board API routes');
  }

  async addNote(_jobNumber: string, _note: JobNote): Promise<Result<JobNote>> {
    return err('not_implemented', 'Use board API routes');
  }

  async updateNote(_jobNumber: string, _noteId: string, _text: string): Promise<Result<JobNote>> {
    return err('not_implemented', 'Use board API routes');
  }

  async deleteNote(_jobNumber: string, _noteId: string): Promise<Result<void>> {
    return err('not_implemented', 'Use board API routes');
  }

  async importJobs(jobs: Job[]): Promise<Result<ImportResult>> {
    const existing = this.loadJobsFile();
    const prevNumbers = new Set((existing?.jobs ?? []).map((j) => j.jobNumber));
    const newJobNumbers = jobs.filter((j) => !prevNumbers.has(j.jobNumber)).map((j) => j.jobNumber);
    this.saveJobsFile({
      jobs,
      importedAt: new Date().toISOString(),
      sourceFile: 'api-import',
      newJobNumbers,
    });
    return ok({
      imported: jobs.length,
      newJobNumbers,
      warnings: [],
      errors: [],
    });
  }

  async backup(
    destination: string,
    options?: { trigger?: 'manual' | 'scheduled' | 'browser_close' | 'server_shutdown' }
  ): Promise<Result<import('./storageTypes.js').BackupFileInfo>> {
    try {
      fs.mkdirSync(destination, { recursive: true });
      const destFile = path.join(
        destination,
        `wallboard-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
      );
      await this.db.backup(destFile);
      const st = fs.statSync(destFile);
      this.pruneBackups(destination, 28);
      const trigger = options?.trigger ?? 'manual';
      const label =
        trigger === 'browser_close'
          ? 'App closed (browser)'
          : trigger === 'server_shutdown'
            ? 'Server stopped'
            : trigger === 'scheduled'
              ? 'Scheduled'
              : 'Manual';
      this.logAudit('backup', `${label} backup to ${destFile}`, destFile, true, st.size);
      return ok({
        file: path.basename(destFile),
        path: destFile,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
      });
    } catch (e) {
      this.logAudit('backup', `Backup failed: ${e}`, destination, false);
      return err('backup_failed', String(e));
    }
  }

  pruneBackups(destination: string, keep = 28): void {
    const files = fs
      .readdirSync(destination)
      .filter((f) => f.startsWith('wallboard-') && f.endsWith('.db'))
      .flatMap((f) => {
        try {
          const full = path.join(destination, f);
          return [{ name: f, full, mtime: fs.statSync(full).mtimeMs }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(keep)) {
      try {
        fs.unlinkSync(old.full);
      } catch {
        // File may be locked or already removed — skip silently.
      }
    }
  }

  listBackups(): Array<{ file: string; path: string; sizeBytes: number; createdAt: string }> {
    return listBackupFilesOnDisk();
  }

  async restore(source: string): Promise<Result<{ preRestoreFile?: string }>> {
    if (!fs.existsSync(source)) return err('not_found', `Backup not found: ${source}`);
    const dest = dbPath(this.dataDir);
    const backupDir = resolveBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preRestoreFile = path.join(backupDir, `wallboard-pre-restore-${stamp}.db`);

    let preSnapshotDone = false;
    try {
      await this.db.backup(preRestoreFile);
      preSnapshotDone = true;
      this.db.pragma('wal_checkpoint(FULL)');
      this.db.close();

      removeWalSidecars(dest);

      let srcDb: Database.Database;
      try {
        srcDb = new Database(source, { readonly: true, fileMustExist: true });
      } catch (openErr) {
        const hint =
          ' Close the backup file if it is open in another app (e.g. Cursor or Excel), then try again.';
        throw new Error(`${openErr}${hint}`);
      }

      try {
        await srcDb.backup(dest);
      } finally {
        srcDb.close();
      }

      removeWalSidecars(dest);

      this.db = new Database(dest);
      this.db.pragma('journal_mode = WAL');
      this.logAudit('restore', `Restored from ${source}`, source, true);
      return ok({ preRestoreFile });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('Database restore failed', { source, dest, error: message });

      try {
        removeWalSidecars(dest);
        if (preSnapshotDone && fs.existsSync(preRestoreFile)) {
          const rollback = new Database(preRestoreFile, { readonly: true });
          try {
            await rollback.backup(dest);
          } finally {
            rollback.close();
          }
          removeWalSidecars(dest);
        }
        this.db = new Database(dest);
        this.db.pragma('journal_mode = WAL');
        this.logAudit('restore', `Restore failed: ${message}`, source, false);
      } catch (recoverErr) {
        logger.error('Could not reopen database after failed restore — restart the server', {
          error: recoverErr,
        });
      }
      return err('restore_failed', message);
    }
  }

  getAuditLog(limit = 200): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT id, timestamp, type, detail, path, success, size_bytes AS sizeBytes
         FROM audit_log ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
  }

  getSecurityReport(): Record<string, unknown> {
    const standalone = process.env.DISABLE_AZURE === 'true';
    const byType = this.db
      .prepare(`SELECT type, COUNT(*) AS count FROM audit_log GROUP BY type ORDER BY count DESC`)
      .all() as Array<{ type: string; count: number }>;

    const networkRecent = this.db
      .prepare(
        `SELECT timestamp, detail, path, success FROM audit_log
         WHERE type = 'network_request' ORDER BY id DESC LIMIT 30`
      )
      .all() as Array<Record<string, unknown>>;

    const lastBackup = this.db
      .prepare(
        `SELECT timestamp, detail, path FROM audit_log
         WHERE type = 'backup' AND success = 1 ORDER BY id DESC LIMIT 1`
      )
      .get() as Record<string, unknown> | undefined;

    const externalHosts = new Set<string>();
    for (const row of networkRecent) {
      const d = String(row.detail ?? '');
      const m = d.match(/(?:GET|POST|PUT|PATCH|DELETE)\s+([a-z0-9.-]+\.[a-z]{2,})/i);
      if (m) externalHosts.add(m[1].toLowerCase());
    }

    return {
      generatedAt: new Date().toISOString(),
      standaloneMode: standalone,
      azureEnabled: !standalone,
      dataDirectory: this.dataDir,
      databaseFile: dbPath(this.dataDir),
      backupDirectory: resolveBackupDir(),
      logDirectory: resolveLogsDir(),
      auditCountsByType: byType,
      externalHostsContacted: [...externalHosts],
      recentNetworkActivity: networkRecent,
      lastSuccessfulBackup: lastBackup ?? null,
      safetySummary: [
        'All job and board data is stored locally in SQLite on this PC (not in the public cloud) when running standalone mode.',
        'Every API request to this application is recorded in the audit log.',
        'File and database changes (save, backup, restore, import) are recorded in the audit log.',
        standalone
          ? 'Standalone mode: Microsoft Graph / SharePoint calls are not made; calendar widgets use mock data until Azure is configured.'
          : 'Azure mode: Outbound calls are limited to Microsoft Graph and login.microsoftonline.com for calendar and files.',
        'Passwords and OAuth tokens are never written to the audit log.',
        'Board write APIs can require ADMIN_TOKEN when configured in server .env.',
        'Server log files (combined.log, error.log) record startup, imports, and errors under the logs directory above.',
        'If the weather widget is enabled, the browser may call a public weather API directly (not logged on the server).',
      ],
    };
  }

  close(): void {
    this.db.close();
  }
}

function deepMergeBoardConfig(base: BoardConfig, partial: Partial<BoardConfig>): BoardConfig {
  return {
    ...base,
    ...partial,
    statusColors: { ...base.statusColors, ...partial.statusColors },
    extraUsers: partial.extraUsers ?? base.extraUsers,
  };
}
