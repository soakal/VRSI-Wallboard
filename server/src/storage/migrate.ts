import fs from 'fs';
import path from 'path';
import type { LocalStorageProvider } from './localProvider.js';
import type { BoardConfig, Job, JobNote, JobStatus } from '@vrsi/wallboard-shared';
import { DEFAULT_BOARD_CONFIG } from '@vrsi/wallboard-shared';
import { logger } from '../utils/logger.js';

interface LegacyJobsFile {
  jobs: Job[];
  importedAt: string;
  sourceFile: string;
  newJobNumbers: string[];
}

interface LegacyBoardStateFile {
  jobs: Record<
    string,
    {
      status: JobStatus;
      shipDateOverride: string | null;
      shipDateOverrideNote?: string | null;
      binderPrinted?: boolean;
      version?: number;
      notes: JobNote[];
      updatedAt: string;
      updatedBy?: string;
    }
  >;
}

function renameMigrated(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const dest = filePath + '.migrated';
  if (fs.existsSync(dest)) return;
  fs.renameSync(filePath, dest);
  logger.info('JSON migrated — renamed', { from: filePath, to: dest });
}

/**
 * Parse a legacy JSON file, returning null (and logging) on corruption instead of
 * throwing — a single malformed legacy file must never brick server startup.
 */
function readJsonOrNull<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (e) {
    logger.error('Skipping unreadable legacy JSON during migration', {
      file: filePath,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

const MIGRATION_FLAG = 'json_migration_v1_complete';

export function migrateJsonToSqliteIfNeeded(provider: LocalStorageProvider): void {
  const dataDir = provider.dataDir;

  const done = provider.getConfigFlag(MIGRATION_FLAG);
  if (done) return;
  const jobsPath = path.join(dataDir, 'jobs.json');
  const statePath = path.join(dataDir, 'board-state.json');
  const boardConfigPath = path.join(dataDir, 'board-config.json');
  const appConfigPath = path.join(dataDir, 'config.json');

  const hasJson =
    fs.existsSync(jobsPath) ||
    fs.existsSync(statePath) ||
    fs.existsSync(boardConfigPath) ||
    fs.existsSync(appConfigPath);

  if (!hasJson) return;

  const existingJobs = provider.loadJobsFile();
  if (existingJobs && existingJobs.jobs.length > 0) {
    logger.info('SQLite already has jobs — skipping JSON migration');
    return;
  }

  logger.info('Migrating legacy JSON data into SQLite', { dataDir });

  if (fs.existsSync(jobsPath)) {
    const raw = readJsonOrNull<LegacyJobsFile>(jobsPath);
    if (raw?.jobs?.length) {
      provider.saveJobsFile({
        jobs: raw.jobs,
        importedAt: raw.importedAt ?? new Date().toISOString(),
        sourceFile: raw.sourceFile ?? 'migrated',
        newJobNumbers: raw.newJobNumbers ?? [],
      });
    }
    renameMigrated(jobsPath);
  }

  if (fs.existsSync(statePath)) {
    const raw = readJsonOrNull<LegacyBoardStateFile>(statePath);
    if (raw?.jobs) {
      const normalized: Record<string, import('./boardPersistence.js').JobStateEntry> = {};
      for (const [k, v] of Object.entries(raw.jobs)) {
        normalized[k] = {
          status: v.status,
          shipDateOverride: v.shipDateOverride,
          shipDateOverrideNote: v.shipDateOverrideNote ?? null,
          binderPrinted: v.binderPrinted ?? false,
          version: v.version,
          notes: v.notes,
          updatedAt: v.updatedAt,
          ...(v.updatedBy ? { updatedBy: v.updatedBy } : {}),
        };
      }
      provider.writeBoardState(normalized);
    }
    renameMigrated(statePath);
  }

  if (fs.existsSync(boardConfigPath)) {
    const raw = readJsonOrNull<Partial<BoardConfig> & { superUser?: string }>(boardConfigPath);
    if (raw) {
      provider.saveBoardConfigRaw({
        spareCarrier: raw.spareCarrier ?? 'matto@vrs-inc.com',
        superUsers: raw.superUsers ?? (raw.superUser?.trim() ? [raw.superUser.trim()] : ['Jon Shantry']),
        statusColors: raw.statusColors ?? DEFAULT_BOARD_CONFIG.statusColors,
        extraUsers: raw.extraUsers ?? [],
      });
    }
    renameMigrated(boardConfigPath);
  }

  if (fs.existsSync(appConfigPath)) {
    const raw = readJsonOrNull<Record<string, unknown>>(appConfigPath);
    if (raw) provider.saveAppConfig(raw);
    renameMigrated(appConfigPath);
  }

  provider.setConfigFlag(MIGRATION_FLAG, 'true');
  provider.logAudit('file_write', 'Migrated legacy JSON files to SQLite', dataDir);
}
