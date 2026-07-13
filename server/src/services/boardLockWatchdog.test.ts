import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Job } from '@vrsi/wallboard-shared'

// The lock watchdog interval is read once at module load, so it must be set
// BEFORE boardService is imported — this file uses dynamic import for that.
// Own file (not boardService.test.ts) so the tiny watchdog interval cannot
// leak into the other tests: node --test runs each file in its own process.
process.env.BOARD_LOCK_WATCHDOG_MS = '150'

let dataDir: string
let board: typeof import('./boardService.js')

const job = (jobNumber: string): Job => ({
  jobNumber,
  pm: 'pat@vrs-inc.com',
  customer: 'Acme',
  materialsManager: 'mary@vrs-inc.com',
  pabsComplete: null,
  shipToPm: null,
  shipToCustomer: '2026-07-01',
})
const actor = { id: 'u_brian', name: 'Brian Kalsic' }

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsi-watchdog-test-'))
  process.env.DATA_DIR = dataDir
  process.env.DISABLE_AZURE = 'true'
  const { resetPersistenceForTests } = await import('../storage/factory.js')
  resetPersistenceForTests()
  board = await import('./boardService.js')
  await board.applyBoardImport([job('9001')], 'test.xlsm', {}, {})
})

after(async () => {
  const { resetPersistenceForTests } = await import('../storage/factory.js')
  resetPersistenceForTests()
  try { fs.rmSync(dataDir, { recursive: true, force: true }) } catch { /* WAL handle may linger on Windows */ }
})

// Regression: v1.1.3 and earlier — a never-settling operation under
// withBoardWriteLock (e.g. a restore whose db.backup() hangs) wedged the
// mutation queue FOREVER: every later status/note/ship-date save hung until
// the server was restarted, while reads kept working. The watchdog must
// release the queue so saves keep flowing.
test('a hung withBoardWriteLock operation cannot wedge later saves', async () => {
  void board.withBoardWriteLock(() => new Promise<never>(() => { /* never settles */ }))

  const save = board.setJobStatus('9001', 'in_progress', actor)
  const outcome = await Promise.race([
    save.then(() => 'saved'),
    new Promise((r) => setTimeout(() => r('wedged'), 2000)),
  ])
  assert.equal(outcome, 'saved')
  assert.equal(board.getMergedJobs().find((j) => j.jobNumber === '9001')!.status, 'in_progress')
})

test('a rejecting withBoardWriteLock operation still does not wedge the queue', async () => {
  const failing = board.withBoardWriteLock(async () => {
    throw new Error('boom')
  })
  await assert.rejects(failing, /boom/)

  const save = board.setJobStatus('9001', 'ready_to_ship', actor)
  const outcome = await Promise.race([
    save.then(() => 'saved'),
    new Promise((r) => setTimeout(() => r('wedged'), 2000)),
  ])
  assert.equal(outcome, 'saved')
})
