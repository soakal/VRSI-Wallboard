import { Router, Request, Response } from 'express';
import { createRequire } from 'module';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { resolveLogsDir } from '../lib/paths.js';

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

/** Strip pre-release suffixes (e.g. -beta, -rc.1) then compare numerically. Exported for testing. */
export function isNewer(latest: string, current: string): boolean {
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

// Deterministic link to the running version's release page — unlike the
// "latest release" URL it never depends on the GitHub check or its cache.
const currentReleaseUrl = `https://github.com/${GITHUB_REPO}/releases/tag/v${currentVersion}`;

updateRouter.get('/check', async (_req: Request, res: Response) => {
  const now = Date.now();
  const ttl = cache?.ok === false ? FAIL_TTL_MS : CACHE_TTL_MS;

  if (cache && now - cache.checkedAt < ttl) {
    if (!cache.ok) return res.json({ data: { currentVersion, currentReleaseUrl, updateAvailable: false } });
    return res.json({
      data: {
        currentVersion,
        currentReleaseUrl,
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
      return res.json({ data: { currentVersion, currentReleaseUrl, updateAvailable: false } });
    }

    const raw: unknown = await response.json();
    if (!isGitHubRelease(raw)) {
      cache = { checkedAt: now, latestVersion: '', releaseUrl: '', releaseName: '', ok: false };
      return res.json({ data: { currentVersion, currentReleaseUrl, updateAvailable: false } });
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
        currentReleaseUrl,
        latestVersion: cache.latestVersion,
        updateAvailable: isNewer(cache.latestVersion, currentVersion),
        releaseUrl: cache.releaseUrl,
        releaseName: cache.releaseName,
      },
    });
  } catch (err) {
    logger.warn('Update check failed', { err });
    cache = { checkedAt: now, latestVersion: '', releaseUrl: '', releaseName: '', ok: false };
    return res.json({ data: { currentVersion, currentReleaseUrl, updateAvailable: false } });
  }
});

// ---------------------------------------------------------------------------
// GET /status — last update outcome, written by the PS updater to
// logs\update-status.json on BOTH its success and failure paths. The client
// polls this during an update so a FAILED update surfaces as a red error in
// Settings instead of silently looking like success (the old behaviour).
// ---------------------------------------------------------------------------
interface UpdateStatus {
  ok: boolean;
  message: string;
  at: string;
  fromVersion?: string;
  toVersion?: string;
}

function isUpdateStatus(v: unknown): v is UpdateStatus {
  return (
    v !== null &&
    typeof v === 'object' &&
    'ok' in v && typeof (v as Record<string, unknown>).ok === 'boolean' &&
    'message' in v && typeof (v as Record<string, unknown>).message === 'string' &&
    'at' in v && typeof (v as Record<string, unknown>).at === 'string'
  );
}

updateRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const statusPath = path.join(resolveLogsDir(), 'update-status.json');
    if (!fs.existsSync(statusPath)) return res.json({ data: null });
    if (fs.statSync(statusPath).size > 100 * 1024) {
      logger.warn('update-status.json exceeds 100 KB — ignoring to avoid reading a corrupt file');
      return res.json({ data: null });
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (!isUpdateStatus(parsed)) return res.json({ data: null });
    return res.json({ data: parsed });
  } catch (err) {
    logger.warn('Failed to read update status', { err });
    return res.json({ data: null });
  }
});

// ---------------------------------------------------------------------------
// POST /run — launch the update script detached. Dev installs (git repo
// present) pull + rebuild; kiosk installs download the latest release zip.
// The script stops this server, applies the update, and restarts everything.
// ---------------------------------------------------------------------------
let updateStartedAt = 0;

export function hasValidGitCheckout(repoRoot: string): boolean {
  const gitMarker = path.join(repoRoot, '.git');
  if (!fs.existsSync(gitMarker)) return false;

  try {
    const probe = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'], {
      windowsHide: true,
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (probe.error) {
      logger.warn('Git probe failed while choosing update path', { err: probe.error });
      return false;
    }
    if (probe.status !== 0) {
      logger.warn('Git probe returned non-zero while choosing update path', {
        status: probe.status,
        stderr: probe.stderr.trim().slice(0, 300),
      });
      return false;
    }
    return probe.stdout.trim() === 'true';
  } catch (err) {
    logger.warn('Unexpected git probe error while choosing update path', { err });
    return false;
  }
}

updateRouter.post('/run', requireAdminToken, (_req: Request, res: Response) => {
  try {
    // Debounce: ignore re-clicks while an update launched in the last 5 minutes
    if (Date.now() - updateStartedAt < 5 * 60 * 1000) {
      return res.json({ data: { started: true, alreadyRunning: true } });
    }

    // dist/routes/update.js → repo root is three levels up from this file's dir
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const scriptsDir = path.join(repoRoot, 'scripts', 'windows');
    // Prefer the git updater only when this is a VALID git working tree.
    // Stale/partial .git markers can exist on release installs and would route
    // them to the wrong updater path that then fails with "not a git repository".
    const isGit = hasValidGitCheckout(repoRoot);
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

    // powershell.exe silently exits 0 without running the script when spawned
    // with detached:true (DETACHED_PROCESS gives it no console to initialize).
    // Instead, a short-lived NON-detached launcher creates the real updater via
    // WMI Win32_Process.Create — the updater's parent is the WMI service, so it
    // survives this server (and the tray, and any Task Scheduler job) being
    // killed mid-update.
    const innerCmd = `"${psExe}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}" -Unattended`;
    const launcherCmd =
      `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${innerCmd.replace(/'/g, "''")}'; CurrentDirectory = '${scriptsDir.replace(/'/g, "''")}' }; exit $r.ReturnValue`;

    const child = spawn(
      psExe,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', launcherCmd],
      { cwd: scriptsDir, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (d: Buffer) => stderrChunks.push(d));
    child.on('exit', (code, signal) => {
      if (code === 0) {
        logger.info('Update process created', { script: path.basename(script) });
      } else {
        logger.error('Update launcher failed', {
          code, signal, script: path.basename(script),
          stderr: Buffer.concat(stderrChunks).toString().slice(0, 500),
        });
      }
    });
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
