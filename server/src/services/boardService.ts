// Default import (not `* as`) so the CJS `SSF` date-format helper is reachable —
// the namespace import drops it, which made parseDateValue throw on numeric date
// cells. esModuleInterop maps this to the full xlsx module object.
import XLSX from 'xlsx'
import { getPersistence } from '../storage/factory.js'
import { randomUUID } from 'crypto'
import {
  OPS_SCHEDULE_NOTE_AUTHOR_ID,
  OPS_SCHEDULE_NOTE_AUTHOR_NAME,
  DEFAULT_BOARD_CONFIG,
} from '@vrsi/wallboard-shared'
import type {
  Job,
  JobNote,
  JobStatus,
  BoardJob,
  BoardUser,
  BoardConfig,
  Actor,
} from '@vrsi/wallboard-shared'
import { canonicalPersonName, samePerson } from '../lib/personIdentity.js'

// ---------------------------------------------------------------------------
// Note ID generation
// ---------------------------------------------------------------------------
function generateNoteId(): string {
  return randomUUID()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Serialize board-state read-modify-write mutations so two concurrent
// status/note/ship-date writes can't each read the old state and clobber each
// other (last-writer-wins data loss). All mutators run through this queue.
// ---------------------------------------------------------------------------
let boardStateMutationQueue: Promise<unknown> = Promise.resolve()

function runExclusive<T>(fn: () => T): Promise<T> {
  const run = boardStateMutationQueue.then(() => fn())
  // Keep the chain alive even if fn throws, so one failure doesn't wedge it.
  boardStateMutationQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Run fn under the board write lock. Use for operations (e.g. restore) that must not race board mutations. */
export function withBoardWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  // runExclusive chains on the shared queue; we flatten the nested Promise here.
  const outer: Promise<Promise<T>> = runExclusive(fn)
  return outer.then((inner) => inner)
}

// ---------------------------------------------------------------------------
// Spreadsheet status helpers
// ---------------------------------------------------------------------------
/** Rows with Status "Cancelled" / "Canceled" are omitted from the board entirely. */
export function isCancelledSpreadsheetStatus(raw: string): boolean {
  const s = raw.trim().toLowerCase()
  return s === 'cancelled' || s === 'canceled'
}

/** Map ops-schedule Status cell text to board workflow; null = leave board status unchanged. */
export function mapSpreadsheetStatusToJobStatus(raw: string): JobStatus | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s || isCancelledSpreadsheetStatus(raw)) return null

  if (s === 'on hold' || s.startsWith('hold')) return null

  // Exact "Shipped" only — not "Partially Shipped".
  if (s === 'shipped') return 'shipped'

  if (
    s === 'ready to ship' ||
    s === 'ready for ship' ||
    s === 'rts' ||
    (s.includes('ready') && s.includes('ship') && !s.includes('partial') && !s.includes('not '))
  ) {
    return 'ready_to_ship'
  }

  // Ops schedule uses these for active jobs that are not yet fully shipped.
  if (s === 'partially shipped' || (s.includes('partial') && s.includes('ship'))) {
    return 'ready_to_ship'
  }

  if (
    s === 'build' ||
    s === 'design' ||
    s === 'labor only' ||
    s === 'parts on order' ||
    s === 'in progress' ||
    s === 'in-progress' ||
    s.includes('on order')
  ) {
    return 'in_progress'
  }

  return null
}

