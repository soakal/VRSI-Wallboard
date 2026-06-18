import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasValidGitCheckout, isNewer } from './update.js'

// ── isNewer ────────────────────────────────────────────────────────────────
test('isNewer: newer patch', () => {
  assert.equal(isNewer('0.15.1', '0.15.0'), true)
})

test('isNewer: newer minor', () => {
  assert.equal(isNewer('0.16.0', '0.15.3'), true)
})

test('isNewer: newer major', () => {
  assert.equal(isNewer('1.0.0', '0.99.99'), true)
})

test('isNewer: same version', () => {
  assert.equal(isNewer('0.15.3', '0.15.3'), false)
})

test('isNewer: older version', () => {
  assert.equal(isNewer('0.14.3', '0.15.0'), false)
})

test('isNewer: strips v prefix', () => {
  assert.equal(isNewer('v0.15.1', '0.15.0'), true)
  assert.equal(isNewer('0.15.1', 'v0.15.0'), true)
})

test('isNewer: strips pre-release suffix', () => {
  // A pre-release of the same base version should not be "newer"
  assert.equal(isNewer('0.15.0-beta.1', '0.15.0'), false)
  // A newer base version with pre-release IS newer
  assert.equal(isNewer('0.16.0-rc.1', '0.15.3'), true)
})

test('isNewer: double-digit version components', () => {
  assert.equal(isNewer('0.10.0', '0.9.3'), true)
  assert.equal(isNewer('0.15.10', '0.15.9'), true)
})

test('isNewer: invalid latest returns false', () => {
  assert.equal(isNewer('not-a-version', '0.15.0'), false)
})

// ── hasValidGitCheckout ─────────────────────────────────────────────────────
test('hasValidGitCheckout: true for this repository root', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  assert.equal(hasValidGitCheckout(repoRoot), true)
})

test('hasValidGitCheckout: false for non-git temp directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsi-git-check-'))
  try {
    assert.equal(hasValidGitCheckout(tmp), false)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
