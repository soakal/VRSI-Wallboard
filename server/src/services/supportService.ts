import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { resolveLogsDir } from '../lib/paths.js';
import { getPersistence } from '../storage/factory.js';
import { getDbIntegrityStatus } from '../storage/localProvider.js';
import { isAuthenticated, needsReauthentication } from '../auth/tokenRefresher.js';
import { isBackupInProgress } from './backupService.js';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as unknown;
const appVersion: string =
  pkg !== null && typeof pkg === 'object' && 'version' in pkg && typeof (pkg as Record<string, unknown>).version === 'string'
    ? (pkg as Record<string, string>).version
    : '0.0.0';

/** Default product support inbox — override with SUPPORT_EMAIL in .env */
export const DEFAULT_SUPPORT_EMAIL = 'briank@vrs-inc.com';

export const SUPPORT_MESSAGE_MAX = 4000;
export const SUPPORT_CONTACT_MAX = 200;
const LOG_TAIL_MAX_BYTES = 5 * 1024 * 1024;
const UPDATE_LOG_TAIL_MAX_BYTES = 512 * 1024;
// Bounds every spawnSync call in this file — without it, a hung Outlook COM
// dialog (first-run wizard, stuck modal) blocks the whole Node event loop
// indefinitely, freezing the entire board for every kiosk user.
// Open-SupportMail.ps1 keeps its own 10s INNER timeout on the Outlook COM
// attempt so a hung COM activation (seen live on a new-Outlook-only kiosk)
// can never consume this whole budget — the script's internal mailto fallback
// still runs, well inside these 30s. Keep this comfortably larger than
// (inner COM timeout + mailto launch + powershell.exe startup).
const SUPPORT_SPAWN_TIMEOUT_MS = 30_000;

export interface SupportRequestInput {
  message: string;
  contactName?: string;
  replyTo?: string;
  attachLogs?: boolean;
}

export interface SupportBundleResult {
  zipPath: string;
  filename: string;
  savedPath: string | null;
  sizeBytes: number;
}

export type SupportDeliveryMethod = 'outlook' | 'mailto';

export interface SupportDeliveryResult {
  method: SupportDeliveryMethod;
  filename: string;
  savedPath: string | null;
  sizeBytes: number;
}

export function resolveSupportEmail(): string {
  const fromEnv = process.env.SUPPORT_EMAIL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SUPPORT_EMAIL;
}

function resolveDesktopDir(): string | null {
  const home = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  if (!home) return null;
  const desktop = path.join(home, 'Desktop');
  try {
    if (fs.existsSync(desktop) && fs.statSync(desktop).isDirectory()) return desktop;
  } catch {
    /* ignore */
  }
  return null;
}