// ---------------------------------------------------------------------------
// Date parsing helper
// ---------------------------------------------------------------------------
// Format a Date using its LOCAL components, not toISOString(). Excel parses
// text/Date cells as local midnight; toISOString() converts to UTC, which rolls
// the date back a day in every negative-UTC-offset timezone (all of N. America),
// silently storing ship dates off-by-one. Build yyyy-mm-dd from local parts.
function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateValue(value: unknown): string | null {
  if (value == null) return null
  // xlsx with cellDates:true + raw:true returns JS Date objects for date cells
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return formatLocalDate(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    if (/\bTBD\b|\bN\/A\b|\bASAP\b|–|—|\bto\b/i.test(trimmed)) return null
    // Excel often exports dates as m/d/yy or m/d/yyyy strings (no 4-digit year token).
    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed)
    if (slashMatch) {
      const month = parseInt(slashMatch[1], 10)
      const day = parseInt(slashMatch[2], 10)
      let year = parseInt(slashMatch[3], 10)
      if (year < 100) year += year >= 50 ? 1900 : 2000
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const d = new Date(year, month - 1, day)
        if (!isNaN(d.getTime()) && d.getMonth() === month - 1) return formatLocalDate(d)
      }
      return null
    }
    // Require a 4-digit year for free-form strings — reject 'Wk of 6/15', 'DD-Mon', etc.
    if (!/\b\d{4}\b/.test(trimmed)) return null
    const d = new Date(trimmed)
    if (isNaN(d.getTime())) return null
    return formatLocalDate(d)
  }
  if (typeof value === 'number') {
    if (value < 1 || value > 109574) return null
    // Defensive: never let a date cell crash the whole import if SSF is unavailable.
    if (!XLSX.SSF || typeof XLSX.SSF.format !== 'function') return null
    const formatted = XLSX.SSF.format('yyyy-mm-dd', value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return null
    return formatted
  }
  return null
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------
interface ColumnMap {
  jobNumber: number | null
  pm: number | null
  customer: number | null
  materialsManager: number | null
  pabsComplete: number | null
  shipToPm: number | null
  shipToCustomer: number | null
  binderPrinted: number | null
  status: number | null
  notes: number | null
}

/** Spreadsheet completion flags: 1 = complete/checked, 0 (or empty) = not complete. */
export function parseSpreadsheetCompleteFlag(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const s = String(value).trim()
  if (s === '1') return true
  if (s === '0' || s === '') return false
  const lower = s.toLowerCase()
  if (lower === 'true' || lower === 'yes' || lower === 'y') return true
  return false
}

export function detectColumns(headers: unknown[]): { colMap: ColumnMap; warnings: string[] } {
  const colMap: ColumnMap = {
    jobNumber: null,
    pm: null,
    customer: null,
    materialsManager: null,
    pabsComplete: null,
    shipToPm: null,
    shipToCustomer: null,
    binderPrinted: null,
    status: null,
    notes: null,
  }

  for (let i = 0; i < headers.length; i++) {
    const raw = String(headers[i] ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
    if (!raw) continue

    if (
      raw === 'job' ||
      (raw.includes('job') && (raw.includes('#') || raw.includes('num') || raw.includes('no')))
    ) {
      if (colMap.jobNumber === null) colMap.jobNumber = i
    } else if (
      (raw === 'pm' || raw.includes('project manager')) &&
      !raw.includes('ship')
    ) {
      if (colMap.pm === null) colMap.pm = i
    } else if (raw.includes('customer') || raw.includes('client')) {
      if (colMap.customer === null) colMap.customer = i
    } else if (raw.includes('material') && raw.includes('manag')) {
      if (colMap.materialsManager === null) colMap.materialsManager = i
    } else if (raw.includes('pab') && (raw.includes('complete') || raw.includes('finish'))) {
      if (colMap.pabsComplete === null) colMap.pabsComplete = i
    } else if (
      // Match the real "SHIP TO PM" date column. Require the contiguous phrase
      // "ship to pm" — a loose `ship && pm` test wrongly claimed the earlier
      // "PURCH Materials Review ... ship to PM" column (index 8), so the real
      // ship-to-PM date (index 12) was never read. Also exclude the purchasing /
      // materials-review column explicitly. Because the loop is left-to-right
      // and first-match-wins, a stray column must never pre-empt this one.
      raw.includes('ship to pm') &&
      !raw.includes('purch') &&
      !raw.includes('review')
    ) {
      if (colMap.shipToPm === null) colMap.shipToPm = i
    } else if (
      // "Ship from VRSI" is the ship-to-customer date. Use includes() (not ===)
      // so trailing punctuation/notes ("Ship from VRSI:", "Ship from VRSI (date)")
      // still match. "ship to cust(omer)" also accepted; guard against the
      // "SHIP TO PM: ... before ship to cust" header (already excluded above by
      // failing the ship-to-pm branch, but it lacks 'customer' and 'from vrsi'
      // so it will not match here either).
      raw.includes('ship from vrsi') ||
      raw.includes('ship to customer') ||
      raw.includes('expected ship') ||
      raw.includes('customer ship') ||
      (raw.includes('ship from') && !raw.includes('pm')) ||
      (raw.includes('ship') && raw.includes('date') && !raw.includes('pm')) ||
      (raw.includes('ship') && raw.includes('customer') && !raw.includes('pm'))
    ) {
      if (colMap.shipToCustomer === null) colMap.shipToCustomer = i
    } else if (
      raw === 'binder printed' ||
      (raw.includes('binder') && raw.includes('print'))
    ) {
      if (colMap.binderPrinted === null) colMap.binderPrinted = i
    } else if (raw.includes('status')) {
      if (colMap.status === null) colMap.status = i
    } else if (
      (raw === 'notes' ||
        raw === 'note' ||
        raw.includes('comment') ||
        raw.includes('remark') ||
        (raw.includes('note') && !raw.includes('ship'))) &&
      !raw.includes('ship') &&
      !raw.includes('status')
    ) {
      if (colMap.notes === null) colMap.notes = i
    }
  }

  const warnings: string[] = []
  const fieldNames: Array<keyof ColumnMap> = [
    'jobNumber',
    'pm',
    'customer',
    'materialsManager',
    'pabsComplete',
    'shipToPm',
    'shipToCustomer',
  ]
  for (const field of fieldNames) {
    if (colMap[field] === null) {
      warnings.push(`Column not found for field: ${field}`)
    }
  }
  if (colMap.status === null) {
    warnings.push('Status column not found — shipped jobs will not be auto-archived')
  }
  if (colMap.notes === null) {
    warnings.push('Notes column not found — spreadsheet notes will not be imported')
  }
  if (colMap.binderPrinted === null) {
    warnings.push('Binder Printed column not found — binder checkmarks will not be imported')
  }

  return { colMap, warnings }
}

// ---------------------------------------------------------------------------
// jobs.json
// ---------------------------------------------------------------------------
export interface JobsFile {
  jobs: Job[]
  importedAt: string
  sourceFile: string
  newJobNumbers: string[]
  changedNoteJobNumbers?: string[]
}

export function loadJobsFile(): JobsFile | null {
  return getPersistence().loadJobsFile()
}

export async function saveJobsFile(
  jobs: Job[],
  sourceFile: string,
  changedNoteJobNumbers: string[] = [],
): Promise<void> {
  const existing = loadJobsFile()
  const existingNumbers = new Set(existing?.jobs.map((j) => j.jobNumber) ?? [])

  const currentNumbers = new Set(jobs.map((j) => j.jobNumber))

  // NEW badge: only jobs that were not in the previous import file.
  const newJobNumbers = jobs
    .map((j) => j.jobNumber)
    .filter((n) => !existingNumbers.has(n))

  const data: JobsFile = {
    jobs,
    importedAt: new Date().toISOString(),
    sourceFile,
    newJobNumbers,
    changedNoteJobNumbers,
  }
  getPersistence().saveJobsFile(data)

  // Prune orphaned board-state: notes/status/ship-date overrides for jobs no
  // longer present in the spreadsheet would otherwise accumulate forever and,
  // worse, be silently inherited if a job number is later reused.
  // Serialize prune after import status/note writes complete.
  await runExclusive(() => {
    pruneOrphanedBoardState(currentNumbers)
  })
}

function pruneOrphanedBoardState(validJobNumbers: Set<string>): void {
  const state = getBoardStateFile()
  let changed = false
  for (const jobNumber of Object.keys(state)) {
    if (!validJobNumbers.has(jobNumber)) {
      // Preserve entries that have user notes or are manually blocked — both are
      // irreplaceable user data a re-imported (or reused) job number must not inherit.
      if (state[jobNumber].notes && state[jobNumber].notes.length > 0) continue
      if (state[jobNumber].blocked) continue
      delete state[jobNumber]
      changed = true
    }
  }
  if (changed) writeBoardState(state)
}

// ---------------------------------------------------------------------------
// XLSM parsing
// ---------------------------------------------------------------------------
export function parseXlsm(
  buffer: Buffer,
  originalName: string,
): {
  jobs: Job[]
  warnings: string[]
  rowErrors: string[]
  skipped: number
  importedStatuses: Record<string, JobStatus>
  importedNotes: Record<string, string>
  importedBinderPrinted: Record<string, boolean>
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  // Prefer "Active Projects" sheet; fall back to first sheet
  const sheetName = workbook.SheetNames.includes('Active Projects')
    ? 'Active Projects'
    : workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  // raw: true so date cells come as JS Date objects (cellDates:true above).
  // raw: false formatted strings via Excel's cell format, which often uses
  // 2-digit years ("m/d/yy") that parseDateValue would reject as ambiguous.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][]

  if (rows.length < 2) {
    return {
      jobs: [],
      warnings: ['Spreadsheet is empty'],
      rowErrors: [],
      skipped: 0,
      importedStatuses: {},
      importedNotes: {},
      importedBinderPrinted: {},
    }
  }

  // Active Projects has a numeric index row first — real headers are in row index 1
  const firstRow = (rows[0] as unknown[]).map((v) => String(v ?? '').trim())
  const isNumericHeader = firstRow.length > 0 && firstRow.every((v) => v === '' || /^\d+$/.test(v))
  const headerRowIndex = isNumericHeader ? 1 : 0
  const dataStartIndex = headerRowIndex + 1

  const headers = rows[headerRowIndex] as unknown[]
  const { colMap, warnings } = detectColumns(headers)

  const jobs: Job[] = []
  const importedStatuses: Record<string, JobStatus> = {}
  const importedNotes: Record<string, string> = {}
  const importedBinderPrinted: Record<string, boolean> = {}
  const rowErrors: string[] = []
  let skipped = 0
  const seenJobNumbers = new Set<string>()

  for (let r = dataStartIndex; r < rows.length; r++) {
    const row = rows[r] as unknown[]

    const jobNumberRaw =
      colMap.jobNumber !== null ? row[colMap.jobNumber] : undefined
    if (jobNumberRaw == null || String(jobNumberRaw).trim() === '') {
      const rowIsEmpty = row.every((c) => c == null || String(c ?? '').trim() === '')
      if (!rowIsEmpty) { rowErrors.push(`Row ${r + 1}: missing job number — skipped`); skipped++ }
      continue
    }

    const getString = (col: number | null): string => {
      if (col === null) return ''
      const val = row[col]
      return val != null ? String(val).trim().toLowerCase() : ''
    }

    const getDate = (col: number | null): string | null => {
      if (col === null) return null
      return parseDateValue(row[col])
    }

    const getNoteText = (col: number | null): string => {
      if (col === null) return ''
      const val = row[col]
      if (val == null) return ''
      return String(val).trim()
    }

    const jobNumber = String(jobNumberRaw).trim()

    if (colMap.status !== null) {
      const rawStatus = String(row[colMap.status] ?? '').trim()
      if (isCancelledSpreadsheetStatus(rawStatus)) {
        skipped++
        continue
      }
    }

    if (seenJobNumbers.has(jobNumber)) {
      rowErrors.push(`Row ${r + 1}: duplicate job number ${jobNumber}`)
    }
    seenJobNumbers.add(jobNumber)

    const job: Job = {
      jobNumber,
      pm: canonicalPersonName(getString(colMap.pm)),
      customer: colMap.customer !== null
        ? (row[colMap.customer] != null ? String(row[colMap.customer]).trim() : '')
        : '',
      materialsManager: canonicalPersonName(getString(colMap.materialsManager)),
      pabsComplete: getDate(colMap.pabsComplete),
      shipToPm: getDate(colMap.shipToPm),
      shipToCustomer: getDate(colMap.shipToCustomer),
    }

    // Status column: "Shipped" → archive; "Ready to Ship" → ready_to_ship checkmarks.
    if (colMap.status !== null) {
      const mapped = mapSpreadsheetStatusToJobStatus(String(row[colMap.status] ?? ''))
      if (mapped) importedStatuses[jobNumber] = mapped
    }

    const noteText = getNoteText(colMap.notes)
    if (noteText) importedNotes[jobNumber] = noteText

    if (colMap.binderPrinted !== null) {
      importedBinderPrinted[jobNumber] = parseSpreadsheetCompleteFlag(
        row[colMap.binderPrinted],
      )
    }

    jobs.push(job)
  }

  return { jobs, warnings, rowErrors, skipped, importedStatuses, importedNotes, importedBinderPrinted }
}

/** Merge spreadsheet notes as a single Ops Schedule note per job; never remove or edit user notes. */
export function mergeImportedOpsScheduleNotes(importedNotes: Record<string, string>): Promise<number> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    let changed = false
    let merged = 0
    const now = new Date().toISOString()

    for (const [jobNumber, rawText] of Object.entries(importedNotes)) {
      const text = rawText.trim()
      if (!text) continue

      const existing = state[jobNumber] ?? {
        status: 'none' as JobStatus,
        shipDateOverride: null,
        shipDateOverrideNote: null,
        binderPrinted: false,
        notes: [],
        updatedAt: '',
      }

      const userNotes = existing.notes.filter((n) => n.authorId !== OPS_SCHEDULE_NOTE_AUTHOR_ID)
      const existingOps = existing.notes.find((n) => n.authorId === OPS_SCHEDULE_NOTE_AUTHOR_ID)
      if (existingOps?.text === text) continue

      const opsNote: JobNote = {
        id: existingOps?.id ?? generateNoteId(),
        authorId: OPS_SCHEDULE_NOTE_AUTHOR_ID,
        authorName: OPS_SCHEDULE_NOTE_AUTHOR_NAME,
        text,
        createdAt: existingOps?.createdAt ?? now,
      }

      state[jobNumber] = {
        ...existing,
        notes: [...userNotes, opsNote],
        version: (existing.version ?? 0) + 1,
        updatedAt: now,
      }
      changed = true
      merged++
    }

    if (changed) writeBoardState(state)
    return merged
  })
}

