import type { BoardConfig, Job, JobNote, JobStatus } from '@vrsi/wallboard-shared';

/** Legacy jobs.json shape — used by boardService import/merge logic. */
export interface JobsFile {
  jobs: Job[];
  importedAt: string;
  sourceFile: string;
  newJobNumbers: string[];
  /** Job numbers whose Ops Schedule note was added/changed by the latest import. */
  changedNoteJobNumbers?: string[];
}

export interface JobStateEntry {
  status: JobStatus;
  shipDateOverride: string | null;
  shipDateOverrideNote: string | null;
  binderPrinted: boolean;
  /** True once a user sets the status by hand — import never overwrites a locked status. */
  statusManual?: boolean;
  /** True once a user toggles the binder checkbox by hand — import never overwrites it. */
  binderManual?: boolean;
  /** Manual triage flag — never set/cleared by import. */
  blocked?: boolean;
  blockedAt?: string | null;
  blockedReason?: string | null;
  version?: number; // persisted in SQLite; optional when reading legacy JSON
  notes: JobNote[];
  updatedAt: string;
  updatedBy?: string;
}

export interface BoardPersistence {
  /**
   * Run fn inside a single database transaction. Nested calls use savepoints,
   * so a multi-step write (e.g. an import that writes board state, replaces the
   * jobs table, and prunes orphans) commits atomically or not at all.
   */
  runInTransaction<T>(fn: () => T): T;
  loadJobsFile(): JobsFile | null;
  saveJobsFile(data: JobsFile): void;
  getBoardStateFile(): Record<string, JobStateEntry>;
  writeBoardState(state: Record<string, JobStateEntry>): void;
  getBoardConfigRaw(): Partial<BoardConfig> | null;
  saveBoardConfigRaw(config: BoardConfig): void;
  logAudit(
    type: string,
    detail: string,
    path?: string,
    success?: boolean,
    sizeBytes?: number
  ): void;
  pruneAuditLog(retentionDays: number): number;
}
