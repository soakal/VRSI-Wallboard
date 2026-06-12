/**
 * Fixed demo dataset for the visual tours.
 *
 * Ship dates are computed relative to "today" so the calendar, agenda, and
 * 30-day board agenda always have content no matter when the tour runs.
 * PM / Materials values are emails (exactly like the real ops schedule) — the
 * app title-cases them for calendar labels (formatJobPmLabel) while the user
 * picker shows the raw address, matching production behaviour.
 *
 * Plain data only — no imports, no Date.now ban concerns (this is app code,
 * not a workflow script).
 */

export interface DemoJob {
  jobNumber: string
  pm: string
  customer: string
  materialsManager: string
  pabsComplete: string | null
  shipToPm: string | null
  shipToCustomer: string | null
}

/** YYYY-MM-DD that is `offsetDays` from local today. */
function dateOffset(offsetDays: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// People (emails, like the real schedule file)
const PM_MARIA = 'maria.lopez@vrsi-demo.com'
const PM_TOM = 'tom.nguyen@vrsi-demo.com'
const PM_SARA = 'sara.kim@vrsi-demo.com'
const PM_DANA = 'dana.price@vrsi-demo.com' // → Spare Parts PM
const MM_ALEX = 'alex.reed@vrsi-demo.com'
const MM_JORDAN = 'jordan.fox@vrsi-demo.com'
const MM_CASEY = 'casey.bell@vrsi-demo.com'

/** The PM whose jobs route to the Spare Parts tab (set via /api/board/config). */
export const SPARE_PM = PM_DANA

export const DEMO_JOBS: DemoJob[] = [
  // Past-due (amber in the agenda)
  { jobNumber: '512-1001A', pm: PM_MARIA, customer: 'Rivian', materialsManager: MM_ALEX, pabsComplete: dateOffset(-30), shipToPm: dateOffset(-9), shipToCustomer: dateOffset(-5) },
  { jobNumber: '512-1002B', pm: PM_TOM, customer: 'Tesla', materialsManager: MM_JORDAN, pabsComplete: dateOffset(-25), shipToPm: dateOffset(-6), shipToCustomer: dateOffset(-2) },

  // This month — upcoming
  { jobNumber: '512-1003A', pm: PM_SARA, customer: 'Boeing', materialsManager: MM_CASEY, pabsComplete: dateOffset(-10), shipToPm: dateOffset(0), shipToCustomer: dateOffset(1) },
  { jobNumber: '512-1004C', pm: PM_MARIA, customer: 'Lockheed Martin', materialsManager: MM_JORDAN, pabsComplete: dateOffset(-8), shipToPm: dateOffset(2), shipToCustomer: dateOffset(3) },
  { jobNumber: '512-1005A', pm: PM_TOM, customer: 'Caterpillar', materialsManager: MM_ALEX, pabsComplete: dateOffset(-5), shipToPm: dateOffset(4), shipToCustomer: dateOffset(6) },
  { jobNumber: '512-1006B', pm: PM_SARA, customer: 'John Deere', materialsManager: MM_CASEY, pabsComplete: dateOffset(-3), shipToPm: dateOffset(7), shipToCustomer: dateOffset(9) },
  { jobNumber: '512-1007A', pm: PM_MARIA, customer: 'Honeywell', materialsManager: MM_ALEX, pabsComplete: dateOffset(-1), shipToPm: dateOffset(11), shipToCustomer: dateOffset(13) },

  // Next month
  { jobNumber: '512-1008D', pm: PM_TOM, customer: 'Siemens', materialsManager: MM_JORDAN, pabsComplete: dateOffset(2), shipToPm: dateOffset(18), shipToCustomer: dateOffset(20) },
  { jobNumber: '512-1009A', pm: PM_SARA, customer: 'Bosch', materialsManager: MM_CASEY, pabsComplete: dateOffset(5), shipToPm: dateOffset(25), shipToCustomer: dateOffset(27) },
  { jobNumber: '512-1010B', pm: PM_MARIA, customer: 'ABB Robotics', materialsManager: MM_JORDAN, pabsComplete: dateOffset(9), shipToPm: dateOffset(32), shipToCustomer: dateOffset(34) },

  // Spare Parts PM (Dana) — two jobs that land on the Spare Parts tab
  { jobNumber: 'SP-2001', pm: PM_DANA, customer: 'Ford — Spare Kit', materialsManager: MM_ALEX, pabsComplete: dateOffset(-4), shipToPm: dateOffset(3), shipToCustomer: dateOffset(5) },
  { jobNumber: 'SP-2002', pm: PM_DANA, customer: 'GM — Spare Kit', materialsManager: MM_CASEY, pabsComplete: dateOffset(1), shipToPm: dateOffset(14), shipToCustomer: dateOffset(16) },
]

/** Status overrides applied after import (canonical JobStatus values). */
export const DEMO_STATUSES: Record<string, 'none' | 'in_progress' | 'ready_to_ship' | 'shipped'> = {
  '512-1001A': 'in_progress',
  '512-1002B': 'ready_to_ship',
  '512-1003A': 'in_progress',
  '512-1004C': 'ready_to_ship',
  '512-1005A': 'in_progress',
  '512-1006B': 'none',
  '512-1010B': 'shipped', // → lands on the Archive tab
  'SP-2001': 'in_progress',
}

/** One job demonstrates a manual ship-date override with an explanatory note. */
export const DEMO_SHIP_OVERRIDE = {
  jobNumber: '512-1005A',
  shipDateOverride: dateOffset(8),
  shipDateOverrideNote: 'Customer requested a 2-day slip — dock space.',
}

/** One job shows the "binder printed" checkmark. */
export const DEMO_BINDER_JOB = '512-1004C'

/** One job carries a free-text note. */
export const DEMO_NOTE = {
  jobNumber: '512-1003A',
  text: 'Waiting on the final vendor quote before release.',
}

/** Actor stamped on board edits (notes/status) made by the seed. */
export const DEMO_ACTOR = { id: 'seed:demo', name: 'Demo Seed' }
