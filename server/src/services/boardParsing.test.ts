import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_BOARD_CONFIG } from '@vrsi/wallboard-shared'
import {
  parseDateValue,
  detectColumns,
  mapSpreadsheetStatusToJobStatus,
  isCancelledSpreadsheetStatus,
  parseSpreadsheetCompleteFlag,
  isSpareJob,
  getJobBoardTab,
} from './boardService.js'

// ── parseDateValue ──────────────────────────────────────────────────────
test('parseDateValue: ISO and slash formats', () => {
  assert.equal(parseDateValue('2026-07-01'), '2026-07-01')
  assert.equal(parseDateValue('7/1/2026'), '2026-07-01')
  assert.equal(parseDateValue('7/1/26'), '2026-07-01')   // 2-digit year pivots to 2000s
  assert.equal(parseDateValue('7/1/99'), '1999-07-01')   // >=50 pivots to 1900s
})
test('parseDateValue: Date objects use local components (no UTC off-by-one)', () => {
  assert.equal(parseDateValue(new Date(2026, 6, 1)), '2026-07-01')
  assert.equal(parseDateValue(new Date('invalid')), null)
})
test('parseDateValue: Excel serial numbers', () => {
  assert.match(parseDateValue(45474) ?? '', /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(parseDateValue(0), null)          // below valid range
  assert.equal(parseDateValue(200000), null)     // above valid range
})
test('parseDateValue: placeholders and ambiguous text reject to null', () => {
  for (const v of ['TBD', 'N/A', 'ASAP', 'Wk of 6/15', 'hello', '', null, undefined]) {
    assert.equal(parseDateValue(v), null, `expected null for ${JSON.stringify(v)}`)
  }
})

// ── status mapping ──────────────────────────────────────────────────────
test('mapSpreadsheetStatusToJobStatus: known statuses', () => {
  assert.equal(mapSpreadsheetStatusToJobStatus('Shipped'), 'shipped')
  assert.equal(mapSpreadsheetStatusToJobStatus('shipped'), 'shipped')
  assert.equal(mapSpreadsheetStatusToJobStatus('Ready to Ship'), 'ready_to_ship')
  assert.equal(mapSpreadsheetStatusToJobStatus('RTS'), 'ready_to_ship')
  assert.equal(mapSpreadsheetStatusToJobStatus('Partially Shipped'), 'ready_to_ship')
  assert.equal(mapSpreadsheetStatusToJobStatus('Build'), 'in_progress')
  assert.equal(mapSpreadsheetStatusToJobStatus('Parts on order'), 'in_progress')
})
test('mapSpreadsheetStatusToJobStatus: On Hold / unknown / blank leave status unchanged (null)', () => {
  for (const v of ['On Hold', 'hold for parts', 'Quoting', '', '   ', 'Cancelled']) {
    assert.equal(mapSpreadsheetStatusToJobStatus(v), null, `expected null for "${v}"`)
  }
})
test('isCancelledSpreadsheetStatus', () => {
  assert.equal(isCancelledSpreadsheetStatus('Cancelled'), true)
  assert.equal(isCancelledSpreadsheetStatus('canceled'), true)
  assert.equal(isCancelledSpreadsheetStatus('Shipped'), false)
})

// ── complete-flag parsing ───────────────────────────────────────────────
test('parseSpreadsheetCompleteFlag: truthy and falsy variants', () => {
  for (const v of [1, '1', 'true', 'TRUE', 'yes', 'Y', true]) {
    assert.equal(parseSpreadsheetCompleteFlag(v), true, `expected true for ${JSON.stringify(v)}`)
  }
  for (const v of [0, '0', '', 'no', false, null, undefined, 2]) {
    assert.equal(parseSpreadsheetCompleteFlag(v), false, `expected false for ${JSON.stringify(v)}`)
  }
})

// ── spare detection + tab routing ───────────────────────────────────────
test('isSpareJob: spare carrier PM or sp- / "sp " prefix', () => {
  // Use an explicit spare carrier so the test doesn't depend on DEFAULT_BOARD_CONFIG's value.
  const cfg = { ...DEFAULT_BOARD_CONFIG, spareCarrier: 'spare@example.com' }
  assert.equal(isSpareJob({ jobNumber: '100', pm: 'spare@example.com' }, cfg), true)
  assert.equal(isSpareJob({ jobNumber: 'SP-200', pm: 'phil@x' }, cfg), true)
  assert.equal(isSpareJob({ jobNumber: 'sp 300', pm: 'phil@x' }, cfg), true)
  assert.equal(isSpareJob({ jobNumber: '9201', pm: 'phil@x' }, cfg), false)
})
test('getJobBoardTab: blocked > shipped > spare > project priority', () => {
  const cfg = DEFAULT_BOARD_CONFIG
  assert.equal(getJobBoardTab({ jobNumber: '1', pm: 'phil@x', status: 'in_progress', blocked: true }, cfg), 'blocked')
  assert.equal(getJobBoardTab({ jobNumber: '1', pm: 'phil@x', status: 'shipped' }, cfg), 'archive')
  assert.equal(getJobBoardTab({ jobNumber: 'SP-1', pm: 'phil@x', status: 'in_progress' }, cfg), 'spare-parts')
  assert.equal(getJobBoardTab({ jobNumber: '100', pm: 'phil@x', status: 'in_progress' }, cfg), 'project')
})

// ── column detection ────────────────────────────────────────────────────
test('detectColumns: a normal header row maps every field', () => {
  const { colMap } = detectColumns([
    'Job #', 'PM', 'Customer', 'Materials Manager', 'PABS Complete',
    'Ship to PM', 'Ship from VRSI', 'Status', 'Notes', 'Binder Printed',
  ])
  assert.equal(colMap.jobNumber, 0)
  assert.equal(colMap.pm, 1)
  assert.equal(colMap.customer, 2)
  assert.equal(colMap.materialsManager, 3)
  assert.equal(colMap.shipToPm, 5)
  assert.equal(colMap.shipToCustomer, 6)
  assert.equal(colMap.status, 7)
  assert.equal(colMap.notes, 8)
  assert.equal(colMap.binderPrinted, 9)
})
test('detectColumns: a PURCH/review "ship to PM" column never steals the real one', () => {
  const { colMap } = detectColumns(['Job', 'PURCH Review ship to PM', 'Ship to PM'])
  assert.equal(colMap.shipToPm, 2)
})
