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
    case 'none':
      return 'Not Started'
    case 'in_progress':
      return 'In Progress'
    case 'ready_to_ship':
      return 'Ready to Ship'
    case 'shipped':
      return 'Shipped'
    default:
      return ''
  }
}

export function statusIndex(status: JobStatus): number {
  return STATUS_ORDER.indexOf(status)
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

/** Neutral bubble for PM / Materials Manager labels. */
export function personBubbleColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = (Math.abs(hash) % 60) + 200
  return `hsl(${hue}, 35%, 38%)`
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

export type BoardTab = 'project' | 'spare-parts' | 'archive'

export function boardRouteForTab(tab: BoardTab): string {
  if (tab === 'spare-parts') return '/board/spare-parts'
  if (tab === 'archive') return '/board/archive'
  return '/board'
}

/** Same rules as JobListView — keeps header counts and lists in sync. */
export function filterJobsForTab(
  jobs: BoardJob[],
  tab: BoardTab,
  config: BoardConfig
): BoardJob[] {
  if (tab === 'archive') return jobs.filter((j) => j.status === 'shipped')
  if (tab === 'spare-parts') {
    return jobs.filter((j) => isSpareJob(j, config) && j.status !== 'shipped')
  }
  return jobs.filter((j) => !isSpareJob(j, config) && j.status !== 'shipped')
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
