import type { BoardConfig, Job, JobNote, JobStatus } from '@vrsi/wallboard-shared';

/** Legacy jobs.json shape — used by boardService import/merge logic. */
export interface JobsFile {
  jobs: Job[];
  importedAt: string;
  sourceFile: string;
  newJobNumbers: string[];
}

export interface JobStateEntry {
  status: JobStatus;
  shipDateOverride: string | null;
  shipDateOverrideNote: string | null;
  binderPrinted: boolean;
  version?: number; // persisted in SQLite; optional when reading legacy JSON
  notes: JobNote[];
  updatedAt: string;
  updatedBy?: string;
}

export interface BoardPersistence {
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
}