export interface BoardImportApplyResult {
  shippedApplied: number
  readyToShipApplied: number
  inProgressApplied: number
  notesImported: number
  binderPrintedApplied: number
}

const emptyJobState = (): JobStateEntry => ({
  status: 'none' as JobStatus,
  shipDateOverride: null,
  shipDateOverrideNote: null,
  binderPrinted: false,
  statusManual: false,
  binderManual: false,
  blocked: false,
  blockedAt: null,
  blockedReason: null,
  notes: [],
  updatedAt: '',
})

/** Apply status + binder + ops notes to board-state, then save jobs (full import pipeline). */
export async function applyBoardImport(
  jobs: Job[],
  sourceFile: string,
  importedStatuses: Record<string, JobStatus>,
  importedNotes: Record<string, string>,
  importedBinderPrinted: Record<string, boolean> = {},
): Promise<BoardImportApplyResult> {
  const config = getBoardConfig()
  const jobByNumber = new Map(jobs.map((j) => [j.jobNumber, j]))
  const now = new Date().toISOString()
  // Jobs whose Ops Schedule note was added/changed by THIS import — drives the
  // "new note" flag. Populated inside the lock below, read after it resolves.
  const changedNoteJobs: string[] = []

  const applyResult = await runExclusive(() => {
    const state = getBoardStateFile()
    let shippedApplied = 0
    let readyToShipApplied = 0
    let inProgressApplied = 0

    for (const [jobNumber, status] of Object.entries(importedStatuses)) {
      const existing = state[jobNumber] ?? emptyJobState()
      // Manual wins: a status the user set by hand is never reverted by import.
      if (existing.statusManual) continue
      if (existing.status === status) continue
      state[jobNumber] = { ...existing, status, version: (existing.version ?? 0) + 1, updatedAt: now }
      if (status === 'shipped') shippedApplied++
      else if (status === 'ready_to_ship') readyToShipApplied++
      else if (status === 'in_progress') inProgressApplied++
    }

    let binderPrintedApplied = 0
    for (const [jobNumber, printed] of Object.entries(importedBinderPrinted)) {
      const job = jobByNumber.get(jobNumber)
      if (job && isSpareJob(job, config)) continue
      const existing = state[jobNumber] ?? emptyJobState()
      // Manual wins: a binder checkmark the user set by hand is never reverted by import.
      if (existing.binderManual) continue
      if (existing.binderPrinted === printed) continue
      state[jobNumber] = { ...existing, binderPrinted: printed, version: (existing.version ?? 0) + 1, updatedAt: now }
      if (printed) binderPrintedApplied++
    }

    let notesImported = 0
    for (const [jobNumber, rawText] of Object.entries(importedNotes)) {
      const text = rawText.trim()
      if (!text) continue

      const existing = state[jobNumber] ?? emptyJobState()
      const userNotes = existing.notes.filter((n) => n.authorId !== OPS_SCHEDULE_NOTE_AUTHOR_ID)
      const existingOps = existing.notes.find((n) => n.authorId === OPS_SCHEDULE_NOTE_AUTHOR_ID)
      if (existingOps?.text === text) continue

      const opsNote: JobNote = {
        id: existingOps?.id ?? generateNoteId(),
        authorId: OPS_SCHEDULE_NOTE_AUTHOR_ID,
        authorName: OPS_SCHEDULE_NOTE_AUTHOR_NAME,
        text,
        createdAt: existingOps?.createdAt ?? now,
      }

      state[jobNumber] = {
        ...existing,
        notes: [...userNotes, opsNote],
        version: (existing.version ?? 0) + 1,
        updatedAt: now,
      }
      notesImported++
      changedNoteJobs.push(jobNumber)
    }

    writeBoardState(state)
    return {
      shippedApplied,
      readyToShipApplied,
      inProgressApplied,
      notesImported,
      binderPrintedApplied,
    }
  })

  await saveJobsFile(jobs, sourceFile, changedNoteJobs)
  return applyResult
}

