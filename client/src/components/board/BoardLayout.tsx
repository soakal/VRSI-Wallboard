import { Outlet, useLocation, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BoardHeader } from './BoardHeader'
import { useAppStore } from '../../store/appStore'

export function BoardLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { setIsSettingsOpen, setIsFilesOpen, setIsMonitoringOpen } = useAppStore()

  // Refetch board data whenever the user switches Project / Spare / Archive / Import
  useEffect(() => {
    void queryClient.refetchQueries({ queryKey: ['board'] })
  }, [location.pathname, queryClient])

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
        <div className="flex items-center gap-4 text-[11px] text-slate-600">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="hover:text-slate-400 transition-colors"
            title="Open Settings"
          >
            Ctrl+S Settings
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={() => setIsFilesOpen(true)}
            className="hover:text-slate-400 transition-colors"
            title="Open Files"
          >
            Ctrl+F Files
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={() => setIsMonitoringOpen(true)}
            className="hover:text-slate-400 transition-colors"
            title="IT safety report and activity log"
          >
            Ctrl+M System
          </button>
          <span>|</span>
          <Link to="/" className="hover:text-slate-400 transition-colors">
            Calendar
          </Link>
        </div>
      </footer>
    </div>
  )
}

export default BoardLayout
