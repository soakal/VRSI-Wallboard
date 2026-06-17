import { Navigate } from 'react-big-calendar'
import { startOfWeek as dfStartOfWeek, addDays, getDay } from 'date-fns'
// react-big-calendar's MonthView is an INTERNAL module with no published types.
// It can break on any RBC minor/patch bump. Before upgrading RBC, verify the
// 2-week view still renders by checking: (a) 2 rows of 7 cells appear, (b) the
// "+N more" popup opens, (c) there are no React warnings in the console.
//
// We subclass it so the 2-week view inherits ALL of RBC's month rendering —
// the DateContentRow wiring, accessors/getters/components, the "+N more" popup
// overlay, and the row-height measurement — and override only the rendered date
// range. That is far safer than re-implementing the view by hand (mis-wiring
// DateContentRow's prop contract would crash the calendar on the kiosk).
// @ts-expect-error - internal RBC module, no type declarations published
import MonthViewDefault from 'react-big-calendar/lib/Month'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonthView: any = MonthViewDefault

const DAYS = 14

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Derive the configured week-start day (0=Sun, 1=Mon) from the RBC localizer the
// calendar was built with, so the 14-day window lines up with the rest of the app.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveWeekStartsOn(localizer: any): WeekStart {
  try {
    const v = localizer.startOfWeek()
    if (typeof v === 'number') return (v % 7) as WeekStart
    return getDay(v) as WeekStart
  } catch {
    return 0
  }
}

function twoWeekDays(date: Date, weekStartsOn: WeekStart): Date[] {
  const first = dfStartOfWeek(date, { weekStartsOn })
  return Array.from({ length: DAYS }, (_, i) => addDays(first, i))
}

export default class TwoWeekView extends MonthView {
  render() {
    // Base props are untyped (internal module); treat loosely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as any
    const { date, localizer, className } = self.props
    const days = twoWeekDays(date, deriveWeekStartsOn(localizer))
    const weeks = [days.slice(0, 7), days.slice(7, 14)]
    self._weekCount = weeks.length
    return (
      <div
        className={`rbc-month-view${className ? ' ' + className : ''}`}
        role="table"
        aria-label="Two Week View"
        ref={self.containerRef}
      >
        <div className="rbc-row rbc-month-header" role="row">
          {self.renderHeaders(weeks[0])}
        </div>
        {weeks.map(self.renderWeek)}
        {self.props.popup && self.renderOverlay()}
      </div>
    )
  }
}

// RBC view static contract. Our toolbar is hidden and the footer drives the date,
// but the view must still declare these (range is used to scope fetched events).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(TwoWeekView as any).range = (date: Date, { localizer }: any): { start: Date; end: Date } => {
  const days = twoWeekDays(date, deriveWeekStartsOn(localizer))
  return { start: days[0], end: days[days.length - 1] }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(TwoWeekView as any).navigate = (date: Date, action: string): Date => {
  switch (action) {
    case Navigate.PREVIOUS:
      return addDays(date, -DAYS)
    case Navigate.NEXT:
      return addDays(date, DAYS)
    default:
      return date
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(TwoWeekView as any).title = (date: Date, { localizer }: any): string => {
  const days = twoWeekDays(date, deriveWeekStartsOn(localizer))
  const start = days[0]
  const end = days[days.length - 1]
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`
}
