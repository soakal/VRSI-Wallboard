import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
  supportEmail: string;
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
      { encoding: 'utf8', windowsHide: true }
    );
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
  });
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
  const supportEmail = resolveSupportEmail();
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

    return { zipPath, filename, savedPath, supportEmail, sizeBytes };
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