// ---------------------------------------------------------------------------
// board-state.json
// ---------------------------------------------------------------------------
type JobStateEntry = {
  status: JobStatus
  shipDateOverride: string | null
  shipDateOverrideNote: string | null
  binderPrinted: boolean
  statusManual?: boolean
  binderManual?: boolean
  blocked?: boolean
  blockedAt?: string | null
  blockedReason?: string | null
  version?: number
  notes: JobNote[]
  updatedAt: string
  updatedBy?: string
}

type BoardStateFile = {
  jobs: Record<string, JobStateEntry>
}

export function getBoardStateFile(): Record<string, JobStateEntry> {
  const raw = getPersistence().getBoardStateFile()
  const out: Record<string, JobStateEntry> = {}
  for (const [k, v] of Object.entries(raw)) {
    out[k] = {
      status: v.status,
      shipDateOverride: v.shipDateOverride,
      shipDateOverrideNote: v.shipDateOverrideNote ?? null,
      binderPrinted: v.binderPrinted,
      statusManual: v.statusManual ?? false,
      binderManual: v.binderManual ?? false,
      blocked: v.blocked ?? false,
      blockedAt: v.blockedAt ?? null,
      blockedReason: v.blockedReason ?? null,
      version: v.version,
      notes: v.notes,
      updatedAt: v.updatedAt,
      ...(v.updatedBy ? { updatedBy: v.updatedBy } : {}),
    }
  }
  return out
}

