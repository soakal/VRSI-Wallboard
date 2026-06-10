import { Outlet, useLocation, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BoardHeader } from './BoardHeader'
import { useAppStore, confirmDiscardUnsaved } from '../../store/appStore'

export function BoardLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { setIsSettingsOpen, setIsFilesOpen, setIsMonitoringOpen } = useAppStore()
  const dirtyCount = useAppStore((s) => Object.keys(s.dirtyJobs).length)

  // Refetch board data whenever the user switches Project / Spare / Archive / Import
  useEffect(() => {
    void queryClient.refetchQueries({ queryKey: ['board'] })
  }, [location.pathname, queryClient])

  // Browser refresh/close while a card has un-applied edits → native warning
  useEffect(() => {
    if (dirtyCount === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirtyCount])

  return (
    <div className="h-screen flex flex-col bg-[#0f1117] text-slate-200">
      <BoardHeader />
      <main
        id="board-scroll"
        className="flex-1 min-h-0 overflow-y-auto max-w-7xl w-full mx-auto px-4 pb-24 md:pb-6 scroll-smooth"
      >
        <Outlet />
      </main>

      {/* Status bar — mirrors the calendar footer */}
      <footer className="hidden md:flex flex-shrink-0 items-center justify-end border-t border-white/5 bg-black/20 px-5 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="Open Settings (Ctrl+S)"
          >
            ⚙ Settings
          </button>
          <button
            type="button"
            onClick={() => setIsFilesOpen(true)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="Open Files (Ctrl+F)"
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => setIsMonitoringOpen(true)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="IT safety report and activity log (Ctrl+M)"
          >
            System
          </button>
          <Link
            to="/"
            onClick={(e) => { if (!confirmDiscardUnsaved()) e.preventDefault() }}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
          >
            Calendar
          </Link>
          <span className="rounded-md px-2.5 py-1 text-xs font-semibold text-white bg-blue-600/70 border border-blue-500/40">
            Projects
          </span>
        </div>
      </footer>
    </div>
  )
}

export default BoardLayout
