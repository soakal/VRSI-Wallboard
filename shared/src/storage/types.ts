import type { Result } from '../result.js';
import type {
  BoardConfig,
  BoardJob,
  ImportResult,
  Job,
  JobFilter,
  JobNote,
  JobState,
} from '../types/board.js';

export type StorageMode = 'local' | 'network_share' | 'sharepoint';

export interface BackupFileInfo {
  file: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface StorageProvider {
  getJob(jobNumber: string): Promise<Result<BoardJob>>;
  listJobs(filter?: JobFilter): Promise<Result<BoardJob[]>>;
  writeJobState(jobNumber: string, state: JobState): Promise<Result<void>>;
  deleteJobState(jobNumber: string): Promise<Result<void>>;
  addNote(jobNumber: string, note: JobNote): Promise<Result<JobNote>>;
  updateNote(jobNumber: string, noteId: string, text: string): Promise<Result<JobNote>>;
  deleteNote(jobNumber: string, noteId: string): Promise<Result<void>>;
  getBoardConfig(): Promise<Result<BoardConfig>>;
  writeBoardConfig(config: Partial<BoardConfig>): Promise<Result<BoardConfig>>;
  importJobs(jobs: Job[]): Promise<Result<ImportResult>>;
  backup(
    destination: string,
    options?: { trigger?: 'manual' | 'scheduled' | 'browser_close' | 'server_shutdown' }
  ): Promise<Result<BackupFileInfo>>;
  listBackups(): BackupFileInfo[];
  restore(source: string): Promise<Result<{ preRestoreFile?: string }>>;
  getStatus(): Promise<Result<{ mode: StorageMode; healthy: boolean; dbPath: string }>>;
}