export function writeBoardState(state: ReturnType<typeof getBoardStateFile>): void {
  getPersistence().writeBoardState(state)
}

export function getJobState(jobNumber: string): JobStateEntry {
  const state = getBoardStateFile()
  return state[jobNumber] ?? emptyJobState()
}

export function setJobBinderPrinted(
  jobNumber: string,
  binderPrinted: boolean,
  actor?: Actor,
): Promise<void> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    const existing = state[jobNumber] ?? emptyJobState()
    state[jobNumber] = {
      ...existing,
      binderPrinted,
      binderManual: true,
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.name,
    }
    writeBoardState(state)
  })
}

export function setJobStatus(jobNumber: string, status: JobStatus, actor?: Actor): Promise<void> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    const existing = state[jobNumber] ?? emptyJobState()
    state[jobNumber] = {
      ...existing,
      status,
      statusManual: true,
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.name,
    }
    writeBoardState(state)
  })
}

/** Manually block/unblock a job (triage). Never set or cleared by import. */
export function setJobBlocked(
  jobNumber: string,
  blocked: boolean,
  reason: string | null,
  actor?: Actor,
): Promise<void> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    const existing = state[jobNumber] ?? emptyJobState()
    state[jobNumber] = {
      ...existing,
      blocked,
      blockedAt: blocked ? new Date().toISOString() : null,
      blockedReason: blocked ? ((reason ?? '').trim() || null) : null,
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.name,
    }
    writeBoardState(state)
  })
}

