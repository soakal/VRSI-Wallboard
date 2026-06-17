import { JobStatus, STATUS_ORDER, BoardJob, BoardConfig } from '@vrsi/wallboard-shared'
import { samePerson } from '@vrsi/person-identity'

export function worstStatus(jobs: BoardJob[]): JobStatus {
  const filtered = jobs.filter(job => job.status !== 'none')

  if (filtered.length === 0) {
    return 'none'
  }

  return filtered.reduce<JobStatus>((worst, current) => {
    const worstIndex = STATUS_ORDER.indexOf(worst)
    const currentIndex = STATUS_ORDER.indexOf(current.status)
    return currentIndex < worstIndex ? current.status : worst
  }, 'shipped')
}

export function tabColor(jobs: BoardJob[], config: BoardConfig): string {
  return config.statusColors[worstStatus(jobs)]
}

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'none':          return 'Not Started'
    case 'parts_on_order': return 'Parts on Order'
    case 'design':        return 'Design'
    case 'build':         return 'Build'
    case 'in_progress':   return 'In Progress'
    case 'ready_to_ship': return 'Ready to Ship'
    case 'shipped':       return 'Shipped'
    default:              return ''
  }
}

/** Stable hue from a string — used for customer name bubbles. */
export function customerBubbleColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 52%, 42%)`
}

/**
 * A job is a spare-parts job if its PM matches the configured spare carrier
 * OR its job number starts with 'sp-' or 'sp ' (case-insensitive). Shared by BoardHeader
 * (tab coloring/counts) and JobListView (list filtering) so they always agree.
 */
export function isSpareJob(job: BoardJob, config: BoardConfig): boolean {
  const jn = job.jobNumber.toLowerCase()
  return samePerson(job.pm, config.spareCarrier) || jn.startsWith('sp-') || jn.startsWith('sp ')
}

export type BoardTab = 'project' | 'spare-parts' | 'archive' | 'blocked'

/** Distinct colour for the Blocked tab (manual triage lane). */
export const BLOCKED_TAB_COLOR = '#ef4444'

/**
 * Same rules as JobListView — keeps header counts and lists in sync.
 * A blocked job is removed from Project / Spare Parts / Archive and shows ONLY
 * in the Blocked tab, so manual triage takes it out of the normal flow.
 */
export function filterJobsForTab(
  jobs: BoardJob[],
  tab: BoardTab,
  config: BoardConfig
): BoardJob[] {
  if (tab === 'blocked') return jobs.filter((j) => j.blocked)
  if (tab === 'archive') return jobs.filter((j) => !j.blocked && j.status === 'shipped')
  if (tab === 'spare-parts') {
    return jobs.filter((j) => !j.blocked && isSpareJob(j, config) && j.status !== 'shipped')
  }
  return jobs.filter((j) => !j.blocked && !isSpareJob(j, config) && j.status !== 'shipped')
}

/**
 * Project & Spare Parts: soonest ship date first (nulls last).
 * Archive: latest ship date first (nulls last).
 */
export function sortBoardJobsByShipDate(jobs: BoardJob[], tab: BoardTab): BoardJob[] {
  const ascending = tab !== 'archive'
  return [...jobs].sort((a, b) => {
    const da = a.effectiveShipDate
    const db = b.effectiveShipDate
    if (!da && !db) {
      return a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true })
    }
    if (!da) return 1
    if (!db) return -1
    const cmp = da.localeCompare(db)
    if (cmp !== 0) return ascending ? cmp : -cmp
    return a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true })
  })
}
