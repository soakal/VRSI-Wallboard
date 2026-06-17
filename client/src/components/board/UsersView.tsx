import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useBoardUsers, useBoardConfig, useUpdateBoardConfig } from '../../hooks/useBoard'
import { useAppStore } from '../../store/appStore'
import { BoardUser } from '@vrsi/wallboard-shared'

function roleLabel(role: BoardUser['role']): string {
  switch (role) {
    case 'pm':       return 'PM'
    case 'materials': return 'Materials'
    case 'super':    return 'Super User'
    case 'manual':   return 'Extra'
    default:         return role
  }
}

export default function UsersView() {
  const { users } = useBoardUsers()
  const { config } = useBoardConfig()
  const updateConfig = useUpdateBoardConfig()
  const location = useLocation()
  const navigate = useNavigate()
  const selectPrompt = !!(location.state as { selectPrompt?: boolean })?.selectPrompt

  const activeUser = useAppStore((s) => s.activeUser)
  const setActiveUser = useAppStore((s) => s.setActiveUser)

  const handleSelectUser = (user: Parameters<typeof setActiveUser>[0]) => {
    setActiveUser(user)
    if (selectPrompt && user) navigate('/board')
  }

  // ── super users state ─────────────────────────────────────────────────────
  const superUsers = config.superUsers ?? []
  const [superPick, setSuperPick] = useState('')
  const [superSavedFlash, setSuperSavedFlash] = useState(false)

  const flashSuperSaved = () => {
    setSuperSavedFlash(true)
    setTimeout(() => setSuperSavedFlash(false), 2000)
  }

  const handleAddSuperUser = () => {
    const name = superPick.trim()
    setSuperPick('')
    if (!name) return
    if (superUsers.some((u) => u.toLowerCase() === name.toLowerCase())) return
    updateConfig.mutate({ superUsers: [...superUsers, name] }, { onSuccess: flashSuperSaved })
  }

  const handleRemoveSuperUser = (name: string) => {
    updateConfig.mutate(
      { superUsers: superUsers.filter((u) => u !== name) },
      { onSuccess: flashSuperSaved }
    )
  }

  // ── spare carrier state ───────────────────────────────────────────────────
  const [spareCarrierInput, setSpareCarrierInput] = useState(config.spareCarrier)
  const [spareSavedFlash, setSpareSavedFlash] = useState(false)

  useEffect(() => {
    setSpareCarrierInput(config.spareCarrier)
  }, [config.spareCarrier])

  const handleSaveSpareCarrier = () => {
    updateConfig.mutate(
      { spareCarrier: spareCarrierInput.trim().toLowerCase() },
      {
        onSuccess: () => {
          setSpareSavedFlash(true)
          setTimeout(() => setSpareSavedFlash(false), 2000)
        },
      }
    )
  }

  // ── extra users state ─────────────────────────────────────────────────────
  const [newUserName, setNewUserName] = useState('')

  const handleAddUser = () => {
    const name = newUserName.trim()
    if (!name) return
    const current = config.extraUsers ?? []
    if (current.some((u) => u.toLowerCase() === name.toLowerCase())) return
    updateConfig.mutate({ extraUsers: [...current, name] })
    setNewUserName('')
  }

  const handleRemoveUser = (name: string) => {
    const current = config.extraUsers ?? []
    updateConfig.mutate({ extraUsers: current.filter((u) => u !== name) })
  }

  return (
    <div className="divide-y divide-slate-800">

      {/* ── Prompt banner ────────────────────────────────────────────────────── */}
      {selectPrompt && !activeUser && (
        <div className="mb-4 rounded-xl bg-blue-600/20 border border-blue-500/30 px-4 py-3 text-sm text-blue-300">
          Select your name below to see your jobs.
        </div>
      )}

      {/* ── Section 1: Who are you? ─────────────────────────────────────────── */}
      <div className="py-4 px-1">
        <h3 className="text-slate-300 font-semibold text-sm mb-3">Who are you?</h3>

        <div className="flex items-center gap-3">
          <select
            value={activeUser?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value
              if (!id) { handleSelectUser(null); return }
              const user = users.find((u) => u.id === id) ?? null
              handleSelectUser(user)
            }}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="">— Select your name —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({roleLabel(u.role)})</option>
            ))}
          </select>

          {activeUser && (
            <button
              onClick={() => setActiveUser(null)}
              className="text-slate-500 hover:text-slate-300 text-xs border border-slate-700 rounded px-3 py-2 transition-colors shrink-0"
            >
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* ── Section 2: Extra Users (advanced) ─────────────────────────────────── */}
      <details className="py-4 px-1 group">
        <summary className="text-slate-400 text-sm cursor-pointer list-none flex items-center gap-2 select-none">
          <span className="text-slate-500 group-open:rotate-90 transition-transform inline-block">▸</span>
          Advanced: Extra Users
        </summary>
        <p className="text-slate-500 text-xs mt-3 mb-3">
          User names normally come from PM and Materials Manager columns in the imported spreadsheet.
          Only add manual names here if someone is missing from the schedule file.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddUser() }}
            placeholder="Full name"
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-1.5 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
          <button
            onClick={handleAddUser}
            disabled={!newUserName.trim() || updateConfig.isPending}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        {(config.extraUsers ?? []).length > 0 && (
          <ul className="space-y-1">
            {(config.extraUsers ?? []).map((name) => (
              <li key={name} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-200">{name}</span>
                <button
                  onClick={() => handleRemoveUser(name)}
                  className="text-slate-500 hover:text-red-400 transition-colors text-lg leading-none"
                  aria-label={`Remove ${name}`}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* ── Section 3: Super Users ──────────────────────────────────────────── */}
      <div className="py-4 px-1">
        <h3 className="text-slate-300 font-semibold text-sm mb-1">Super Users</h3>
        <p className="text-slate-500 text-xs mb-3">Super users see all jobs in both tabs with no filtering. Changes save immediately.</p>

        <div className="flex gap-2 mb-3">
          <select
            value={superPick}
            onChange={(e) => setSuperPick(e.target.value)}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-1.5 focus:outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="">— Add a super user —</option>
            {users
              .filter((u) => !superUsers.some((s) => s.toLowerCase() === u.name.toLowerCase()))
              .map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
          </select>
          <button
            onClick={handleAddSuperUser}
            disabled={!superPick || updateConfig.isPending}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        {superUsers.length > 0 ? (
          <ul className="space-y-1">
            {superUsers.map((name) => (
              <li key={name} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-200">{name}</span>
                <button
                  onClick={() => handleRemoveSuperUser(name)}
                  disabled={updateConfig.isPending}
                  className="text-slate-500 hover:text-red-400 transition-colors text-lg leading-none"
                  aria-label={`Remove ${name} from super users`}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-600 text-xs">No super users — everyone sees only their own jobs.</p>
        )}
        {superSavedFlash && (
          <span className="text-green-400 text-xs">Saved!</span>
        )}
      </div>

      {/* ── Section 4: Spare Parts PM ────────────────────────────────────────── */}
      <div className="py-4 px-1">
        <h3 className="text-slate-300 font-semibold text-sm mb-1">Spare Parts PM</h3>
        <p className="text-slate-500 text-xs mb-3">Jobs assigned to this PM go to the Spare Parts tab.</p>

        <div className="flex gap-2 mb-1">
          <select
            value={spareCarrierInput}
            onChange={(e) => setSpareCarrierInput(e.target.value)}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-1.5 focus:outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="">— Select a PM —</option>
            {users.filter((u) => u.role === 'pm').map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}{u.name === config.spareCarrier ? ' ✓' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveSpareCarrier}
            disabled={updateConfig.isPending || !spareCarrierInput.trim()}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 text-xs px-3 py-1.5 rounded transition-colors"
          >
            Save
          </button>
        </div>
        {spareSavedFlash && (
          <span className="text-green-400 text-xs">Saved!</span>
        )}
      </div>

    </div>
  )
}