export function setShipDateOverride(
  jobNumber: string,
  date: string | null,
  actor?: Actor,
  note?: string | null,
): Promise<void> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    const existing = state[jobNumber] ?? emptyJobState()
    state[jobNumber] = {
      ...existing,
      shipDateOverride: date,
      shipDateOverrideNote:
        date === null
          ? null
          : note !== undefined
            ? (note ?? '').trim() || null
            : (existing.shipDateOverrideNote ?? null),
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.name,
    }
    writeBoardState(state)
  })
}

export function addNote(jobNumber: string, text: string, actor: Actor): Promise<JobNote> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    const existing = state[jobNumber] ?? emptyJobState()

    const note: JobNote = {
      id: generateNoteId(),
      authorId: actor.id,
      authorName: actor.name,
      text,
      createdAt: new Date().toISOString(),
    }

    state[jobNumber] = {
      ...existing,
      notes: [...existing.notes, note],
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    writeBoardState(state)
    return note
  })
}

export function updateNote(
  jobNumber: string,
  noteId: string,
  text: string,
  actor: Actor,
): Promise<{ ok: boolean; note?: JobNote; error?: string }> {
  return runExclusive(() => {
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'Note text cannot be empty' }

    const state = getBoardStateFile()
    const existing = state[jobNumber]
    if (!existing) return { ok: false, error: 'Job not found' }

    const note = existing.notes.find((n) => n.id === noteId)
    if (!note) return { ok: false, error: 'Note not found' }
    if (note.authorId === OPS_SCHEDULE_NOTE_AUTHOR_ID) {
      return { ok: false, error: 'Ops Schedule notes cannot be edited' }
    }
    if (note.authorId !== actor.id) {
      return { ok: false, error: 'Only the author can edit this note' }
    }

    const updated: JobNote = {
      ...note,
      text: trimmed,
      updatedAt: new Date().toISOString(),
    }
    state[jobNumber] = {
      ...existing,
      notes: existing.notes.map((n) => (n.id === noteId ? updated : n)),
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    writeBoardState(state)
    return { ok: true, note: updated }
  })
}

