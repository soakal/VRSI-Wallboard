import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import {
  parseXlsm,
  applyBoardImport,
  mapSpreadsheetStatusToJobStatus,
  isCancelledSpreadsheetStatus,
  getMergedJobs,
  getBoardConfig,
  saveBoardConfig,
  getDerivedUsers,
  setJobStatus,
  setShipDateOverride,
  setJobBinderPrinted,
  setJobBlocked,
  addNote,
  updateNote,
  deleteNote,
  formatJobPmLabel,
} from '../services/boardService.js'
import { buildIcs } from '../utils/icsGenerator.js'
import { STATUS_ORDER } from '@vrsi/wallboard-shared'
import type { Job, JobStatus, Actor } from '@vrsi/wallboard-shared'
import { logger } from '../utils/logger.js'
import { requireAdminToken } from '../middleware/adminAuth.js'

export const boardRouter = Router()

// ---------------------------------------------------------------------------
// GET /export/ship-dates.ics  — public, no admin token needed
// Ship dates are already visible on the wallboard display; this is a
// read-only download so a plain browser <a href> can trigger it without
// custom auth headers.
// ---------------------------------------------------------------------------
boardRouter.get('/export/ship-dates.ics', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = getMergedJobs()
    const events = jobs
      // Only YYYY-MM-DD dates produce valid all-day events. A ship-date override
      // is stored unvalidated, so guard against empty/malformed strings here —
      // otherwise one bad date would make new Date(...).toISOString() throw and
      // fail the entire export.
      .filter(
        j =>
          j.status !== 'shipped' &&
          typeof j.effectiveShipDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(j.effectiveShipDate),
      )
      .map(j => {
        const dateStr = j.effectiveShipDate as string
        const dtstart = dateStr.replace(/-/g, '')
        const d = new Date(`${dateStr}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() + 1)
        const dtend = d.toISOString().slice(0, 10).replace(/-/g, '')
        const customer = typeof j.customer === 'string' ? j.customer.trim() : ''
        const pmLabel = formatJobPmLabel(typeof j.pm === 'string' ? j.pm : String(j.pm ?? ''))
        const subjectParts = [`#${j.jobNumber}`]
        if (customer) subjectParts.push(customer)
        subjectParts.push(pmLabel)
        return {
          uid: `${j.jobNumber}@vrsi-wallboard`,
          dtstart,
          dtend,
          summary: subjectParts.join(' · '),
          description: `Status: ${j.status}`,
        }
      })
    const ics = buildIcs(events)
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="vrsi-ship-dates.ics"')
    res.send(ics)
  } catch (err: unknown) {
    next(err)
  }
})

boardRouter.use(requireAdminToken)

// ---------------------------------------------------------------------------
// Presence store — in-memory, ephemeral (survives only while server is up)
// jobNumber → Map<userId, { userName, expiresAt }>
// ---------------------------------------------------------------------------
interface PresenceEntry { userName: string; expiresAt: number }
const presenceStore = new Map<string, Map<string, PresenceEntry>>()
const PRESENCE_MAX_LEN = 128

function cleanPresence() {
  const now = Date.now()
  for (const [job, editors] of presenceStore.entries()) {
    for (const [uid, entry] of editors.entries()) {
      if (entry.expiresAt <= now) editors.delete(uid)
    }
    if (editors.size === 0) presenceStore.delete(job)
  }
}

// Prune stale presence entries every 60 seconds so the map never grows unbounded.
setInterval(cleanPresence, 60_000).unref()

boardRouter.get('/presence', (_req: Request, res: Response) => {
  cleanPresence()
  const result: Record<string, { userId: string; userName: string }[]> = {}
  for (const [job, editors] of presenceStore.entries()) {
    result[job] = Array.from(editors.entries()).map(([userId, { userName }]) => ({ userId, userName }))
  }
  res.json({ data: result })
})

boardRouter.post('/presence/:jobNumber', (req: Request, res: Response) => {
  const { userId, userName } = req.body as { userId?: string; userName?: string }
  if (!userId || !userName) {
    res.status(400).json({ error: { code: 'missing_fields', message: 'userId and userName required' } })
    return
  }
  if (userId.length > PRESENCE_MAX_LEN || userName.length > PRESENCE_MAX_LEN) {
    res.status(400).json({ error: { code: 'field_too_long', message: 'userId and userName must be 128 characters or fewer' } })
    return
  }
  const job = req.params.jobNumber.slice(0, 64)
  if (!presenceStore.has(job)) presenceStore.set(job, new Map())
  presenceStore.get(job)!.set(userId, { userName, expiresAt: Date.now() + 30000 })
  res.json({ data: { ok: true } })
})

