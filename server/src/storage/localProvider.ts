import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { listBackupFilesOnDisk } from '../lib/backupFiles.js';
import { dbPath, resolveBackupDir, resolveDataDir, resolveLogsDir } from '../lib/paths.js';
import { logger } from '../utils/logger.js';
import { ok, err, type Result } from '../lib/result.js';
import type { BoardConfig, ImportResult, Job, JobNote, JobStatus } from '@vrsi/wallboard-shared';
import { DEFAULT_BOARD_CONFIG as DEFAULT_BC } from '@vrsi/wallboard-shared';
import type { RestoreConflict, RestoreResult, StorageMode, StorageProvider } from './storageTypes.js';
import { SCHEMA_SQL } from './schema.js';
import type { BoardPersistence, JobStateEntry, JobsFile } from './boardPersistence.js';
import { migrateJsonToSqliteIfNeeded } from './migrate.js';

const CONFIG_APP_KEY = 'app_config';
const CONFIG_BOARD_KEY = 'board_config';

/** Convert an ISO-8601 string to a millisecond epoch. Returns NaN for blank or unparseable values. */
function isoToEpoch(value: string): number {
  return new Date(value).getTime();
}

export class LocalStorageProvider implements StorageProvider, BoardPersistence {
  private db: Database.Database;
  readonly dataDir: string;
  private checkpointTimer?: NodeJS.Timeout;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? resolveDataDir();
    fs.mkdirSync(this.dataDir, { recursive: true });
    const file = dbPath(this.dataDir);
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
    this.ensureColumns();
    migrateJsonToSqliteIfNeeded(this);
    this.ensureJobsMetaRow();