export function deleteNote(jobNumber: string, noteId: string, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  return runExclusive(() => {
    const state = getBoardStateFile()
    const existing = state[jobNumber]
    if (!existing) return { ok: true }

    const note = existing.notes.find((n) => n.id === noteId)
    if (!note) return { ok: false, error: 'Note not found' }
    if (note.authorId === OPS_SCHEDULE_NOTE_AUTHOR_ID) {
      return { ok: false, error: 'Ops Schedule notes cannot be deleted' }
    }
    if (note.authorId !== actor.id) {
      return { ok: false, error: 'Only the author can delete this note' }
    }

    state[jobNumber] = {
      ...existing,
      notes: existing.notes.filter((n) => n.id !== noteId),
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    writeBoardState(state)
    return { ok: true }
  })
}

// ---------------------------------------------------------------------------
// board-config.json
// ---------------------------------------------------------------------------
function deepMergeConfig(base: BoardConfig, override: Partial<BoardConfig>): BoardConfig {
  return {
    spareCarrier: override.spareCarrier ?? base.spareCarrier,
    superUsers: override.superUsers ?? base.superUsers,
    statusColors: {
      ...base.statusColors,
      ...(override.statusColors ?? {}),
    },
    extraUsers: override.extraUsers ?? base.extraUsers,
  }
}

export function getBoardConfig(): BoardConfig {
  const stored = getPersistence().getBoardConfigRaw()
  if (!stored) return { ...DEFAULT_BOARD_CONFIG }
  return deepMergeConfig(DEFAULT_BOARD_CONFIG, stored)
}

export function saveBoardConfig(partial: Partial<BoardConfig>): BoardConfig {
  const current = getBoardConfig()
  const updated = deepMergeConfig(current, partial)
  getPersistence().saveBoardConfigRaw(updated)
  return updated
}

// ---------------------------------------------------------------------------
// getMergedJobs
// ---------------------------------------------------------------------------
export function getMergedJobs(): BoardJob[] {
  const jobsFile = loadJobsFile()
  if (!jobsFile) return []

  const state = getBoardStateFile()
  const config = getBoardConfig()
  const newSet = new Set(jobsFile.newJobNumbers ?? [])
  const changedNoteSet = new Set(jobsFile.changedNoteJobNumbers ?? [])

  return jobsFile.jobs.map((job): BoardJob => {
    const jobState = state[job.jobNumber] ?? {
      status: 'none' as JobStatus,
      shipDateOverride: null,
      shipDateOverrideNote: null,
      binderPrinted: false,
      notes: [],
      updatedAt: '',
    }

    const effectiveShipDate = jobState.shipDateOverride ?? job.shipToCustomer ?? null
    const shipDateOverridden = jobState.shipDateOverride !== null
    const spare = isSpareJob(job, config)

    return {
      ...job,
      pm: canonicalPersonName(job.pm),
      materialsManager: canonicalPersonName(job.materialsManager),
      status: jobState.status,
      binderPrinted: spare ? false : (jobState.binderPrinted ?? false),
      notes: jobState.notes,
      effectiveShipDate,
      originalShipDate: job.shipToCustomer ?? null,
      shipDateOverridden,
      shipDateOverrideNote: jobState.shipDateOverrideNote ?? null,
      isNew: newSet.has(job.jobNumber),
      hasNewNote: changedNoteSet.has(job.jobNumber),
      blocked: jobState.blocked ?? false,
      blockedReason: jobState.blockedReason ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// Board tab routing (calendar → correct Projects tab)
// ---------------------------------------------------------------------------
export type BoardTab = 'project' | 'spare-parts' | 'archive' | 'blocked'

export function isSpareJob(job: Pick<Job, 'jobNumber' | 'pm'>, config: BoardConfig): boolean {
  const jn = job.jobNumber.toLowerCase()
  return samePerson(job.pm, config.spareCarrier) || jn.startsWith('sp-') || jn.startsWith('sp ')
}

export function getJobBoardTab(
  job: { jobNumber: string; pm: string; status: JobStatus; blocked?: boolean },
  config: BoardConfig,
): BoardTab {
  if (job.blocked) return 'blocked'
  if (job.status === 'shipped') return 'archive'
  if (isSpareJob(job, config)) return 'spare-parts'
  return 'project'
}

/** Human-readable PM label for calendar / UI (jobs store PM lowercased from import). */
export function formatJobPmLabel(pm: string): string {
  const t = pm.trim()
  if (!t) return 'No PM'
  if (t.includes('@')) {
    const local = t.split('@')[0] ?? t
    return local
      .replace(/[._-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ---------------------------------------------------------------------------
// getDerivedUsers
// ---------------------------------------------------------------------------
// Jon Shantry is a permanent user — always present regardless of config or import
const PERMANENT_SUPER = 'Jon Shantry'

export function getDerivedUsers(config: BoardConfig): BoardUser[] {
  const jobs = getMergedJobs()

  const makeId = (name: string): string =>
    'u_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  // Collect unique names per role from non-shipped jobs only.
  // Users whose only jobs are shipped have no active work and are hidden from the list.
  const pmNames = new Set<string>()
  const materialsNames = new Set<string>()

  for (const job of jobs) {
    if (job.status === 'shipped') continue
    if (job.pm?.trim()) pmNames.add(canonicalPersonName(job.pm.trim()))
    if (job.materialsManager?.trim()) {
      materialsNames.add(canonicalPersonName(job.materialsManager.trim()))
    }
  }

  const users: BoardUser[] = []

  // Permanent super user — always first, always present
  users.push({ id: makeId(PERMANENT_SUPER), name: PERMANENT_SUPER, role: 'super' })

  // Configured super users (skip blanks, duplicates, and the permanent entry)
  const seen = new Set<string>([PERMANENT_SUPER])
  for (const su of config.superUsers) {
    const name = canonicalPersonName(su.trim())
    if (!name || seen.has(name)) continue
    seen.add(name)
    users.push({ id: makeId(name), name, role: 'super' })
  }
  const rest: BoardUser[] = []

  for (const name of pmNames) {
    if (!seen.has(name)) {
      seen.add(name)
      rest.push({ id: makeId(name), name, role: 'pm' })
    }
  }

  for (const name of materialsNames) {
    if (!seen.has(name)) {
      seen.add(name)
      rest.push({ id: makeId(name), name, role: 'materials' })
    }
  }

  for (const name of config.extraUsers) {
    const trimmed = canonicalPersonName(name.trim())
    if (!trimmed) continue
    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      rest.push({ id: makeId(trimmed), name: trimmed, role: 'manual' })
    }
  }

  // Sort rest alphabetically by name
  rest.sort((a, b) => a.name.localeCompare(b.name))

  return [...users, ...rest]
}
