import fs from 'fs';
import path from 'path';
import { resolveBackupDir } from './paths.js';
import type { BackupFileInfo } from '../storage/storageTypes.js';

/** List backup .db files from disk (no SQLite required). */
export function listBackupFilesOnDisk(): BackupFileInfo[] {
  const dir = resolveBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('wallboard-') && f.endsWith('.db'))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return {
        file: f,
        path: full,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
