import { NavLink } from 'react-router-dom'
import { useBoardJobs, useBoardConfig, useBoardUsers } from '../../hooks/useBoard'
import { useAppStore, confirmDiscardUnsaved } from '../../store/appStore'
import { tabColor, filterJobsForTab, BLOCKED_TAB_COLOR } from './boardColors'

export function BoardHeader() {
  const { jobs } = useBoardJobs()
  const { config } = useBoardConfig()
  const { users } = useBoardUsers()
  const { activeUser, setActiveUser, setIsSettingsOpen } = useAppStore()

  const projectJobs = filterJobsForTab(jobs, 'project', config)
  const spareJobs = filterJobsForTab(jobs, 'spare-parts', config)
  const archiveJobs = filterJobsForTab(jobs, 'archive', config)
  const blockedJobs = filterJobsForTab(jobs, 'blocked', config)

  const projectColor = tabColor(projectJobs, config)
  const spareColor = tabColor(spareJobs, config)
  const archiveColor = config.statusColors.shipped
  const blockedColor = BLOCKED_TAB_COLOR

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // Switching user remounts the job list — pending edits would be lost
    if (!confirmDiscardUnsaved()) { e.target.value = activeUser?.id ?? ''; return }
    const id = e.target.value
    if (!id) { setActiveUser(null); return }
    const user = users.find((u) => u.id === id)
    if (user) setActiveUser(user)
  }

  // Block tab switches while a card has un-applied edits (unless confirmed)
  const guardNav = (e: React.MouseEvent) => {
    if (!confirmDiscardUnsaved()) e.preventDefault()
  }

  return (
    <header className="sticky top-0 z-50 bg-[#13171f] border-b border-slate-800">
      {/* Top row: logo + title + user switcher + back link */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center">
          <img
            src="/logos/vrsi-white-letters.png"
            alt="VRSI"
            className="h-6 w-auto opacity-90"
          />
          <span className="text-slate-300 text-sm ml-3 font-medium">Projects</span>
        </div>

        <div className="flex items-center gap-3">
          {/* User switcher dropdown */}
          <select
            value={activeUser?.id ?? ''}
            onChange={handleUserChange}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-slate-500 cursor-pointer"
          >
            <option value="">👤 All users</option>
            {activeUser && !users.some((u) => u.id === activeUser.id) && (
              <option value={activeUser.id}>{activeUser.name}</option>
            )}
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          {/* Settings gear — Users and Import management live in Settings */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            title="Open Settings (users, import, display)"
            aria-label="Open Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Tabs row — horizontal scroll on narrow screens */}
      <div className="flex items-end gap-1 px-4 overflow-x-auto">
        <NavLink
          to="/board"
          end
          onClick={guardNav}
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`
          }
          style={({ isActive }) =>
            isActive ? { borderBottom: `2px solid ${projectColor}`, backgroundColor: projectColor + '18' } : {}
          }
        >
          Project{projectJobs.length > 0 ? ` (${projectJobs.length})` : ''}
        </NavLink>

        <NavLink
          to="/board/spare-parts"
          onClick={guardNav}
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`
          }
          style={({ isActive }) =>
            isActive ? { borderBottom: `2px solid ${spareColor}`, backgroundColor: spareColor + '18' } : {}
          }
        >
          Spare Parts{spareJobs.length > 0 ? ` (${spareJobs.length})` : ''}
        </NavLink>

        <NavLink
          to="/board/archive"
          onClick={guardNav}
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`
          }
          style={({ isActive }) =>
            isActive ? { borderBottom: `2px solid ${archiveColor}`, backgroundColor: archiveColor + '18' } : {}
          }
        >
          Archive{archiveJobs.length > 0 ? ` (${archiveJobs.length})` : ''}
        </NavLink>

        <NavLink
          to="/board/blocked"
          onClick={guardNav}
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`
          }
          style={({ isActive }) =>
            isActive ? { borderBottom: `2px solid ${blockedColor}`, backgroundColor: blockedColor + '18' } : {}
          }
        >
          Blocked{blockedJobs.length > 0 ? ` (${blockedJobs.length})` : ''}
        </NavLink>

      </div>
    </header>
  )
}
