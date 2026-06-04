import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BoardHeader } from './BoardHeader'

export function BoardLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()

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
    </div>
  )
}

export default BoardLayout