boardRouter.delete('/presence/:jobNumber', (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string }
  if (userId) {
    const editors = presenceStore.get(req.params.jobNumber)
    editors?.delete(userId)
    if (editors?.size === 0) presenceStore.delete(req.params.jobNumber)
  }
  res.json({ data: { ok: true } })
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
})

// ---------------------------------------------------------------------------
// Validate a client-supplied jobs array (the no-file /import path has no auth,
// so any LAN client can POST arbitrary objects). Coerce known fields to safe
// shapes and reject rows missing a usable jobNumber.
// ---------------------------------------------------------------------------
const MAX_IMPORT_ROWS = 10_000

function validateJobsArray(raw: unknown[]): {
  jobs: Job[]
  errors: string[]
  importedStatuses: Record<string, JobStatus>
} {
  const jobs: Job[] = []
  const errors: string[] = []
  const importedStatuses: Record<string, JobStatus> = {}

  const toStr = (v: unknown): string =>
    typeof v === 'string' ? v : v == null ? '' : String(v)
  const toDateOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v : null

  raw.forEach((item, i) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`Row ${i}: not an object`)
      return
    }
    const o = item as Record<string, unknown>
    const jobNumber = toStr(o.jobNumber).trim()
    if (!jobNumber) {
      errors.push(`Row ${i}: missing jobNumber`)
      return
    }
    if (isCancelledSpreadsheetStatus(toStr(o.status))) {
      return
    }
    const mapped = mapSpreadsheetStatusToJobStatus(toStr(o.status))
    if (mapped) importedStatuses[jobNumber] = mapped
    jobs.push({
      jobNumber,
      pm: toStr(o.pm),
      customer: toStr(o.customer),
      materialsManager: toStr(o.materialsManager),
      pabsComplete: toDateOrNull(o.pabsComplete),
      shipToPm: toDateOrNull(o.shipToPm),
      shipToCustomer: toDateOrNull(o.shipToCustomer),
    })
  })

  return { jobs, errors, importedStatuses }
}

