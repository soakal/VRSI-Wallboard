import { NavLink } from 'react-router-dom'
import { useBoardJobs, useBoardConfig, useBoardUsers } from '../../hooks/useBoard'
import { useAppStore } from '../../store/appStore'
import { tabColor, filterJobsForTab } from './boardColors'

export function BoardHeader() {
  const { jobs } = useBoardJobs()
  const { config } = useBoardConfig()
  const { users } = useBoardUsers()
  const { activeUser, setActiveUser, setIsMonitoringOpen } = useAppStore()

  const projectJobs = filterJobsForTab(jobs, 'project', config)
  const spareJobs = filterJobsForTab(jobs, 'spare-parts', config)
  const archiveJobs = filterJobsForTab(jobs, 'archive', config)

  const projectColor = tabColor(projectJobs, config)
  const spareColor = tabColor(spareJobs, config)
  const archiveColor = config.statusColors.shipped
  const usersColor = '#3b82f6'

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (!id) { setActiveUser(null); return }
    const user = users.find((u) => u.id === id)
    if (user) setActiveUser(user)
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
            <option value="">— Select user —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsMonitoringOpen(true)}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors border border-slate-700 rounded px-2 py-1"
            title="Backups, IT report, activity log (Ctrl+M)"
          >
            System
          </button>
        </div>
      </div>

      {/* Tabs row — horizontal scroll on narrow screens */}
      <div className="flex items-end gap-1 px-4 overflow-x-auto">
        <NavLink
          to="/board"
          end
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
          to="/board/users"
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`
          }
          style={({ isActive }) =>
            isActive ? { borderBottom: `2px solid ${usersColor}`, backgroundColor: usersColor + '18' } : {}
          }
        >
          Users
        </NavLink>

        <NavLink
          to="/board/import"
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`
          }
          style={({ isActive }) =>
            isActive ? { borderBottom: '2px solid #6366f1', backgroundColor: '#6366f118' } : {}
          }
        >
          Import
        </NavLink>
      </div>
    </header>
  )
}