    // Detect a corrupt database file at startup so it surfaces in logs/Monitoring
    // instead of failing mysteriously later. Cheap on the kiosk-sized DB.
    try {
      const row = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string };
      if (row?.integrity_check && row.integrity_check !== 'ok') {
        logger.error('SQLite integrity_check failed — database may be corrupt', {
          result: row.integrity_check,
          dbPath: file,
        });
        this.logAudit('system', `Database integrity_check failed: ${row.integrity_check}`, file, false);
      }
    } catch (e) {
      logger.warn('Could not run integrity_check', { error: e instanceof Error ? e.message : String(e) });
    }

    // Periodically truncate the WAL so it can't grow without bound on a kiosk that
    // runs for months. unref() so it never keeps the process alive.
    this.checkpointTimer = setInterval(() => {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // best-effort; a busy DB will checkpoint on the next tick
      }
    }, 60 * 60 * 1000);
    this.checkpointTimer.unref();
  }

  /**
   * Add columns introduced after a table was first created. SCHEMA_SQL only runs
   * `CREATE TABLE IF NOT EXISTS`, so existing kiosk databases never pick up new
   * columns from it — `ALTER TABLE` is required and is NOT idempotent, so each add
   * is guarded by a PRAGMA table_info check. No-op once every column exists.
   * Table names below are hardcoded literals (never user input).
   */
  private ensureColumns(): void {
    const columnNames = (table: string): Set<string> =>
      new Set(
        (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
          (c) => c.name
        )
      );

    const boardCols = columnNames('board_state');
    if (!boardCols.has('status_manual')) {
      this.db.exec(`ALTER TABLE board_state ADD COLUMN status_manual INTEGER NOT NULL DEFAULT 0`);
      // Backfill: any pre-existing row a user has touched by hand (updated_by set) is
      // treated as manually locked, so the first import after this upgrade does not
      // revert manual status changes made under the old code.
      this.db.exec(
        `UPDATE board_state SET status_manual = 1 WHERE updated_by IS NOT NULL AND updated_by <> ''`
      );
    }
    if (!boardCols.has('binder_manual')) {
      this.db.exec(`ALTER TABLE board_state ADD COLUMN binder_manual INTEGER NOT NULL DEFAULT 0`);
      this.db.exec(
        `UPDATE board_state SET binder_manual = 1 WHERE updated_by IS NOT NULL AND updated_by <> ''`
      );
    }
    if (!boardCols.has('blocked')) {
      this.db.exec(`ALTER TABLE board_state ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0`);
    }
    if (!boardCols.has('blocked_at')) {
      this.db.exec(`ALTER TABLE board_state ADD COLUMN blocked_at TEXT`);
    }
    if (!boardCols.has('blocked_reason')) {
      this.db.exec(`ALTER TABLE board_state ADD COLUMN blocked_reason TEXT`);
    }

    if (!columnNames('jobs_import_meta').has('changed_note_job_numbers')) {
      this.db.exec(
        `ALTER TABLE jobs_import_meta ADD COLUMN changed_note_job_numbers TEXT NOT NULL DEFAULT '[]'`
      );
    }
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
      .prepare(
        'SELECT imported_at, source_file, new_job_numbers, changed_note_job_numbers FROM jobs_import_meta WHERE id = 1'
      )
      .get() as {
      imported_at: string;
      source_file: string;
      new_job_numbers: string;
      changed_note_job_numbers: string | null;
    };

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
      changedNoteJobNumbers: JSON.parse(meta.changed_note_job_numbers || '[]') as string[],
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
          `UPDATE jobs_import_meta SET imported_at = ?, source_file = ?, new_job_numbers = ?,
             changed_note_job_numbers = ? WHERE id = 1`
        )
        .run(
          data.importedAt,
          data.sourceFile,
          JSON.stringify(data.newJobNumbers),
          JSON.stringify(data.changedNoteJobNumbers ?? [])
        );
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
      status_manual: number;
      binder_manual: number;
      blocked: number;
      blocked_at: string | null;
      blocked_reason: string | null;
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
        statusManual: s.status_manual === 1,
        binderManual: s.binder_manual === 1,
        blocked: s.blocked === 1,
        blockedAt: s.blocked_at,
        blockedReason: s.blocked_reason,
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
          binder_printed, status_manual, binder_manual, blocked, blocked_at, blocked_reason,
          version, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          entry.statusManual ? 1 : 0,
          entry.binderManual ? 1 : 0,
          entry.blocked ? 1 : 0,
          entry.blockedAt ?? null,
          entry.blockedReason ?? null,
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
      const parsed = JSON.parse(row.value) as Partial<BoardConfig> & { superUser?: string };
      // Configs saved before v0.3.0 stored a single superUser string — fold it
      // into the superUsers list so existing installs keep their super user.
      if (!parsed.superUsers && typeof parsed.superUser === 'string' && parsed.superUser.trim()) {
        parsed.superUsers = [parsed.superUser.trim()];
      }
      return parsed;
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

  /**
   * Delete audit entries older than the retention window so the table cannot
   * grow without bound on a kiosk that runs for years. Returns rows removed.
   * Timestamps are ISO 8601 UTC strings, so lexicographic comparison is safe.
   */
  pruneAuditLog(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db
      .prepare(`DELETE FROM audit_log WHERE timestamp < ?`)
      .run(cutoff);
    if (result.changes > 0) {
      this.logAudit(
        'system',
        `Pruned ${result.changes} audit entries older than ${retentionDays} days`,
        dbPath(this.dataDir)
      );
    }
    return result.changes;
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
    const allFiles = fs
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

    // Pre-restore snapshots are excluded from the regular 28-file pool.
    const preRestoreFiles = allFiles.filter((f) => f.name.startsWith('wallboard-pre-restore-'));
    const regularFiles = allFiles.filter((f) => !f.name.startsWith('wallboard-pre-restore-'));

    // Keep newest `keep` regular backups; delete older ones.
    for (const old of regularFiles.slice(keep)) {
      try {
        fs.unlinkSync(old.full);
      } catch {
        // File may be locked or already removed — skip silently.
      }
    }

    // Keep newest 5 pre-restore snapshots; delete older ones.
    for (const old of preRestoreFiles.slice(5)) {
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

  async restore(source: string): Promise<Result<RestoreResult>> {
    if (!fs.existsSync(source)) return err('not_found', `Backup not found: ${source}`);
    const dest = dbPath(this.dataDir);

    let srcDb: Database.Database;
    try {
      srcDb = new Database(source, { readonly: true, fileMustExist: true });
    } catch (openErr) {
      const hint =
        ' Close the backup file if it is open in another app (e.g. Cursor or Excel), then try again.';
      const message = `${openErr}${hint}`;
      logger.error('Database restore failed (open error)', { source, dest, error: message });
      this.logAudit('restore', `Restore failed: ${message}`, source, false);
      return err('restore_failed', message);
    }

    try {
      // Check for conflicts BEFORE creating the pre-restore snapshot.
      const conflicts = this._findRestoreConflicts(srcDb);
      if (conflicts.length > 0) {
        this._logConflicts(conflicts, source);
        this.logAudit(
          'restore',
          `Restore blocked: ${conflicts.length} conflict(s) require user resolution.`,
          source,
          false
        );
        return ok({ conflicts });
      }

      // No conflicts — create the pre-restore snapshot, then merge.
      const backupDir = resolveBackupDir();
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const preRestoreFile = path.join(backupDir, `wallboard-pre-restore-${stamp}.db`);

      await this.db.backup(preRestoreFile);

      this._mergeFromBackup(srcDb, source);

      this.logAudit('restore', `Merged from backup ${source}`, source, true);
      return ok({ preRestoreFile, conflicts: [] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('Database restore failed', { source, dest, error: message });
      this.logAudit('restore', `Restore failed: ${message}`, source, false);
      return err('restore_failed', message);
    } finally {
      srcDb.close();
    }
  }

  private _logConflicts(conflicts: RestoreConflict[], sourcePath: string): void {
    for (const conflict of conflicts) {
      this.logAudit(
        'conflict',
        `Restore conflict on job ${conflict.jobNumber}: ` +
          `backup v${conflict.backup.version} (${conflict.backup.updatedAt}) vs ` +
          `live v${conflict.live.version} (${conflict.live.updatedAt}) — user resolution required`,
        sourcePath
      );
    }
  }

  /**
   * Merge board_state, notes, and jobs from a backup database into the live database.
   * Rules (§7):
   *   board_state — backup-only record → insert; same version → skip; one side newer → take it.
   *   notes       — backup note not in live → insert; exists in both → take newer updatedAt.
   *   jobs        — backup job not in live → insert; exists in both → skip (jobs come from XLSM).
   *   jobs_import_meta — take the row with newer imported_at.
   *   config      — skip (preserve current user settings).
   * Caller must run _findRestoreConflicts before calling this; conflicts must be empty.
   */
  private _mergeFromBackup(srcDb: Database.Database, _sourcePath: string): void {
    const tx = this.db.transaction(() => {
      // ── Jobs ────────────────────────────────────────────────────────────────
      const srcJobs = srcDb
        .prepare('SELECT * FROM jobs')
        .all() as Array<Record<string, unknown>>;

      const insJob = this.db.prepare(
        `INSERT OR IGNORE INTO jobs
           (job_number, pm, customer, materials_manager, pabs_complete,
            ship_to_pm, ship_to_customer, imported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const j of srcJobs) {
        insJob.run(
          j.job_number, j.pm, j.customer, j.materials_manager,
          j.pabs_complete, j.ship_to_pm, j.ship_to_customer, j.imported_at
        );
      }

      // ── jobs_import_meta ────────────────────────────────────────────────────
      const srcMeta = srcDb
        .prepare('SELECT * FROM jobs_import_meta WHERE id = 1')
        .get() as Record<string, unknown> | undefined;
      if (srcMeta) {
        const liveMeta = this.db
          .prepare('SELECT imported_at FROM jobs_import_meta WHERE id = 1')
          .get() as { imported_at: string } | undefined;
        const srcTime = isoToEpoch(String(srcMeta.imported_at ?? ''));
        const liveTime = liveMeta ? isoToEpoch(liveMeta.imported_at) : NaN;
        // Use src only when both are parseable and src is newer, or live is missing/unparseable.
        const srcWins = Number.isFinite(srcTime) && (!Number.isFinite(liveTime) || srcTime > liveTime);
        if (!liveMeta || srcWins) {
          this.db
            .prepare(
              `INSERT INTO jobs_import_meta (id, imported_at, source_file, new_job_numbers, changed_note_job_numbers)
               VALUES (1, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 imported_at = excluded.imported_at,
                 source_file = excluded.source_file,
                 new_job_numbers = excluded.new_job_numbers,
                 changed_note_job_numbers = excluded.changed_note_job_numbers`
            )
            .run(
              srcMeta.imported_at,
              srcMeta.source_file,
              srcMeta.new_job_numbers,
              srcMeta.changed_note_job_numbers ?? '[]'
            );
        }
      }

      // ── Board state ─────────────────────────────────────────────────────────
      type StateRow = {
        job_number: string; status: string; ship_date_override: string | null;
        ship_date_override_note: string | null; binder_printed: number;
        status_manual?: number; binder_manual?: number;
        blocked?: number; blocked_at?: string | null; blocked_reason?: string | null;
        version: number; updated_at: string; updated_by: string | null;
      };
      const srcStates = srcDb.prepare('SELECT * FROM board_state').all() as StateRow[];
      const liveStates = new Map(
        (this.db.prepare('SELECT * FROM board_state').all() as StateRow[]).map(
          (r) => [r.job_number, r]
        )
      );

      const upsertState = this.db.prepare(
        `INSERT INTO board_state
           (job_number, status, ship_date_override, ship_date_override_note,
            binder_printed, status_manual, binder_manual, blocked, blocked_at, blocked_reason,
            version, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_number) DO UPDATE SET
           status = excluded.status,
           ship_date_override = excluded.ship_date_override,
           ship_date_override_note = excluded.ship_date_override_note,
           binder_printed = excluded.binder_printed,
           status_manual = excluded.status_manual,
           binder_manual = excluded.binder_manual,
           blocked = excluded.blocked,
           blocked_at = excluded.blocked_at,
           blocked_reason = excluded.blocked_reason,
           version = excluded.version,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      );

      // Older backups predate the manual-lock columns; SELECT * omits them, so
      // default to 0 (unlocked) rather than letting undefined bind as NULL.
      for (const src of srcStates) {
        const live = liveStates.get(src.job_number);
        if (!live) {
          // New record in backup — insert it.
          upsertState.run(
            src.job_number, src.status, src.ship_date_override,
            src.ship_date_override_note, src.binder_printed,
            src.status_manual ?? 0, src.binder_manual ?? 0,
            src.blocked ?? 0, src.blocked_at ?? null, src.blocked_reason ?? null,
            src.version, src.updated_at, src.updated_by
          );
          continue;
        }
        if (src.version === live.version) continue; // identical — skip

        const srcEpoch = isoToEpoch(src.updated_at);
        const liveEpoch = isoToEpoch(live.updated_at);
        // If either timestamp is non-finite, keep live (defensive; conflicts should block before here).
        if (!Number.isFinite(srcEpoch) || !Number.isFinite(liveEpoch)) continue;
        if (srcEpoch > liveEpoch) {
          upsertState.run(
            src.job_number, src.status, src.ship_date_override,
            src.ship_date_override_note, src.binder_printed,
            src.status_manual ?? 0, src.binder_manual ?? 0,
            src.blocked ?? 0, src.blocked_at ?? null, src.blocked_reason ?? null,
            src.version, src.updated_at, src.updated_by
          );
        }
        // else: live is newer — keep as-is.
      }

      // ── Notes ───────────────────────────────────────────────────────────────
      type NoteRow = {
        id: string; job_number: string; text: string; author_id: string;
        author_name: string; created_at: string; updated_at: string | null;
        is_ops_schedule: number;
      };
      const srcNotes = srcDb.prepare('SELECT * FROM notes').all() as NoteRow[];
      const liveNoteIds = new Set(
        (this.db.prepare('SELECT id FROM notes').all() as Array<{ id: string }>).map((r) => r.id)
      );

      const insNote = this.db.prepare(
        `INSERT OR IGNORE INTO notes
           (id, job_number, text, author_id, author_name, created_at, updated_at, is_ops_schedule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const updNote = this.db.prepare(
        `UPDATE notes SET text = ?, updated_at = ? WHERE id = ? AND (updated_at IS NULL OR updated_at < ?)`
      );

      for (const n of srcNotes) {
        if (!liveNoteIds.has(n.id)) {
          insNote.run(
            n.id, n.job_number, n.text, n.author_id,
            n.author_name, n.created_at, n.updated_at ?? null, n.is_ops_schedule
          );
        } else if (n.updated_at) {
          // Take backup note text only if backup is newer.
          updNote.run(n.text, n.updated_at, n.id, n.updated_at);
        }
      }
    });

    tx();
  }

  private _findRestoreConflicts(srcDb: Database.Database): RestoreConflict[] {
    type StateRow = {
      job_number: string; status: string; ship_date_override: string | null;
      ship_date_override_note: string | null; binder_printed: number;
      version: number; updated_at: string; updated_by: string | null;
    };
    const srcStates = srcDb.prepare('SELECT * FROM board_state').all() as StateRow[];
    const liveStates = new Map(
      (this.db.prepare('SELECT * FROM board_state').all() as StateRow[]).map(
        (r) => [r.job_number, r]
      )
    );

    const conflicts: RestoreConflict[] = [];
    for (const src of srcStates) {
      const live = liveStates.get(src.job_number);
      if (!live || src.version === live.version) continue;
      const backupTime = isoToEpoch(src.updated_at);
      const liveTime = isoToEpoch(live.updated_at);
      // If either timestamp is unparseable, ordering is undecidable — block for user resolution.
      if (!Number.isFinite(backupTime) || !Number.isFinite(liveTime)) {
        conflicts.push({
          jobNumber: src.job_number,
          backup: { version: src.version, updatedAt: src.updated_at, status: src.status },
          live: { version: live.version, updatedAt: live.updated_at, status: live.status },
        });
        continue;
      }
      const bothModified = Math.abs(backupTime - liveTime) < 60_000;
      if (!bothModified) continue;
      conflicts.push({
        jobNumber: src.job_number,
        backup: {
          version: src.version,
          updatedAt: src.updated_at,
          status: src.status,
        },
        live: {
          version: live.version,
          updatedAt: live.updated_at,
          status: live.status,
        },
      });
    }
    return conflicts;
  }

  /** ISO timestamp of the most recent SUCCESSFUL backup, or null if none recorded. */
  getLastSuccessfulBackupAt(): string | null {
    const row = this.db
      .prepare(
        `SELECT timestamp FROM audit_log WHERE type = 'backup' AND success = 1 ORDER BY id DESC LIMIT 1`
      )
      .get() as { timestamp: string } | undefined;
    return row?.timestamp ?? null;
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
    if (this.checkpointTimer) clearInterval(this.checkpointTimer);
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
