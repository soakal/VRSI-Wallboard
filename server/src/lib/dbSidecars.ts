import fs from 'fs';

/** Remove SQLite WAL/SHM files so a replaced .db is not paired with stale journal data. */
export function removeWalSidecars(dbFile: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = dbFile + suffix;
    try {
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    } catch {
      /* ignore locked sidecars */
    }
  }
}
