import { Router, Request, Response } from 'express';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';

export const updateRouter = Router();

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as unknown;
const currentVersion: string =
  pkg !== null && typeof pkg === 'object' && 'version' in pkg && typeof (pkg as Record<string, unknown>).version === 'string'
    ? (pkg as Record<string, string>).version
    : '0.0.0';

const GITHUB_REPO = 'soakal/VRSI-Wallboard';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // 6 hours on success
const FAIL_TTL_MS  = 60 * 60 * 1000;        // 1 hour on failure — avoid hammering on outage

interface CacheEntry {
  checkedAt: number;
  latestVersion: string;
  releaseUrl: string;
  releaseName: string;
  ok: boolean; // false = negative cache (GitHub was unreachable)
}
let cache: CacheEntry | null = null;

/** Strip pre-release suffixes (e.g. -beta, -rc.1) then compare numerically. */
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const clean = v.replace(/^v/, '').split('-')[0]; // strip pre-release
    const parts = clean.split('.').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  if (!Number.isFinite(lMaj) || !Number.isFinite(lMin) || !Number.isFinite(lPat)) return false;
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

function isGitHubRelease(v: unknown): v is { tag_name: string; html_url: string; name: string } {
  return (
    v !== null &&
    typeof v === 'object' &&
    'tag_name' in v && typeof (v as Record<string, unknown>).tag_name === 'string' &&
    'html_url' in v && typeof (v as Record<string, unknown>).html_url === 'string'
  );
}

updateRouter.get('/check', async (_req: Request, res: Response) => {
  const now = Date.now();
  const ttl = cache?.ok === false ? FAIL_TTL_MS : CACHE_TTL_MS;

  if (cache && now - cache.checkedAt < ttl) {
    if (!cache.ok) return res.json({ data: { currentVersion, updateAvailable: false } });
    return res.json({
      data: {
        currentVersion,
        latestVersion: cache.latestVersion,
        updateAvailable: isNewer(cache.latestVersion, currentVersion),
        releaseUrl: cache.releaseUrl,
        releaseName: cache.releaseName || cache.latestVersion,
      },
    });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'VRSI-WallBoard-UpdateCheck/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      cache = { checkedAt: now, latestVersion: '', releaseUrl: '', releaseName: '', ok: false };
      return res.json({ data: { currentVersion, updateAvailable: false } });
    }

    const raw: unknown = await response.json();
    if (!isGitHubRelease(raw)) {
      cache = { checkedAt: now, latestVersion: '', releaseUrl: '', releaseName: '', ok: false };
      return res.json({ data: { currentVersion, updateAvailable: false } });
    }

    cache = {
      checkedAt: now,
      latestVersion: raw.tag_name,
      releaseUrl: raw.html_url,
      releaseName: raw.name || raw.tag_name,
      ok: true,
    };

    return res.json({
      data: {
        currentVersion,
        latestVersion: cache.latestVersion,
        updateAvailable: isNewer(cache.latestVersion, currentVersion),
        releaseUrl: cache.releaseUrl,
        releaseName: cache.releaseName,
      },
    });
  } catch (err) {
    logger.warn('Update check failed', { err });
    cache = { checkedAt: now, latestVersion: '', releaseUrl: '', releaseName: '', ok: false };
    return res.json({ data: { currentVersion, updateAvailable: false } });
  }
});

// ---------------------------------------------------------------------------
// POST /run — launch the update script detached. Dev installs (git repo
// present) pull + rebuild; kiosk installs download the latest release zip.
// The script stops this server, applies the update, and restarts everything.
// ---------------------------------------------------------------------------
let updateStartedAt = 0;

updateRouter.post('/run', requireAdminToken, (_req: Request, res: Response) => {
  try {
    // Debounce: ignore re-clicks while an update launched in the last 5 minutes
    if (Date.now() - updateStartedAt < 5 * 60 * 1000) {
      return res.json({ data: { started: true, alreadyRunning: true } });
    }

    // dist/routes/update.js → repo root is three levels up from this file's dir
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const scriptsDir = path.join(repoRoot, 'scripts', 'windows');
    const isGit = fs.existsSync(path.join(repoRoot, '.git'));
    const script = path.join(scriptsDir, isGit ? 'Update-WallBoard.ps1' : 'Update-FromRelease.ps1');
    if (!fs.existsSync(script)) {
      return res.status(500).json({
        error: { code: 'update_script_missing', message: `Update script not found: ${script}` },
      });
    }

    const psExe = path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
    );
    const child = spawn(
      psExe,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Unattended'],
      { cwd: scriptsDir, detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
    updateStartedAt = Date.now();

    logger.info('Update launched', { script, method: isGit ? 'git' : 'release' });
    return res.json({ data: { started: true, method: isGit ? 'git' : 'release' } });
  } catch (err) {
    logger.error('Failed to launch update', { err });
    return res.status(500).json({
      error: { code: 'update_launch_failed', message: 'Could not start the update script' },
    });
  }
});