function readLogTail(filePath: string, maxBytes: number): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const { size } = fs.statSync(filePath);
    if (size === 0) return '(empty)\n';
    const start = size > maxBytes ? size - maxBytes : 0;
    const fd = fs.openSync(filePath, 'r');
    try {
      const length = size - start;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      const prefix =
        start > 0 ? `[…truncated to last ${Math.round(maxBytes / 1024)} KB…]\n` : '';
      return prefix + buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    logger.warn('Could not read log for support bundle', {
      path: filePath,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function buildSystemInfo(): string {
  let lastBackupAt: string | null = null;
  try {
    lastBackupAt = getPersistence().getLastSuccessfulBackupAt();
  } catch {
    lastBackupAt = null;
  }

  const lines = [
    `Date:           ${new Date().toISOString()}`,
    `App version:    ${appVersion}`,
    `Computer:       ${os.hostname()}`,
    `Platform:       ${process.platform} ${os.release()}`,
    `Node:           ${process.version}`,
    `Uptime (s):     ${Math.round(process.uptime())}`,
    `DISABLE_AZURE:  ${process.env.DISABLE_AZURE === 'true' ? 'true' : 'false'}`,
    `Authenticated:  ${isAuthenticated()}`,
    `Needs reauth:   ${needsReauthentication()}`,
    `DB integrity:   ${getDbIntegrityStatus()}`,
    `Backup in prog: ${isBackupInProgress()}`,
    `Last backup:    ${lastBackupAt ?? '(none)'}`,
    `Logs dir:       ${resolveLogsDir()}`,
    `Data dir:       ${process.env.DATA_DIR?.trim() || '(default)'}`,
  ];
  return lines.join('\n') + '\n';
}

function buildAuditSnippet(): string {
  try {
    const entries = getPersistence().getAuditLog(50);
    if (entries.length === 0) return '(no recent audit entries)\n';
    return (
      entries
        .map((raw) => {
          const e = raw as {
            timestamp?: unknown;
            type?: unknown;
            detail?: unknown;
            success?: unknown;
          };
          const ok = e.success === 0 || e.success === false ? 'FAIL' : 'ok';
          return `${String(e.timestamp ?? '')} [${String(e.type ?? '')}] ${ok} ${String(e.detail ?? '')}`;
        })
        .join('\n') + '\n'
    );
  } catch {
    return '(audit log unavailable)\n';
  }
}

function stampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function compressDirectory(sourceDir: string, zipPath: string): void {
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Compress-Archive -Path (Join-Path -Path '${sourceDir.replace(/'/g, "''")}' -ChildPath '*') -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: SUPPORT_SPAWN_TIMEOUT_MS }
    );
    if (ps.error) {
      throw new Error(`Compress-Archive failed to run: ${ps.error.message}`);
    }
    if (ps.status !== 0 || !fs.existsSync(zipPath)) {
      throw new Error(
        `Compress-Archive failed: ${(ps.stderr || ps.stdout || 'unknown error').trim()}`
      );
    }
    return;
  }

  const zip = spawnSync('zip', ['-r', '-q', zipPath, '.'], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout: SUPPORT_SPAWN_TIMEOUT_MS,
  });
  if (zip.error) {
    throw new Error(`zip failed to run: ${zip.error.message}`);
  }
  if (zip.status !== 0 || !fs.existsSync(zipPath)) {
    throw new Error(`zip failed: ${(zip.stderr || zip.stdout || 'unknown error').trim()}`);
  }
}

