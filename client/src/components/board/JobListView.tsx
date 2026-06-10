import { useState, useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useBoardJobs, useBoardConfig, useBoardUsers, useUpdateBoardConfig } from '../../hooks/useBoard'
import { useAppStore } from '../../store/appStore'
import { JobCard } from './JobCard'
import { BoardShipAgenda } from './BoardShipAgenda'
import { filterJobsForTab, sortBoardJobsByShipDate } from './boardColors'
import { BoardJob } from '@vrsi/wallboard-shared'
import { canonicalPersonName, samePerson } from '@vrsi/person-identity'

interface Props {
  tab: 'project' | 'spare-parts' | 'archive'
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function loadFilterList(key: string): string[] {
  const raw = sessionStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    }
  } catch {
    return raw.trim() ? [raw.trim()] : []
  }
  return []
}

function isSelected(selected: string[], name: string): boolean {
  return selected.some((s) => samePerson(s, name))
}

function PersonMultiSelect({
  label,
  names,
  selected,
  onChange,
  bubbleClass,
}: {
  label: string
  names: string[]
  selected: string[]
  onChange: (next: string[]) => void
  bubbleClass: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (name: string) => {
    if (isSelected(selected, name)) {
      onChange(selected.filter((s) => !samePerson(s, name)))
    } else {
      onChange([...selected, name])
    }
  }

  const remove = (name: string, e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange(selected.filter((s) => !samePerson(s, name)))
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-slate-500 text-xs">{label}</div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 shrink-0"
          >
            Clear
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full min-h-[2.5rem] flex items-center gap-1 flex-wrap rounded-lg border px-2 py-1.5 text-left transition-colors ${
          selected.length > 0
            ? 'bg-slate-800/80 border-blue-500/40'
            : 'bg-slate-800 border-slate-700 hover:border-slate-500'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected.length === 0 ? (
          <span className="text-slate-400 text-sm px-1">All</span>
        ) : (
          selected.map((name) => (
            <span
              key={name}
              className={`inline-flex items-center gap-1 max-w-[11rem] rounded-full border px-2 py-0.5 text-xs text-slate-100 ${bubbleClass}`}
              title={name}
            >
              <span className="truncate">{name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => remove(name, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    remove(name, e as unknown as ReactMouseEvent)
                  }
                }}
                className="text-slate-300 hover:text-white shrink-0 leading-none"
                aria-label={`Remove ${name}`}
              >
                ×
              </span>
            </span>
          ))
        )}
        <span className="ml-auto pl-1 text-slate-500 shrink-0 text-sm">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-56 overflow-y-auto rounded-xl border border-slate-600 bg-slate-800 shadow-xl py-1">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-700/80">
            <span className="text-xs text-slate-500">{selected.length} selected</span>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-40 disabled:pointer-events-none"
            >
              Clear
            </button>
          </div>
          {names.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No people on this tab yet.</p>
          ) : (
            names.map((name) => {
              const checked = isSelected(selected, name)
              return (
                <label
                  key={name}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700/60 text-sm text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(name)}
                    className="rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                  />
                  <span className="truncate" title={name}>
                    {name}
                  </span>
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export function JobListView({ tab }: Props) {
  const { jobs, isLoading } = useBoardJobs()
  const { config } = useBoardConfig()
  const { users } = useBoardUsers()
  const updateConfig = useUpdateBoardConfig()
  const { activeUser } = useAppStore()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAll, setShowAll] = useState(false)
  const [newOnly, setNewOnly] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [search, setSearch] = useState('')
  const [filterPms, setFilterPms] = useState<string[]>([])
  const [filterMms, setFilterMms] = useState<string[]>([])
  const [scrollToJobNumber, setScrollToJobNumber] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [spareGearOpen, setSpareGearOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suppressScrollReset = useRef(false)

  // Session storage keys scoped to tab + user so tabs and users are independent
  const userId = activeUser?.id ?? 'none'
  const scrollKey = `board-scroll-${tab}-${userId}`
  const searchKey = `board-search-${tab}-${userId}`
  const showAllKey = `board-showall-${tab}-${userId}`
  const newOnlyKey = `board-newonly-${tab}-${userId}`
  const filterPmKey = `board-filter-pm-${tab}-${userId}`
  const filterMmKey = `board-filter-mm-${tab}-${userId}`

  // Restore scroll + search + showAll on mount; ?job= param takes priority over saved state
  useEffect(() => {
    const jobParam = searchParams.get('job')
    if (jobParam) {
      setInputValue(jobParam)
      setSearch(jobParam)
      setSearchParams({}, { replace: true })
      return
    }
    const savedSearch = sessionStorage.getItem(searchKey) ?? ''
    const savedShowAll = sessionStorage.getItem(showAllKey) === 'true'
    const savedFilterPm = loadFilterList(filterPmKey)
    const savedFilterMm = loadFilterList(filterMmKey)
    if (savedSearch) {
      suppressScrollReset.current = true
      setInputValue(savedSearch)
      setSearch(savedSearch)
    }
    if (savedShowAll) setShowAll(true)
    if (sessionStorage.getItem(newOnlyKey) === 'true') setNewOnly(true)
    if (savedFilterPm.length) setFilterPms(savedFilterPm)
    if (savedFilterMm.length) setFilterMms(savedFilterMm)
    const savedScroll = sessionStorage.getItem(scrollKey)
    if (savedScroll) {
      // Delay so the restored search + rendered list settle before scrolling
      const t = setTimeout(() => {
        const el = document.getElementById('board-scroll')
        if (el) el.scrollTop = Number(savedScroll)
      }, 120)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist search when committed
  useEffect(() => {
    sessionStorage.setItem(searchKey, search)
  }, [search, searchKey])

  // Persist showAll
  useEffect(() => {
    sessionStorage.setItem(showAllKey, String(showAll))
  }, [showAll, showAllKey])

  // Persist newOnly
  useEffect(() => {
    sessionStorage.setItem(newOnlyKey, String(newOnly))
  }, [newOnly, newOnlyKey])

  useEffect(() => {
    if (filterPms.length) sessionStorage.setItem(filterPmKey, JSON.stringify(filterPms))
    else sessionStorage.removeItem(filterPmKey)
  }, [filterPms, filterPmKey])

  useEffect(() => {
    if (filterMms.length) sessionStorage.setItem(filterMmKey, JSON.stringify(filterMms))
    else sessionStorage.removeItem(filterMmKey)
  }, [filterMms, filterMmKey])

  // Persist scroll position
  useEffect(() => {
    const el = document.getElementById('board-scroll')
    if (!el) return
    const onScroll = () => sessionStorage.setItem(scrollKey, String(el.scrollTop))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollKey])

  // Refetch when user or tab changes (local state resets via route key)
  useEffect(() => {
    void queryClient.refetchQueries({ queryKey: ['board', 'jobs'] })
  }, [activeUser?.id, location.pathname, queryClient])

  // Scroll to top on new committed search (suppressed when restoring saved search)
  useLayoutEffect(() => {
    if (suppressScrollReset.current) { suppressScrollReset.current = false; return }
    const el = document.getElementById('board-scroll')
    if (el) el.scrollTop = 0
  }, [search])

  // Scroll to a job card (agenda tap, PM/MM filter, etc.)
  useLayoutEffect(() => {
    if (!scrollToJobNumber) return
    const t = setTimeout(() => {
      const el = document.getElementById(`job-card-${scrollToJobNumber}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setScrollToJobNumber(null)
    }, 150)
    return () => clearTimeout(t)
  }, [scrollToJobNumber, filterPms, filterMms, search, showAll])

  // Close gear popover on outside click
  useEffect(() => {
    if (!spareGearOpen) return
    const handler = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setSpareGearOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [spareGearOpen])

  const commitSearch = () => setSearch(inputValue)

  const clearSearch = () => {
    setInputValue('')
    setSearch('')
    inputRef.current?.focus()
  }

  if (isLoading) {
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse bg-slate-800 rounded-xl h-32 mb-3" />
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <p className="text-slate-500 text-sm">
        No jobs imported yet. Go to the{' '}
        <Link to="/board/import" className="text-blue-400 hover:text-blue-300 underline">
          Import tab
        </Link>{' '}
        to upload an XLSM file.
      </p>
    )
  }

  const spare = norm(config.spareCarrier)
  const isSuper = !!activeUser && (config.superUsers ?? []).some((s) => norm(s) === norm(activeUser.name))
  const pmUsers = users.filter((u) => u.role === 'pm')

  const tabFiltered = filterJobsForTab(jobs, tab, config)

  const uniquePms = Array.from(
    new Set(tabFiltered.map((j) => canonicalPersonName(j.pm)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))

  const uniqueMms = Array.from(
    new Set(tabFiltered.map((j) => canonicalPersonName(j.materialsManager)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))

  const showPersonFilters = tab === 'project' || tab === 'spare-parts'
  const personFilterActive = filterPms.length > 0 || filterMms.length > 0

  const toggleProjectManager = (name: string, anchorJobNumber?: string) => {
    setFilterPms((prev) => {
      if (isSelected(prev, name)) return prev.filter((s) => !samePerson(s, name))
      return [...prev, canonicalPersonName(name)]
    })
    if (anchorJobNumber) setScrollToJobNumber(anchorJobNumber)
  }

  const toggleMaterialsManager = (name: string, anchorJobNumber?: string) => {
    setFilterMms((prev) => {
      if (isSelected(prev, name)) return prev.filter((s) => !samePerson(s, name))
      return [...prev, canonicalPersonName(name)]
    })
    if (anchorJobNumber) setScrollToJobNumber(anchorJobNumber)
  }

  // Quick filters — match any selected PM and any selected MM (both apply when set)
  let quickFiltered = tabFiltered
  if (filterPms.length > 0) {
    quickFiltered = quickFiltered.filter((j) =>
      filterPms.some((n) => samePerson(j.pm, n)),
    )
  }
  if (filterMms.length > 0) {
    quickFiltered = quickFiltered.filter((j) =>
      filterMms.some((n) => samePerson(j.materialsManager, n)),
    )
  }

  if (tab === 'archive' && tabFiltered.length === 0) {
    return (
      <p className="text-slate-500 text-sm mt-6">
        No archived jobs yet. Jobs marked as <span className="text-green-400">Shipped</span> will appear here.
      </p>
    )
  }

  // Role filter — skipped when a Project Manager / Materials Manager quick filter is active
  let filtered: BoardJob[]
  if (
    tab === 'spare-parts' ||
    tab === 'archive' ||
    !activeUser ||
    isSuper ||
    showAll ||
    activeUser.role === 'manual' ||
    personFilterActive
  ) {
    filtered = quickFiltered
  } else if (activeUser.role === 'pm') {
    filtered = quickFiltered.filter((j) => samePerson(j.pm, activeUser.name))
  } else if (activeUser.role === 'materials') {
    filtered = quickFiltered.filter((j) => samePerson(j.materialsManager, activeUser.name))
  } else {
    filtered = quickFiltered
  }

  // Step 3: committed search filter (job#, customer, pm)
  const q = search.trim().toLowerCase()
  const searched = q
    ? filtered.filter((j) =>
        j.jobNumber.toLowerCase().includes(q) ||
        j.customer.toLowerCase().includes(q) ||
        j.pm.toLowerCase().includes(q) ||
        j.materialsManager.toLowerCase().includes(q)
      )
    : filtered

  const newMatched = newOnly ? searched.filter((j) => j.isNew) : searched
  const sorted = sortBoardJobsByShipDate(newMatched, tab)
  const newCount = tabFiltered.filter((j) => j.isNew).length

  const activeFilterCount = filterPms.length + filterMms.length

  const handleAgendaSelect = (jobNumber: string) => {
    const visible = sorted.some((j) => j.jobNumber === jobNumber)
    if (!visible) {
      setShowAll(true)
      setNewOnly(false)
      setFilterPms([])
      setFilterMms([])
      if (search) {
        setSearch('')
        setInputValue('')
      }
    }
    setScrollToJobNumber(jobNumber)
  }

  const scrollToAgenda = () => {
    document.getElementById('board-ship-agenda')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const canToggle = tab !== 'spare-parts' && tab !== 'archive' && !!activeUser && !isSuper && activeUser.role !== 'manual'
  const spareNotConfigured = tab === 'spare-parts' && !spare

  const filterSummary = (() => {
    const parts: string[] = []
    if (newOnly) parts.push('New only')
    if (filterPms.length === 1) parts.push(`Project Manager: ${filterPms[0]}`)
    else if (filterPms.length > 1) parts.push(`${filterPms.length} Project Managers`)
    if (filterMms.length === 1) parts.push(`Materials Manager: ${filterMms[0]}`)
    else if (filterMms.length > 1) parts.push(`${filterMms.length} Materials Managers`)
    return parts.length ? ` · ${parts.join(' · ')}` : ''
  })()

  return (
    <div>
      {/* Filter bar scrolls away on mobile so job cards are not covered */}
      <div className="md:sticky md:top-0 md:z-20 md:bg-[#0f1117] pt-3 pb-2 mb-2 md:pt-6 md:pb-3 md:mb-3">
        {/* Row 1: search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSearch() }}
              placeholder="Search job number, customer, PM, or MM…"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            />
            {inputValue && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-lg leading-none"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={commitSearch}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shrink-0"
          >
            Search
          </button>

          {/* Gear icon — only on spare-parts tab */}
          {tab === 'spare-parts' && (
            <div ref={gearRef} className="relative">
              <button
                type="button"
                onClick={() => setSpareGearOpen((o) => !o)}
                title="Change Spare Parts PM"
                className={`p-2 rounded-lg border transition-colors ${
                  spareGearOpen || spareNotConfigured
                    ? 'bg-slate-700 border-slate-500 text-slate-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
              >
                {/* gear SVG */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>

              {/* Popover */}
              {spareGearOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-30 p-4">
                  <p className="text-slate-300 text-sm font-medium mb-3">Spare Parts Manager</p>
                  <p className="text-slate-500 text-xs mb-3">
                    Jobs assigned to this PM appear in the Spare Parts tab for all users.
                  </p>
                  <select
                    value={config.spareCarrier}
                    onChange={(e) => {
                      updateConfig.mutate(
                        { spareCarrier: e.target.value.trim().toLowerCase() },
                        { onSuccess: () => setSpareGearOpen(false) }
                      )
                    }}
                    className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">— Not set —</option>
                    {pmUsers.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}{norm(u.name) === spare ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                  {spareNotConfigured && (
                    <p className="text-amber-400 text-xs mt-2">⚠ No PM selected — Spare Parts tab will be empty.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 2: PM/MM filters — collapsed by default on mobile */}
        {showPersonFilters && (
          <>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((o) => !o)}
              className="md:hidden mt-2 w-full flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-300"
            >
              <span>
                Project / Materials filters
                {activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}
              </span>
              <span className="text-slate-500">{mobileFiltersOpen ? '▴' : '▾'}</span>
            </button>
            <div
              className={`grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3 ${
                mobileFiltersOpen ? '' : 'hidden md:grid'
              }`}
            >
              <PersonMultiSelect
                label="Project Manager"
                names={uniquePms}
                selected={filterPms}
                onChange={setFilterPms}
                bubbleClass="bg-blue-600/50 border-blue-400/50"
              />
              <PersonMultiSelect
                label="Materials Manager"
                names={uniqueMms}
                selected={filterMms}
                onChange={setFilterMms}
                bubbleClass="bg-violet-600/40 border-violet-400/50"
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-2">
          <p className="text-slate-500 text-sm">
            {sorted.length} job{sorted.length !== 1 ? 's' : ''}
            {q
              ? ` matching "${search.trim()}"`
              : filterSummary
              || (tab === 'archive'
              ? ' · newest ship date first'
              : ' · soonest ship date first')}
          </p>
          <div className="flex items-center gap-2">
            {tab !== 'archive' && (newCount > 0 || newOnly) && (
              <button
                type="button"
                onClick={() => setNewOnly((o) => !o)}
                className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  newOnly
                    ? 'bg-red-600/80 border-red-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
                title="Show only jobs flagged NEW from the last import"
              >
                New{newCount > 0 ? ` (${newCount})` : ''}
              </button>
            )}
            {canToggle && (
              <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    !showAll ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  My Jobs
                </button>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    showAll ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Jobs
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* key={search} forces the list to remount on every committed search */}
      {sorted.length === 0 ? (
        <p className="text-slate-500 text-sm mt-2">
          {spareNotConfigured ? 'Click the gear ⚙ above to set a Spare Parts PM.' : 'No jobs found.'}
        </p>
      ) : (
        <div key={search}>
          {sorted.map((job) => (
            <JobCard
              key={job.jobNumber}
              job={job}
              activeUser={activeUser}
              config={config}
              onSelectProjectManager={(name) => toggleProjectManager(name, job.jobNumber)}
              onSelectMaterialsManager={(name) => toggleMaterialsManager(name, job.jobNumber)}
            />
          ))}
        </div>
      )}

      {/* Mobile: full-tab 30-day ship agenda (not limited to My Jobs / search filters) */}
      {tab !== 'archive' && tabFiltered.length > 0 && (
        <div id="board-ship-agenda" className="md:hidden mt-6 pt-4 border-t border-slate-800 scroll-mt-4">
          <BoardShipAgenda
            jobs={tabFiltered}
            config={config}
            activeUser={activeUser}
            daysAhead={30}
            onSelectJob={handleAgendaSelect}
          />
        </div>
      )}

      {tab !== 'archive' && tabFiltered.length > 0 && (
        <button
          type="button"
          onClick={scrollToAgenda}
          className="md:hidden fixed bottom-4 right-4 z-40 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-900/50"
        >
          30-day agenda ↓
        </button>
      )}
    </div>
  )
}

export default JobListView
