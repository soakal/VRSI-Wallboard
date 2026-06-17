import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Job } from '@vrsi/wallboard-shared'

// Each test runs against a throwaway SQLite database. DATA_DIR is read when the
// persistence singleton is first created, so we point it at a fresh dir and reset
// the singleton before every test.
import { resetPersistenceForTests } from '../storage/factory.js'
import {
  applyBoardImport,
  setJobStatus,
  setJobBinderPrinted,
  setJobBlocked,
  getMergedJobs,
  getJobBoardTab,
  getBoardConfig,
  getBoardStateFile,
} from './boardService.js'

let dataDir: string
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsi-test-'))
  process.env.DATA_DIR = dataDir
  process.env.DISABLE_AZURE = 'true'
  resetPersistenceForTests()
})
afterEach(() => {
  resetPersistenceForTests()
  try { fs.rmSync(dataDir, { recursive: true, force: true }) } catch { /* WAL handle may linger on Windows */ }
})

const job = (jobNumber: string): Job => ({
  jobNumber,
  pm: 'pat@vrs-inc.com',
  customer: 'Acme',
  materialsManager: 'mary@vrs-inc.com',
  pabsComplete: null,
  shipToPm: null,
  shipToCustomer: '2026-07-01',
})
const find = (jn: string) => getMergedJobs().find((j) => j.jobNumber === jn)
const actor = { id: 'u_brian', name: 'Brian Kalsic' }

// ── Import preservation (v0.9.3) ────────────────────────────────────────
test('re-import keeps a manually shipped job shipped (status manual-lock)', async () => {
  await applyBoardImport([job('9201')], 'ops.xlsm', { '9201': 'in_progress' }, {})
  assert.equal(find('9201')!.status, 'in_progress')
  await setJobStatus('9201', 'shipped', actor)
  await applyBoardImport([job('9201')], 'ops.xlsm', { '9201': 'in_progress' }, {})
  assert.equal(find('9201')!.status, 'shipped')
})

test('a brand-new job still takes its status from the spreadsheet', async () => {
  await applyBoardImport([job('9201')], 'ops.xlsm', { '9201': 'in_progress' }, {})
  await setJobStatus('9201', 'shipped', actor)
  await applyBoardImport([job('9201'), job('9300')], 'ops.xlsm', { '9201': 'in_progress', '9300': 'shipped' }, {})
  assert.equal(find('9300')!.status, 'shipped')
  assert.equal(find('9201')!.status, 'shipped')
})

test('re-import keeps a manually set binder checkmark (binder manual-lock)', async () => {
  await applyBoardImport([job('9300')], 'ops.xlsm', { '9300': 'in_progress' }, {})
  await setJobBinderPrinted('9300', true, actor)
  await applyBoardImport([job('9300')], 'ops.xlsm', { '9300': 'in_progress' }, {}, { '9300': false })
  assert.equal(find('9300')!.binderPrinted, true)
})

// ── New/changed note flagging (v0.10.0 Phase 2) ─────────────────────────
test('import with a note flags hasNewNote; unchanged re-import clears it; change re-flags it', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, { '100': 'first note' })
  assert.equal(find('100')!.hasNewNote, true)
  assert.ok(find('100')!.notes.some((n) => n.text === 'first note'))

  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, { '100': 'first note' })
  assert.equal(find('100')!.hasNewNote, false)

  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, { '100': 'changed note' })
  assert.equal(find('100')!.hasNewNote, true)
  assert.equal(find('100')!.notes.filter((n) => n.authorName === 'Ops Schedule').length, 1)
})

// ── Blocked tab (v0.10.0 Phase 3) ───────────────────────────────────────
test('blocking a job routes it to the blocked tab and stores the reason', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  assert.equal(getJobBoardTab(find('100')!, getBoardConfig()), 'project')
  await setJobBlocked('100', true, 'waiting on parts', actor)
  assert.equal(find('100')!.blocked, true)
  assert.equal(find('100')!.blockedReason, 'waiting on parts')
  assert.equal(getJobBoardTab(find('100')!, getBoardConfig()), 'blocked')
})

test('import never clears blocked, and unblock routes back by status', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  await setJobBlocked('100', true, 'waiting on parts', actor)
  // Re-import (note changes, status stays in_progress) must not disturb the block.
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, { '100': 'a note' })
  assert.equal(find('100')!.blocked, true)
  assert.equal(find('100')!.blockedReason, 'waiting on parts')
  await setJobBlocked('100', false, null, actor)
  assert.equal(find('100')!.blocked, false)
  assert.equal(find('100')!.blockedReason, null)
  assert.equal(getJobBoardTab(find('100')!, getBoardConfig()), 'project')
})

test('blocking with a reason adds a note that survives unblock', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  await setJobBlocked('100', true, 'waiting on parts', actor)
  const noted = find('100')!.notes.filter((n) => n.text.includes('waiting on parts'))
  assert.equal(noted.length, 1, 'block reason captured as a note')
  assert.ok(noted[0].text.startsWith('⛔ Blocked:'), 'note labelled as a block')
  assert.equal(noted[0].authorName, 'Brian Kalsic', 'attributed to the blocking user')
  // Unblock — blockedReason clears but the note stays in the history.
  await setJobBlocked('100', false, null, actor)
  assert.equal(find('100')!.blockedReason, null)
  assert.equal(
    find('100')!.notes.filter((n) => n.text.includes('waiting on parts')).length,
    1,
    'block note still present after unblock',
  )
})

test('re-saving the same blocked reason does not duplicate the note', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  await setJobBlocked('100', true, 'parked', actor)
  await setJobBlocked('100', true, 'parked', actor)
  assert.equal(find('100')!.notes.filter((n) => n.text.includes('parked')).length, 1)
})

test('a blocked job dropped from the spreadsheet is preserved; a plain one is pruned', async () => {
  await applyBoardImport([job('100'), job('200')], 'ops.xlsm', { '100': 'in_progress', '200': 'in_progress' }, {})
  await setJobBlocked('100', true, 'parked', actor)
  await setJobStatus('200', 'in_progress', actor)
  await applyBoardImport([job('300')], 'ops.xlsm', { '300': 'in_progress' }, {})
  assert.equal(getBoardStateFile()['100']?.blocked, true, 'blocked state preserved')
  assert.equal(getBoardStateFile()['200'], undefined, 'plain note-less job pruned')
})

test('a returning blocked job keeps its blocked state intact', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  await setJobBlocked('100', true, 'parked', actor)
  await applyBoardImport([job('200')], 'ops.xlsm', { '200': 'in_progress' }, {})   // 100 drops out
  await applyBoardImport([job('100'), job('200')], 'ops.xlsm', { '100': 'in_progress', '200': 'in_progress' }, {})
  assert.equal(find('100')!.blocked, true)
})

// ── Cross-cutting: an unrelated mutation must not wipe locks/blocked ─────
test('adding a note does not wipe a job\'s blocked flag or manual locks', async () => {
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  await setJobStatus('100', 'shipped', actor)          // sets statusManual
  await setJobBlocked('100', true, 'parked', actor)
  // A later binder toggle reads+rewrites the whole row — blocked + statusManual must survive
  await setJobBinderPrinted('100', true, actor)
  await applyBoardImport([job('100')], 'ops.xlsm', { '100': 'in_progress' }, {})
  assert.equal(find('100')!.status, 'shipped', 'status lock survived the round trip')
  assert.equal(find('100')!.blocked, true, 'blocked survived the round trip')
})
