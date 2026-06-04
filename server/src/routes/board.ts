import { Router, Request, Response } from 'express'
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
  addNote,
  updateNote,
  deleteNote,
} from '../services/boardService.js'
import { STATUS_ORDER } from '@vrsi/wallboard-shared'
import type { Job, JobStatus, Actor } from '@vrsi/wallboard-shared'
import { logger } from '../utils/logger.js'
import { requireAdminToken } from '../middleware/adminAuth.js'

export const boardRouter = Router()
boardRouter.use(requireAdminToken)

// ---------------------------------------------------------------------------
// Presence store — in-memory, ephemeral (survives only while server is up)
// jobNumber → Map<userId, { userName, expiresAt }>
// ---------------------------------------------------------------------------
interface PresenceEntry { userName: string; expiresAt: number }
const presenceStore = new Map<string, Map<string, PresenceEntry>>()

function cleanPresence() {
  const now = Date.now()
  for (const [job, editors] of presenceStore.entries()) {
    for (const [uid, entry] of editors.entries()) {
      if (entry.expiresAt <= now) editors.delete(uid)
    }
    if (editors.size === 0) presenceStore.delete(job)
  }
}

boardRouter.get('/presence', (_req: Request, res: Response) => {
  cleanPresence()
  const result: Record<string, { userId: string; userName: string }[]> = {}
  for (const [job, editors] of presenceStore.entries()) {
    result[job] = Array.from(editors.entries()).map(([userId, { userName }]) => ({ userId, userName }))
  }
  res.json(result)
})

boardRouter.post('/presence/:jobNumber', (req: Request, res: Response) => {
  const { userId, userName } = req.body as { userId?: string; userName?: string }
  if (!userId || !userName) { res.status(400).json({ error: 'userId and userName required' }); return }
  const job = req.params.jobNumber
  if (!presenceStore.has(job)) presenceStore.set(job, new Map())
  presenceStore.get(job)!.set(userId, { userName, expiresAt: Date.now() + 30000 })
  res.json({ ok: true })
})

boardRouter.delete('/presence/:jobNumber', (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string }
  if (userId) {
    const editors = presenceStore.get(req.params.jobNumber)
    editors?.delete(userId)
    if (editors?.size === 0) presenceStore.delete(req.params.jobNumber)
  }
  res.json({ ok: true })
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
boardRouter.post('/import', upload.single('file'), async (req: Request, res: Response) => {
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
      const { jobs: validated, errors: jsonErrors, importedStatuses } = validateJobsArray(req.body.jobs)
      jobs = validated
      rowErrors = jsonErrors
      skipped = jsonErrors.length
      // Only hard-reject if there are NO valid rows at all
      if (jobs.length === 0 && jsonErrors.length > 0) {
        res.status(400).json({ error: 'No valid jobs in import', rowErrors: jsonErrors })
        return
      }
      sourceFile = 'manual-import'
      applyResult = await applyBoardImport(jobs, sourceFile, importedStatuses, {})
    } else {
      res.status(400).json({ error: 'No file or jobs array provided' })
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
    })
  } catch (err: unknown) {
    logger.error('Board import failed', { error: (err as Error).message })
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// GET /jobs
// ---------------------------------------------------------------------------
boardRouter.get('/jobs', async (_req: Request, res: Response) => {
  try {
    const jobs = getMergedJobs()
    res.json(jobs)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// GET /config
// ---------------------------------------------------------------------------
boardRouter.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = getBoardConfig()
    res.json(config)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// POST /config
// ---------------------------------------------------------------------------
boardRouter.post('/config', async (req: Request, res: Response) => {
  try {
    const updated = saveBoardConfig(req.body)
    res.json(updated)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// GET /users
// ---------------------------------------------------------------------------
boardRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const cfg = getBoardConfig()
    const users = getDerivedUsers(cfg)
    res.json(users)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/status
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/status', async (req: Request, res: Response) => {
  try {
    const { status, actor } = req.body as { status: string; actor?: Actor }

    if (!STATUS_ORDER.includes(status as never)) {
      res.status(400).json({ error: 'Invalid status' })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    await setJobStatus(req.params.jobNumber, status as (typeof STATUS_ORDER)[number], actor)

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json(job)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/ship-date
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/ship-date', async (req: Request, res: Response) => {
  try {
    const { shipDateOverride, shipDateOverrideNote, actor } = req.body as {
      shipDateOverride?: string | null
      shipDateOverrideNote?: string | null
      actor?: Actor
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    await setShipDateOverride(
      req.params.jobNumber,
      shipDateOverride ?? null,
      actor,
      shipDateOverrideNote,
    )

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json(job)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/binder-printed
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/binder-printed', async (req: Request, res: Response) => {
  try {
    const { binderPrinted, actor } = req.body as { binderPrinted?: boolean; actor?: Actor }

    if (typeof binderPrinted !== 'boolean') {
      res.status(400).json({ error: 'binderPrinted (boolean) required' })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    await setJobBinderPrinted(req.params.jobNumber, binderPrinted, actor)

    const job = getMergedJobs().find((j) => j.jobNumber === req.params.jobNumber)
    res.json(job)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// POST /jobs/:jobNumber/notes
// ---------------------------------------------------------------------------
boardRouter.post('/jobs/:jobNumber/notes', async (req: Request, res: Response) => {
  try {
    const { text, actor } = req.body as { text?: string; actor?: Actor }

    if (!text || !actor) {
      res.status(400).json({ error: 'text and actor required' })
      return
    }

    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    const note = await addNote(req.params.jobNumber, text, actor)
    res.status(201).json(note)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// PATCH /jobs/:jobNumber/notes/:noteId — author only
// ---------------------------------------------------------------------------
boardRouter.patch('/jobs/:jobNumber/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const { text, actor } = req.body as { text?: string; actor?: Actor }
    if (!text || !actor) {
      res.status(400).json({ error: 'text and actor required' })
      return
    }
    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    const result = await updateNote(req.params.jobNumber, req.params.noteId, text, actor)
    if (!result.ok) {
      res.status(403).json({ error: result.error })
      return
    }
    res.json(result.note)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// DELETE /jobs/:jobNumber/notes/:noteId — author only
// ---------------------------------------------------------------------------
boardRouter.delete('/jobs/:jobNumber/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const { actor } = req.body as { actor?: Actor }
    if (!actor) {
      res.status(400).json({ error: 'actor required' })
      return
    }
    if (!getMergedJobs().some((j) => j.jobNumber === req.params.jobNumber)) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    const result = await deleteNote(req.params.jobNumber, req.params.noteId, actor)
    if (!result.ok) {
      res.status(403).json({ error: result.error })
      return
    }
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})
