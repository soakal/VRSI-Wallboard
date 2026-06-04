import { resolveDataDir } from '../lib/paths.js';
import type { BoardPersistence } from './boardPersistence.js';
import { LocalStorageProvider } from './localProvider.js';

let instance: LocalStorageProvider | null = null;

export function getPersistence(): BoardPersistence & LocalStorageProvider {
  if (!instance) {
    const dataDir = resolveDataDir();
    instance = new LocalStorageProvider(dataDir);
  }
  return instance;
}

export function resetPersistenceForTests(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/** Reopen SQLite after restore (replaces in-memory connection). */
export function reloadPersistence(): void {
  resetPersistenceForTests();
  getPersistence();
}