// ---------------------------------------------------------------------------
// POST /import
// ---------------------------------------------------------------------------
boardRouter.post('/import', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let jobs: Job[]
    let sourceFile: string
    let warnings: string[] = []
    let rowErrors: string[] = []
    let skipped = 0

    let applyResult = {
      shippedApplied: 0,
      readyToShipApplied: 0,
      inProgressApplied: 0,
      notesImported: 0,
      binderPrintedApplied: 0,
    }

    if (req.file) {
      const result = parseXlsm(req.file.buffer, req.file.originalname)
      jobs = result.jobs
      warnings = result.warnings
      rowErrors = result.rowErrors
      skipped = result.skipped
      sourceFile = req.file.originalname
      applyResult = await applyBoardImport(
        jobs,
        sourceFile,
        result.importedStatuses,
        result.importedNotes,
        result.importedBinderPrinted,
      )
    } else if (Array.isArray(req.body.jobs)) {
      if (req.body.jobs.length > MAX_IMPORT_ROWS) {
        res.status(400).json({ error: { code: 'too_many_rows', message: `Import limited to ${MAX_IMPORT_ROWS} rows` } })
        return
      }
      const { jobs: validated, errors: jsonErrors, importedStatuses } = validateJobsArray(req.body.jobs)
      jobs = validated
      rowErrors = jsonErrors
      skipped = jsonErrors.length
      if (jobs.length === 0 && jsonErrors.length > 0) {
        res.status(400).json({ error: { code: 'no_valid_jobs', message: 'No valid jobs in import' }, rowErrors: jsonErrors })
        return
      }
      sourceFile = 'manual-import'
      applyResult = await applyBoardImport(jobs, sourceFile, importedStatuses, {})
    } else {
      res.status(400).json({ error: { code: 'missing_input', message: 'No file or jobs array provided' } })
      return
    }

    const {
      shippedApplied,
      readyToShipApplied,
      inProgressApplied,
      notesImported,
      binderPrintedApplied,
    } = applyResult
    logger.info('Board import complete', {
      sourceFile,
      imported: jobs.length,
      shippedApplied,
      readyToShipApplied,
      inProgressApplied,
      notesImported,
      binderPrintedApplied,
      skipped,
      warnings: warnings.length,
      rowErrors: rowErrors.length,
    })
    const MAX_ROW_ERRORS = 50
    const rowErrorsOut =
      rowErrors.length > MAX_ROW_ERRORS
        ? [
            ...rowErrors.slice(0, MAX_ROW_ERRORS),
            `…and ${rowErrors.length - MAX_ROW_ERRORS} more row error(s)`,
          ]
        : rowErrors

    res.json({
      data: {
        imported: jobs.length,
        shippedApplied,
        readyToShipApplied,
        inProgressApplied,
        notesImported,
        binderPrintedApplied,
        skipped,
        warnings,
        rowErrors: rowErrorsOut,
        rowErrorsTotal: rowErrors.length,
      },
    })
  } catch (err: unknown) {
    logger.error('Board import failed', { error: (err as Error).message })
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /jobs
// ---------------------------------------------------------------------------
boardRouter.get('/jobs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = getMergedJobs()
    res.json({ data: jobs })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /config
// ---------------------------------------------------------------------------
boardRouter.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getBoardConfig()
    res.json({ data: config })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// POST /config
// ---------------------------------------------------------------------------
boardRouter.post('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = saveBoardConfig(req.body)
    res.json({ data: updated })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /users
// ---------------------------------------------------------------------------
boardRouter.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = getBoardConfig()
    const users = getDerivedUsers(cfg)
    res.json({ data: users })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/status
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, actor } = req.body as { status: string; actor?: Actor }

    if (!(STATUS_ORDER as readonly string[]).includes(status)) {
      res.status(400).json({ error: { code: 'invalid_status', message: 'Invalid status' } })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }

    await setJobStatus(req.params.jobNumber, status as (typeof STATUS_ORDER)[number], actor)

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json({ data: job })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/ship-date
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/ship-date', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipDateOverride, shipDateOverrideNote, actor } = req.body as {
      shipDateOverride?: string | null
      shipDateOverrideNote?: string | null
      actor?: Actor
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }

    await setShipDateOverride(
      req.params.jobNumber,
      shipDateOverride ?? null,
      actor,
      shipDateOverrideNote,
    )

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json({ data: job })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/binder-printed
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/binder-printed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { binderPrinted, actor } = req.body as { binderPrinted?: boolean; actor?: Actor }

    if (typeof binderPrinted !== 'boolean') {
      res.status(400).json({ error: { code: 'missing_fields', message: 'binderPrinted (boolean) required' } })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }

    await setJobBinderPrinted(req.params.jobNumber, binderPrinted, actor)

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json({ data: job })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/blocked — manual triage flag (never touched by import)
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/blocked', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { blocked, reason, actor } = req.body as { blocked?: boolean; reason?: string | null; actor?: Actor }

    if (typeof blocked !== 'boolean') {
      res.status(400).json({ error: { code: 'missing_fields', message: 'blocked (boolean) required' } })
      return
    }
    if (reason != null && typeof reason === 'string' && reason.length > 1000) {
      res.status(400).json({ error: { code: 'reason_too_long', message: 'Block reason exceeds maximum length of 1000 characters' } })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }

    await setJobBlocked(req.params.jobNumber, blocked, reason ?? null, actor)

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json({ data: job })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// POST /jobs/:jobNumber/notes
// ---------------------------------------------------------------------------
boardRouter.post('/jobs/:jobNumber/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, actor } = req.body as { text?: string; actor?: Actor }

    if (!text || !actor) {
      res.status(400).json({ error: { code: 'missing_fields', message: 'text and actor required' } })
      return
    }
    if (text.length > 5000) {
      res.status(400).json({ error: { code: 'note_too_long', message: 'Note text exceeds maximum length of 5000 characters' } })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }

    const note = await addNote(req.params.jobNumber, text, actor)
    res.status(201).json({ data: note })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/notes/:noteId — author only
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/notes/:noteId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, actor } = req.body as { text?: string; actor?: Actor }
    if (!text || !actor) {
      res.status(400).json({ error: { code: 'missing_fields', message: 'text and actor required' } })
      return
    }
    if (text.length > 5000) {
      res.status(400).json({ error: { code: 'note_too_long', message: 'Note text exceeds maximum length of 5000 characters' } })
      return
    }
    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }
    const result = await updateNote(req.params.jobNumber, req.params.noteId, text, actor)
    if (!result.ok) {
      res.status(403).json({ error: { code: 'forbidden', message: result.error ?? 'Forbidden' } })
      return
    }
    res.json({ data: result.note })
  } catch (err: unknown) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// DELETE /jobs/:jobNumber/notes/:noteId — author only
// ---------------------------------------------------------------------------
boardRouter.delete('/jobs/:jobNumber/notes/:noteId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actor } = req.body as { actor?: Actor }
    if (!actor) {
      res.status(400).json({ error: { code: 'missing_fields', message: 'actor required' } })
      return
    }
    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } })
      return
    }
    const result = await deleteNote(req.params.jobNumber, req.params.noteId, actor)
    if (!result.ok) {
      res.status(403).json({ error: { code: 'forbidden', message: result.error ?? 'Forbidden' } })
      return
    }
    res.json({ data: { ok: true } })
  } catch (err: unknown) {
    next(err)
  }
})