function rmDirRecursive(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Build a support zip (message + system info + optional logs), save a copy to
 * the Desktop when possible, and return the temp zip path for HTTP download.
 */
export function buildSupportBundle(input: SupportRequestInput): SupportBundleResult {
  const message = input.message.trim();
  if (!message) {
    throw Object.assign(new Error('Describe the problem before sending.'), {
      code: 'validation_error',
    });
  }
  if (message.length > SUPPORT_MESSAGE_MAX) {
    throw Object.assign(new Error(`Message must be ${SUPPORT_MESSAGE_MAX} characters or fewer.`), {
      code: 'validation_error',
    });
  }

  const contactName = (input.contactName ?? '').trim().slice(0, SUPPORT_CONTACT_MAX);
  const replyTo = (input.replyTo ?? '').trim().slice(0, SUPPORT_CONTACT_MAX);
  const attachLogs = input.attachLogs !== false;
  const stamp = stampForFilename();
  const filename = `vrsi-wallboard-support-${stamp}.zip`;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsi-support-'));
  const bundleDir = path.join(tmpRoot, 'bundle');
  fs.mkdirSync(bundleDir);

  try {
    const messageLines = [
      'VRSI WallBoard — Support Request',
      `Created: ${new Date().toISOString()}`,
      `App version: ${appVersion}`,
      contactName ? `Contact name: ${contactName}` : null,
      replyTo ? `Reply-to: ${replyTo}` : null,
      '',
      '--- Problem description ---',
      message,
      '',
    ].filter((line): line is string => line !== null);
    fs.writeFileSync(path.join(bundleDir, 'message.txt'), messageLines.join('\n'), 'utf8');
    fs.writeFileSync(path.join(bundleDir, 'system-info.txt'), buildSystemInfo(), 'utf8');

    if (attachLogs) {
      const logsDir = resolveLogsDir();
      const combined = readLogTail(path.join(logsDir, 'combined.log'), LOG_TAIL_MAX_BYTES);
      if (combined !== null) {
        fs.writeFileSync(path.join(bundleDir, 'combined-log-tail.txt'), combined, 'utf8');
      }
      const updateLog = readLogTail(path.join(logsDir, 'update.log'), UPDATE_LOG_TAIL_MAX_BYTES);
      if (updateLog !== null) {
        fs.writeFileSync(path.join(bundleDir, 'update-log-tail.txt'), updateLog, 'utf8');
      }
      fs.writeFileSync(path.join(bundleDir, 'audit-snippet.txt'), buildAuditSnippet(), 'utf8');
    }

    const zipPath = path.join(tmpRoot, filename);
    compressDirectory(bundleDir, zipPath);
    const sizeBytes = fs.statSync(zipPath).size;

    let savedPath: string | null = null;
    const desktop = resolveDesktopDir();
    if (desktop) {
      try {
        const dest = path.join(desktop, filename);
        fs.copyFileSync(zipPath, dest);
        savedPath = dest;
      } catch (e) {
        logger.warn('Could not copy support zip to Desktop', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Keep a copy under the logs dir for IT if Desktop write failed or for history
    try {
      const archiveDir = path.join(resolveLogsDir(), 'support-reports');
      fs.mkdirSync(archiveDir, { recursive: true });
      const archivePath = path.join(archiveDir, filename);
      fs.copyFileSync(zipPath, archivePath);
      if (!savedPath) savedPath = archivePath;
    } catch (e) {
      logger.warn('Could not archive support zip under logs dir', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return { zipPath, filename, savedPath, sizeBytes };
  } catch (e) {
    rmDirRecursive(tmpRoot);
    throw e;
  }
}

/** Remove the temp directory that contains the zip (call after response is sent). */
export function cleanupSupportTemp(zipPath: string): void {
  const tmpRoot = path.dirname(zipPath);
  if (tmpRoot.includes('vrsi-support-')) {
    rmDirRecursive(tmpRoot);
  }
}

export function supportReportsArchiveDir(): string {
  return path.join(resolveLogsDir(), 'support-reports');
}

/** Path to a packaged support zip in the archive dir (for optional browser download). */
export function resolveArchivedSupportZip(filename: string): string | null {
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith('.zip') || !base.startsWith('vrsi-wallboard-support-')) {
    return null;
  }
  const full = path.join(supportReportsArchiveDir(), base);
  return fs.existsSync(full) ? full : null;
}

export function buildSupportMailContent(
  message: string,
  contactName: string,
  replyTo: string,
  filename: string,
  savedPath: string | null
): { subject: string; body: string } {
  const subject = `VRSI WallBoard support — ${new Date().toISOString().slice(0, 10)}`;
  const attachHint = savedPath
    ? `Please attach this support package (if not already attached):\n${savedPath}`
    : `Please attach the support package zip:\n${filename}`;
  const body = [
    contactName ? `From: ${contactName}` : null,
    replyTo ? `Reply-to: ${replyTo}` : null,
    contactName || replyTo ? '' : null,
    message.trim(),
    '',
    '---',
    attachHint,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  return { subject, body };
}

function resolveSupportMailScript(): string | null {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const script = path.join(repoRoot, 'scripts', 'windows', 'Open-SupportMail.ps1');
  return fs.existsSync(script) ? script : null;
}

/**
 * Run Open-SupportMail.ps1 exactly once. The script tries classic Outlook COM
 * first and falls back to a mailto: (To + Subject, no Body — verified live
 * that Subject alone doesn't trigger the garbling below) internally — a single
 * invocation so a "failed" first attempt can never fire a second UI-touching
 * launch on top of a compose window that is already on screen (seen live:
 * decoded subject/body dumped into the To field). The script bounds the COM
 * attempt with its own 10s inner timeout so a hung COM activation can't eat
 * this call's whole 30s budget and starve the internal mailto fallback (seen
 * live: ETIMEDOUT with nothing opened at all). Subject and Body both travel
 * via temp files, never through powershell.exe's legacy argv tokenizer.
 * Returns the method the script reports on stdout, or null if nothing opened.
 */
function runSupportMailScript(
  zipPath: string,
  to: string,
  subject: string,
  body: string
): SupportDeliveryMethod | null {
  const script = resolveSupportMailScript();
  if (!script || process.platform !== 'win32') return null;

  let stagingDir: string;
  try {
    stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsi-support-mail-'));
  } catch (e) {
    logger.warn('Could not create support mail staging dir', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
  try {
    const subjectPath = path.join(stagingDir, 'subject.txt');
    const bodyPath = path.join(stagingDir, 'body.txt');
    fs.writeFileSync(subjectPath, subject, 'utf8');
    fs.writeFileSync(bodyPath, body, 'utf8');
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-ZipPath',
        zipPath,
        '-To',
        to,
        '-SubjectPath',
        subjectPath,
        '-BodyPath',
        bodyPath,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: SUPPORT_SPAWN_TIMEOUT_MS }
    );
    if (ps.error) {
      logger.warn('Support mail script failed to run or timed out', {
        error: ps.error.message,
      });
      return null;
    }
    if (ps.status !== 0) {
      // The script writes the real failure reason (e.g. the Outlook COM
      // exception) to stderr — surface it instead of failing silently.
      logger.warn('Support mail script could not open a mail window', {
        status: ps.status,
        stderr: (ps.stderr ?? '').trim().slice(0, 2000),
      });
      return null;
    }
    const method = (ps.stdout ?? '').trim();
    if (method === 'outlook' || method === 'mailto') return method;
    logger.warn('Support mail script returned unexpected output', {
      stdout: method.slice(0, 200),
    });
    return null;
  } catch (e) {
    logger.warn('Support mail script failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  } finally {
    rmDirRecursive(stagingDir);
  }
}

/**
 * Try Outlook with zip attached; the script itself falls back to a
 * mailto: (To + Subject, no Body) when Outlook COM is unavailable (Windows).
 * Email address is never returned to the client.
 */
export function composeSupportMail(
  zipPath: string,
  message: string,
  contactName: string,
  replyTo: string,
  filename: string,
  savedPath: string | null
): SupportDeliveryMethod {
  const to = resolveSupportEmail();
  const { subject, body } = buildSupportMailContent(message, contactName, replyTo, filename, savedPath);
  const attachPath = savedPath ?? zipPath;

  if (process.platform === 'win32') {
    const method = runSupportMailScript(attachPath, to, subject, body);
    if (method) return method;
    logger.warn('Support mail could not open Outlook or mailto — user must email manually');
  }

  return 'mailto';
}

/** Build the zip, open mail (Outlook or mailto), and return delivery metadata only. */
export function deliverSupportReport(input: SupportRequestInput): SupportDeliveryResult {
  const message = input.message.trim();
  const contactName = (input.contactName ?? '').trim().slice(0, SUPPORT_CONTACT_MAX);
  const replyTo = (input.replyTo ?? '').trim().slice(0, SUPPORT_CONTACT_MAX);

  const bundle = buildSupportBundle(input);
  const method = composeSupportMail(
    bundle.zipPath,
    message,
    contactName,
    replyTo,
    bundle.filename,
    bundle.savedPath
  );
  cleanupSupportTemp(bundle.zipPath);

  return {
    method,
    filename: bundle.filename,
    savedPath: bundle.savedPath,
    sizeBytes: bundle.sizeBytes,
  };
}
