import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { JobNote, BoardUser, OPS_SCHEDULE_NOTE_AUTHOR_ID } from '@vrsi/wallboard-shared'

interface Props {
  notes: JobNote[]
  activeUser: BoardUser | null
  /** True when the latest import added/changed the Ops Schedule note — highlight it */
  highlightNewNote?: boolean
  /** Draft lives in JobCard so an unsent note counts as an un-applied change */
  draft: string
  onDraftChange: (text: string) => void
  onAddNote: (text: string) => void
  onEditNote: (noteId: string, text: string) => void
  onDeleteNote: (noteId: string) => void
  isSubmitting?: boolean
  actionError?: string | null
}

export default function NotesSection({
  notes,
  activeUser,
  highlightNewNote,
  draft,
  onDraftChange,
  onAddNote,
  onEditNote,
  onDeleteNote,
  isSubmitting,
  actionError,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const sorted = useMemo(
    () => [...notes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [notes]
  )

  const handleSend = () => {
    const text = draft.trim()
    if (!text || isSubmitting) return
    onAddNote(text)
    onDraftChange('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSend()
    }
  }

  const startEdit = (note: JobNote) => {
    setEditingId(note.id)
    setEditDraft(note.text)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const saveEdit = () => {
    const text = editDraft.trim()
    if (!editingId || !text || isSubmitting) return
    onEditNote(editingId, text)
    setEditingId(null)
    setEditDraft('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-semibold text-sm">Notes</span>
        <span className="bg-slate-700 rounded-full px-2 text-xs text-slate-400">
          {notes.length}
        </span>
      </div>

      {actionError && (
        <p className="text-red-400 text-xs">{actionError}</p>
      )}

      {sorted.length > 0 ? (
        <div>
          {sorted.map((note) => {
            const fromOpsSchedule = note.authorId === OPS_SCHEDULE_NOTE_AUTHOR_ID
            const isAuthor = activeUser?.id === note.authorId
            const canManage = !fromOpsSchedule && isAuthor
            const isEditing = editingId === note.id
            const opsNoteIsNew = fromOpsSchedule && !!highlightNewNote

            return (
              <div
                key={note.id}
                className={`border-l-2 pl-3 py-1 mb-2 rounded-r ${
                  opsNoteIsNew
                    ? 'border-amber-400 bg-amber-500/10'
                    : fromOpsSchedule
                      ? 'border-amber-600/60'
                      : 'border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1 min-w-0 flex-wrap">
                    <span className="font-semibold text-slate-300 text-sm truncate">
                      {note.authorName}
                    </span>
                    {fromOpsSchedule && (
                      <span className="text-amber-500/90 text-[10px] uppercase tracking-wide font-medium shrink-0">
                        from ops schedule
                      </span>
                    )}
                    {opsNoteIsNew && (
                      <span className="rounded bg-amber-500/20 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-300 shrink-0">
                        new
                      </span>
                    )}
                    <span className="text-slate-500 text-xs shrink-0">
                      &middot;{' '}
                      {formatDistanceToNow(
                        new Date(note.updatedAt ?? note.createdAt),
                        { addSuffix: true },
                      )}
                      {note.updatedAt && !fromOpsSchedule && (
                        <span className="text-slate-600"> (edited)</span>
                      )}
                    </span>
                  </div>
                  {canManage && !isEditing && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="text-slate-500 hover:text-slate-300 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        className="flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 text-slate-500 hover:text-red-400 text-2xl leading-none rounded-lg hover:bg-slate-800/80 transition-colors"
                        aria-label="Delete note"
                      >
                        &times;
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-1 flex flex-col gap-2">
                    <textarea
                      className="bg-slate-900 border border-slate-700 text-slate-300 rounded p-2 text-sm w-full resize-none focus:outline-none focus:border-slate-500"
                      rows={3}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={!editDraft.trim() || isSubmitting}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm leading-relaxed mt-0.5 whitespace-pre-wrap">
                    {note.text}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-slate-600 text-sm italic">No notes yet</p>
      )}

      {activeUser ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="bg-slate-900 border border-slate-700 text-slate-300 rounded p-2 text-sm w-full resize-none focus:outline-none focus:border-slate-500"
            rows={3}
            placeholder={`Add a note as ${activeUser.name}...`}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p className="text-slate-600 text-[10px]">
            Only you can edit or delete notes you add. Ops Schedule import notes cannot be changed.
          </p>
        </div>
      ) : (
        <p className="text-slate-600 text-xs italic">
          &larr; Select a user in the Users tab to add notes
        </p>
      )}
    </div>
  )
}
