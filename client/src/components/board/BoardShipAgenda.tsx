import { useMemo } from 'react'
import { BoardJob, BoardConfig, BoardUser } from '@vrsi/wallboard-shared'
import { statusLabel } from './boardColors'
import { samePerson } from '@vrsi/person-identity'

interface Props {
  jobs: BoardJob[]
  config: BoardConfig
  daysAhead?: number
  activeUser?: BoardUser | null
  onSelectJob: (jobNumber: string) => void
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function parseShipDay(iso: string): Date {
  return startOfDay(new Date(iso + 'T00:00:00'))
}

function formatSectionDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isUsersJob(job: BoardJob, user: BoardUser | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'pm') return samePerson(job.pm, user.name)
  if (user.role === 'materials') return samePerson(job.materialsManager, user.name)
  return false
}

function toSections(byDate: Map<string, BoardJob[]>) {
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayJobs]) => ({
      dateKey,
      label: formatSectionDate(parseShipDay(dateKey)),
      jobs: [...dayJobs].sort((a, b) =>
        a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }),
      ),
    }))
}

export function BoardShipAgenda({
  jobs,
  config,
  daysAhead = 30,
  activeUser,
  onSelectJob,
}: Props) {
  const { overdueSections, upcomingSections, totalJobs, dateCount } = useMemo(() => {
    const today = startOfDay(new Date())
    const lastDay = addDays(today, daysAhead)
    const overdue = new Map<string, BoardJob[]>()
    const upcoming = new Map<string, BoardJob[]>()

    for (const job of jobs) {
      if (!job.effectiveShipDate) continue
      const day = parseShipDay(job.effectiveShipDate)
      if (day < today) {
        const list = overdue.get(job.effectiveShipDate) ?? []
        list.push(job)
        overdue.set(job.effectiveShipDate, list)
      } else if (day <= lastDay) {
        const list = upcoming.get(job.effectiveShipDate) ?? []
        list.push(job)
        upcoming.set(job.effectiveShipDate, list)
      }
    }

    const overdueSections = toSections(overdue)
    const upcomingSections = toSections(upcoming)
    const totalJobs =
      overdueSections.reduce((n, s) => n + s.jobs.length, 0) +
      upcomingSections.reduce((n, s) => n + s.jobs.length, 0)

    return {
      overdueSections,
      upcomingSections,
      totalJobs,
      dateCount: overdueSections.length + upcomingSections.length,
    }
  }, [jobs, daysAhead])

  const renderJob = (job: BoardJob) => {
    const mine = isUsersJob(job, activeUser)
    const accent = config.statusColors[job.status]
    return (
      <button
        key={job.jobNumber}
        type="button"
        onClick={() => onSelectJob(job.jobNumber)}
        className={`w-full flex items-stretch gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
          mine
            ? 'bg-blue-500/10 ring-1 ring-blue-500/30 hover:bg-blue-500/15'
            : 'hover:bg-slate-800/80'
        }`}
      >
        <span
          className="w-1 flex-shrink-0 rounded-full self-stretch"
          style={{ backgroundColor: accent }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100 truncate">{job.jobNumber}</span>
            {mine && (
              <span className="shrink-0 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-300">
                Yours
              </span>
            )}
            {job.isNew && (
              <span className="shrink-0 text-[10px] font-bold uppercase text-red-400">New</span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate">
            {[job.customer, statusLabel(job.status)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </button>
    )
  }

  const renderSection = (section: { dateKey: string; label: string; jobs: BoardJob[] }) => (
    <div key={section.dateKey}>
      <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {section.label}
      </h3>
      <div className="space-y-1">{section.jobs.map(renderJob)}</div>
    </div>
  )

  return (
    <section aria-label="Upcoming ship dates">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
        Ship date agenda
        <span className="text-slate-600 font-normal normal-case tracking-normal">
          {' '}
          — next {daysAhead} days
        </span>
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        {totalJobs > 0
          ? `${totalJobs} job${totalJobs !== 1 ? 's' : ''} across ${dateCount} date${dateCount !== 1 ? 's' : ''}. Tap to jump to the job above.`
          : `No ship dates in the next ${daysAhead} days on this tab.`}
        {activeUser && (activeUser.role === 'pm' || activeUser.role === 'materials')
          ? ' Yours are highlighted.'
          : ''}
      </p>

      {totalJobs === 0 ? null : (
        <div className="space-y-4 pb-8">
          {overdueSections.length > 0 && (
            <div>
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-amber-500">
                Past due
              </h3>
              <div className="space-y-4">{overdueSections.map(renderSection)}</div>
            </div>
          )}
          {upcomingSections.map(renderSection)}
        </div>
      )}
    </section>
  )
}

export default BoardShipAgenda
