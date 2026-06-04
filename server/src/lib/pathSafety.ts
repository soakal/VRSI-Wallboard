import path from 'path';

/** True when `child` is a file inside `parent` (Windows-safe, case-insensitive). */
export function isPathInsideDir(child: string, parent: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  const rel = path.relative(resolvedParent, resolvedChild);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return false;
  }
  return true;
}
