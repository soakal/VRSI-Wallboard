import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resetPersistenceForTests } from '../storage/factory.js';
import {
  buildSupportBundle,
  buildSupportMailContent,
  cleanupSupportTemp,
  resolveArchivedSupportZip,
  resolveSupportEmail,
  DEFAULT_SUPPORT_EMAIL,
  SUPPORT_MESSAGE_MAX,
} from './supportService.js';

let dataDir: string;
let logsDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsi-support-test-'));
  logsDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.LOGS_DIR = logsDir;
  process.env.DISABLE_AZURE = 'true';
  delete process.env.SUPPORT_EMAIL;
  resetPersistenceForTests();
});

afterEach(() => {
  resetPersistenceForTests();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('supportService', () => {
  it('resolveSupportEmail falls back to the product default', () => {
    assert.equal(resolveSupportEmail(), DEFAULT_SUPPORT_EMAIL);
    process.env.SUPPORT_EMAIL = '  other@example.com  ';
    assert.equal(resolveSupportEmail(), 'other@example.com');
  });

  it('rejects an empty message', () => {
    assert.throws(
      () => buildSupportBundle({ message: '   ' }),
      (err: unknown) =>
        err instanceof Error && (err as { code?: string }).code === 'validation_error'
    );
  });

  it('rejects an oversized message', () => {
    assert.throws(
      () => buildSupportBundle({ message: 'x'.repeat(SUPPORT_MESSAGE_MAX + 1) }),
      (err: unknown) =>
        err instanceof Error && (err as { code?: string }).code === 'validation_error'
    );
  });

  it('builds a zip with message and system info', () => {
    fs.writeFileSync(path.join(logsDir, 'combined.log'), 'sample log line\n', 'utf8');
    const bundle = buildSupportBundle({
      message: 'Board will not save notes after idle.',
      contactName: 'Test User',
      replyTo: 'test@example.com',
      attachLogs: true,
    });
    try {
      assert.ok(fs.existsSync(bundle.zipPath));
      assert.ok(bundle.filename.startsWith('vrsi-wallboard-support-'));
      assert.ok(bundle.filename.endsWith('.zip'));
      assert.ok(bundle.sizeBytes > 40);
      // Archive copy under logs/support-reports
      assert.ok(bundle.savedPath);
      assert.ok(fs.existsSync(bundle.savedPath!));
      assert.equal(resolveArchivedSupportZip(bundle.filename), bundle.savedPath);
    } finally {
      cleanupSupportTemp(bundle.zipPath);
    }
  });

  it('buildSupportMailContent does not embed a support inbox address', () => {
    const { subject, body } = buildSupportMailContent(
      'Save failed',
      'Jane',
      'jane@customer.com',
      'vrsi-wallboard-support-test.zip',
      'C:\\Users\\jane\\Desktop\\vrsi-wallboard-support-test.zip'
    );
    assert.match(subject, /VRSI WallBoard support/);
    assert.match(body, /Save failed/);
    assert.match(body, /jane@customer.com/);
    assert.doesNotMatch(body, /@vrs-inc\.com/i);
  });
});
