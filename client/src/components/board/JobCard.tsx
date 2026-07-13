import { useState, useEffect, useRef } from 'react'
import { BoardJob, BoardUser, BoardConfig, JobStatus } from '@vrsi/wallboard-shared'
import StatusCheckboxes from './StatusCheckboxes'
import BinderPrintedCheckbox from './BinderPrintedCheckbox'
import ShipDateEditor from './ShipDateEditor'
import NotesSection from './NotesSection'
import { statusLabel, isSpareJob, customerBubbleColor } from './boardColors'
import {
  useSetJobStatus,
  useSetJobShipDate,
  useSetJobBinderPrinted,
  useSetJobBlocked,
  useAddJobNote,
  useUpdateJobNote,
  useDeleteJobNote,
  usePresence,
} from '../../hooks/useBoard'
import { claimPresence, releasePresence } from '../../api/boardApi'
import { useAppStore } from '../../store/appStore'

interface Props {
  job: BoardJob
  activeUser: BoardUser | null
  config: BoardConfig
  onSelectProjectManager?: (name: string) => void
  onSelectMaterialsManager?: (name: string) => void
}

function formatShipDate(dateStr: string | null): string {
  if (!dateStr) return 'No date'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function overrideFromPending(pendingDate: string | null, original: string | null): string | null {
  if (!pendingDate || pendingDate === original) return null
  return pendingDate
}

function savedOverride(job: BoardJob): string | null {
  return job.shipDateOverridden ? job.effectiveShipDate : null
}

// ---------------------------------------------------------------------------
// Per-job draft persistence. Pending edits used to live ONLY in React state,
// so a failed save followed by any reload (nightly 3 AM reload, error-boundary
// reload, kiosk/server restart) silently destroyed what the user typed. Drafts
// are written to localStorage while a card is dirty and restored on mount.
// ---------------------------------------------------------------------------
interface JobDraft {
  status: JobStatus
  binderPrinted: boolean
  shipDate: string | null
  overrideNote: string
  noteDraft: string
  savedAt: number
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const draftKey = (jobNumber: string) => `vrsi.jobDraft.${jobNumber}`

function loadDraft(jobNumber: string): JobDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(jobNumber))
    if (!raw) return null
    const draft = JSON.parse(raw) as JobDraft
    if (typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(jobNumber))
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function JobCard({
  job,
  activeUser,
  config,
  onSelectProjectManager,
  onSelectMaterialsManager,
}: Props) {
  const [notesOpen, setNotesOpen] = useState(job.notes.length > 0)

  // Restore any surviving draft (failed save / reload / restart) on mount.
  const [initialDraft] = useState(() => loadDraft(job.jobNumber))
  const [pendingStatus, setPendingStatus] = useState<JobStatus>(initialDraft?.status ?? job.status)
  const [pendingBinderPrinted, setPendingBinderPrinted] = useState<boolean>(
    initialDraft?.binderPrinted ?? job.binderPrinted,
  )
  const [pendingShipDate, setPendingShipDate] = useState<string | null>(
    initialDraft !== null ? initialDraft.shipDate : job.effectiveShipDate,
  )
  const [pendingOverrideNote, setPendingOverrideNote] = useState<string>(
    initialDraft?.overrideNote ?? job.shipDateOverrideNote ?? '',
  )
  const [noteDraft, setNoteDraft] = useState(initialDraft?.noteDraft ?? '')
  // Visible save failure — a failed Apply must never be silent.
  const [saveError, setSaveError] = useState<string | null>(null)
  const setJobDirty = useAppStore((s) => s.setJobDirty)

  // Sync pending state when the SERVER value changes (another user's edit, a
  // fresh import). Skipped on mount so a restored draft is not clobbered by
  // the first render's values.
  const isFirstRender = useRef(true)
  useEffect(() => { setNotesOpen(job.notes.length > 0) }, [job.notes.length])
  useEffect(() => { if (!isFirstRender.current) setPendingStatus(job.status) }, [job.status])
  useEffect(() => { if (!isFirstRender.current) setPendingBinderPrinted(job.binderPrinted) }, [job.binderPrinted])
  useEffect(() => { if (!isFirstRender.current) setPendingShipDate(job.effectiveShipDate) }, [job.effectiveShipDate])
  useEffect(() => { if (!isFirstRender.current) setPendingOverrideNote(job.shipDateOverrideNote ?? '') }, [job.shipDateOverrideNote])
  useEffect(() => { isFirstRender.current = false }, [])

  const setJobStatus = useSetJobStatus()
  const setJobShipDate = useSetJobShipDate()
  const setJobBinderPrinted = useSetJobBinderPrinted()
  const setJobBlocked = useSetJobBlocked()
  const addJobNote = useAddJobNote()

  // Block control — manual triage, independent of the Apply flow
  const [showBlockInput, setShowBlockInput] = useState(false)
  const [blockReasonInput, setBlockReasonInput] = useState(job.blockedReason ?? '')
  useEffect(() => {
    if (!showBlockInput) setBlockReasonInput(job.blockedReason ?? '')
  }, [job.blockedReason, showBlockInput])

  const handleBlock = () => {
    if (!activeUser) return
    setSaveError(null)
    setJobBlocked.mutate(
      {
        jobNumber: job.jobNumber,
        blocked: true,
        reason: blockReasonInput.trim() || null,
        actor: activeUser,
      },
      {
        // Close the input only when the block actually saved — on failure the
        // typed reason stays in the box and the error is shown.
        onSuccess: () => setShowBlockInput(false),
        onError: (e) => setSaveError(e.message),
      },
    )
  }
  const handleUnblock = () => {
    if (!activeUser) return
    setSaveError(null)
    setJobBlocked.mutate(
      { jobNumber: job.jobNumber, blocked: false, reason: null, actor: activeUser },
      { onError: (e) => setSaveError(e.message) },
    )
  }
  const updateJobNote = useUpdateJobNote()
  const deleteJobNote = useDeleteJobNote()
  const [noteActionError, setNoteActionError] = useState<string | null>(null)

  const spareJob = isSpareJob(job, config)
  const pendingOverride = overrideFromPending(pendingShipDate, job.originalShipDate)
  const currentOverride = savedOverride(job)

  const statusDirty = pendingStatus !== job.status
  const binderDirty = !spareJob && pendingBinderPrinted !== job.binderPrinted
  const dateDirty = pendingOverride !== currentOverride
  const noteDirty = (pendingOverrideNote.trim() || null) !== (job.shipDateOverrideNote?.trim() || null)
  const noteDraftDirty = noteDraft.trim().length > 0
  const isDirty = statusDirty || binderDirty || dateDirty || noteDirty || noteDraftDirty
  const isSaving =
    setJobStatus.isPending || setJobShipDate.isPending || setJobBinderPrinted.isPending ||
    addJobNote.isPending

  // Report un-applied edits globally so navigation can warn before they are lost
  useEffect(() => {
    setJobDirty(job.jobNumber, isDirty)
    return () => setJobDirty(job.jobNumber, false)
  }, [isDirty, job.jobNumber, setJobDirty])

  // Persist the draft while dirty; clear it once the card matches the server
  // again (successful Apply or Cancel). Survives reloads and restarts.
  useEffect(() => {
    try {
      if (!isDirty) {
        localStorage.removeItem(draftKey(job.jobNumber))
        return
      }
      const draft: JobDraft = {
        status: pendingStatus,
        binderPrinted: pendingBinderPrinted,
        shipDate: pendingShipDate,
        overrideNote: pendingOverrideNote,
        noteDraft,
        savedAt: Date.now(),
      }
      localStorage.setItem(draftKey(job.jobNumber), JSON.stringify(draft))
    } catch { /* localStorage full/unavailable — drafts are best-effort */ }
  }, [isDirty, pendingStatus, pendingBinderPrinted, pendingShipDate, pendingOverrideNote, noteDraft, job.jobNumber])

  const pendingDateOverridden =
    pendingOverride !== null || (dateDirty && pendingShipDate !== job.originalShipDate)

  const presenceMap = usePresence()
  const userId = activeUser?.id
  const userName = activeUser?.name
  useEffect(() => {
    if (!isDirty || !userId || !userName) return
    claimPresence(job.jobNumber, userId, userName)
    const interval = setInterval(() => claimPresence(job.jobNumber, userId, userName), 15000)
    return () => {
      clearInterval(interval)
      releasePresence(job.jobNumber, userId)
    }
  }, [isDirty, userId, userName, job.jobNumber])

  const otherEditors = (presenceMap[job.jobNumber] ?? []).filter(e => e.userId !== userId)

  const handleApply = () => {
    if (!activeUser) return
    // A failed save must be VISIBLE and must not discard the pending edits —
    // they stay on the card (and in the localStorage draft) for a retry.
    setSaveError(null)
    const onError = (e: Error) => setSaveError(e.message)
    if (statusDirty) {
      setJobStatus.mutate(
        { jobNumber: job.jobNumber, status: pendingStatus, actor: activeUser },
        { onError },
      )
    }
    if (binderDirty) {
      setJobBinderPrinted.mutate(
        {
          jobNumber: job.jobNumber,
          binderPrinted: pendingBinderPrinted,
          actor: activeUser,
        },
        { onError },
      )
    }
    if (dateDirty || noteDirty) {
      setJobShipDate.mutate(
        {
          jobNumber: job.jobNumber,
          shipDateOverride: pendingOverride,
          shipDateOverrideNote: pendingOverride ? (pendingOverrideNote.trim() || null) : null,
          actor: activeUser,
        },
        { onError },
      )
    }
    // A typed-but-unsent note counts as a pending change: Apply saves it too,
    // so one click commits everything on the card at once. The draft text is
    // cleared only AFTER the server confirms the note was stored.
    if (noteDraftDirty) {
      addJobNote.mutate(
        { jobNumber: job.jobNumber, text: noteDraft.trim(), actor: activeUser },
        { onSuccess: () => setNoteDraft(''), onError },
      )
    }
    if (userId) releasePresence(job.jobNumber, userId)
  }

  const handleCancel = () => {
    setPendingStatus(job.status)
    setPendingBinderPrinted(job.binderPrinted)
    setPendingShipDate(job.effectiveShipDate)
    setPendingOverrideNote(job.shipDateOverrideNote ?? '')
    setNoteDraft('')
    if (userId) releasePresence(job.jobNumber, userId)
  }

  const handleAddNote = (text: string) => {
    if (!activeUser) return
    setNoteActionError(null)
    addJobNote.mutate(
      { jobNumber: job.jobNumber, text, actor: activeUser },
      {
        // Clear the typed draft only once the note is confirmed stored.
        onSuccess: () => setNoteDraft(''),
        onError: (e) => setNoteActionError(e.message),
      },
    )
  }

  const handleEditNote = (noteId: string, text: string) => {
    if (!activeUser) return
    setNoteActionError(null)
    updateJobNote.mutate(
      { jobNumber: job.jobNumber, noteId, text, actor: activeUser },
      { onError: (e) => setNoteActionError(e.message) },
    )
  }

  const handleDeleteNote = (noteId: string) => {
    if (!activeUser) return
    setNoteActionError(null)
    deleteJobNote.mutate(
      { jobNumber: job.jobNumber, noteId, actor: activeUser },
      { onError: (e) => setNoteActionError(e.message) },
    )
  }

  const statusColor = config.statusColors[pendingStatus]
  const customerColor = customerBubbleColor(job.customer || job.jobNumber)

  return (
    <div
      id={`job-card-${job.jobNumber}`}
      className="rounded-xl border border-slate-700/50 p-4 mb-3 border-l-4 scroll-mt-3 md:scroll-mt-24"
      style={{ borderLeftColor: statusColor, backgroundColor: `${statusColor}18` }}
    >
      {/* Line 1: job number + customer bubble | original ship date */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-slate-100 text-lg font-bold shrink-0">{job.jobNumber}</span>
          {job.isNew && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
              New
            </span>
          )}
          {job.hasNewNote && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              New note
            </span>
          )}
          {job.customer.trim() && (
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-white truncate max-w-[200px] sm:max-w-xs"
              style={{ backgroundColor: customerColor }}
              title={job.customer}
            >
              {job.customer}
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-slate-500 text-[10px] uppercase tracking-wide">Original</div>
          <div className="text-slate-300 text-sm">{formatShipDate(job.originalShipDate)}</div>
        </div>
      </div>

      {/* Job description under the number for quick card scanning. */}
      {job.description?.trim() && (
        <div className="mt-1 text-sm text-slate-300 break-words">
          {job.description}
        </div>
      )}

      {/* Line 2: Materials Manager + Project Manager (compact, side by side) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {job.materialsManager.trim() && (
          <span className="text-slate-500">
            Materials Manager:{' '}
            {onSelectMaterialsManager ? (
              <button
                type="button"
                onClick={() => onSelectMaterialsManager(job.materialsManager)}
                className="text-slate-300 hover:text-white hover:underline"
                title="Add to Materials Manager filter"
              >
                {job.materialsManager}
              </button>
            ) : (
              <span className="text-slate-300">{job.materialsManager}</span>
            )}
          </span>
        )}
        {job.pm.trim() && (
          <span className="text-slate-500">
            Project Manager:{' '}
            {onSelectProjectManager ? (
              <button
                type="button"
                onClick={() => onSelectProjectManager(job.pm)}
                className="text-slate-300 hover:text-white hover:underline"
                title="Add to Project Manager filter"
              >
                {job.pm}
              </button>
            ) : (
              <span className="text-slate-300">{job.pm}</span>
            )}
          </span>
        )}
      </div>

      {/* Line 3: binder (project only) + status checkboxes */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        {!spareJob && (
          <BinderPrintedCheckbox
            jobNumber={job.jobNumber}
            checked={pendingBinderPrinted}
            disabled={!activeUser}
            onChange={setPendingBinderPrinted}
          />
        )}
        <StatusCheckboxes
          jobNumber={job.jobNumber}
          status={pendingStatus}
          disabled={!activeUser}
          onStatusChange={setPendingStatus}
          statusColors={config.statusColors}
        />
        <span
          className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            color: statusColor,
            backgroundColor: `${statusColor}22`,
            border: `1px solid ${statusColor}55`,
          }}
        >
          {statusLabel(pendingStatus)}
        </span>
      </div>

      {/* Block control — manual triage; a blocked job moves to the Blocked tab */}
      <div className="mt-3">
        {job.blocked ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
            <span className="text-red-400 text-xs font-semibold uppercase tracking-wide shrink-0">⛔ Blocked</span>
            {job.blockedReason && (
              <span className="text-red-200/90 text-xs min-w-0 break-words">— {job.blockedReason}</span>
            )}
            <button
              type="button"
              onClick={handleUnblock}
              disabled={!activeUser || setJobBlocked.isPending}
              className="ml-auto rounded-md border border-red-500/50 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Unblock
            </button>
          </div>
        ) : showBlockInput ? (
          <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <input
              type="text"
              value={blockReasonInput}
              onChange={(e) => setBlockReasonInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleBlock() }}
              placeholder="Why is this blocked? (e.g. waiting on parts, sitting in shipping)"
              maxLength={1000}
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowBlockInput(false); setBlockReasonInput(job.blockedReason ?? '') }}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBlock}
                disabled={!activeUser || setJobBlocked.isPending}
                className="rounded-md border border-red-500/50 bg-red-600/80 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Block
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowBlockInput(true)}
            disabled={!activeUser}
            title="Block this job — moves it to the Blocked tab with a reason"
            className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 hover:border-red-500/70 transition-colors disabled:opacity-40"
          >
            ⛔ Block
          </button>
        )}
      </div>

      {/* Line 4: ship date editor (modified) */}
      <div className="mt-3">
        <ShipDateEditor
          jobNumber={job.jobNumber}
          originalShipDate={job.originalShipDate}
          effectiveShipDate={pendingShipDate}
          shipDateOverridden={job.shipDateOverridden || pendingDateOverridden}
          overrideNote={pendingOverrideNote}
          disabled={!activeUser}
          onDateChange={setPendingShipDate}
          onNoteChange={setPendingOverrideNote}
        />
      </div>

      {/* Line 5: notes */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          {notesOpen ? '▾' : '▸'} Notes ({job.notes.length})
        </button>
        {!activeUser && (
          <span className="text-slate-600 text-xs">&larr; Select a user to edit</span>
        )}
      </div>

      {notesOpen && (
        <div className="mt-3">
          <NotesSection
            notes={job.notes}
            activeUser={activeUser}
            highlightNewNote={job.hasNewNote}
            draft={noteDraft}
            onDraftChange={setNoteDraft}
            onAddNote={handleAddNote}
            onEditNote={handleEditNote}
            onDeleteNote={handleDeleteNote}
            isSubmitting={
              addJobNote.isPending || updateJobNote.isPending || deleteJobNote.isPending
            }
            actionError={noteActionError}
          />
        </div>
      )}

      {otherEditors.length > 0 && (
        <div className="mt-2 px-2 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded-lg text-amber-400 text-xs">
          {otherEditors.map(e => e.userName).join(' & ')} {otherEditors.length === 1 ? 'is' : 'are'} editing this job
        </div>
      )}

      {saveError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2">
          <span className="text-red-400 text-xs font-semibold uppercase tracking-wide shrink-0">Save failed</span>
          <span className="text-red-200/90 text-xs min-w-0 break-words">
            {saveError} Your edits are still on this card — press Apply to retry.
          </span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="ml-auto text-red-300 hover:text-red-100 text-xs shrink-0"
            aria-label="Dismiss save error"
          >
            ✕
          </button>
        </div>
      )}

      {isDirty && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-700/50 pt-3">
          <span className="mr-auto text-xs text-amber-400">
            ⚠ Unsaved changes — they will be lost unless you Apply
          </span>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isSaving || !activeUser}
            className="px-4 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Applying…' : 'Apply all'}
          </button>
        </div>
      )}
    </div>
  )
}
