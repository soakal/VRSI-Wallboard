import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, addDays, formatISO } from 'date-fns';
import { getEvents } from '../api/calendarApi';
import type { CalendarEvent } from '../types/index';

export function useEvents(
  calendarIds: string[],
  enabled: boolean,
  refreshSec: number,
  displayMode: 'day' | 'week' | 'month' | 'twoWeek' = 'week',
  viewDate?: Date
): {
  events: CalendarEvent[];
  isLoading: boolean;
  isError: boolean;
  dataUpdatedAt: number;
} {
  const viewDateMs = viewDate?.getTime();
  const { weekStart, weekEnd } = useMemo(() => {
    const now = new Date();
    const anchor = viewDateMs !== undefined ? new Date(viewDateMs) : now;
    // Fetch from the 1st of this month (the agenda rail shows past-due ship
    // dates from earlier in the month) through 45 days from today — enough
    // for the month grid, 3 weeks of week-view look-ahead, and the agenda's
    // rest-of-month horizon, in every display mode. When the calendar is
    // navigated to another month, stretch the window so it covers that whole
    // month too (earlier of the two starts, later of the two ends).
    let start = startOfMonth(anchor < now ? anchor : now);
    const aheadEnd = addDays(now, 45);
    const anchorEnd = endOfMonth(anchor);
    let end = anchorEnd > aheadEnd ? anchorEnd : aheadEnd;
    // The 2-week view can start a week before the anchor and run 14 days out, which
    // may fall outside the month window above — widen by a week of slack each side.
    if (displayMode === 'twoWeek') {
      const twoWeekStart = addDays(anchor, -7);
      if (twoWeekStart < start) start = twoWeekStart;
      const twoWeekEnd = addDays(anchor, 15);
      if (twoWeekEnd > end) end = twoWeekEnd;
    }
    return {
      weekStart: formatISO(start),
      weekEnd: formatISO(end),
    };
  }, [displayMode, viewDateMs]);

  // Allow calendarIds to be empty — the server will fall back to all available
  // calendars. Guarding on length > 0 prevents events from ever loading when
  // the user hasn't explicitly picked calendars yet (the default config state).
  const safeCalendarIds = Array.isArray(calendarIds) ? calendarIds : [];

  const q = useQuery({
    queryKey: ['events', safeCalendarIds, weekStart, weekEnd],
    queryFn: () => getEvents(safeCalendarIds, new Date(weekStart), new Date(weekEnd)),
    enabled: enabled,
    refetchInterval: refreshSec * 1000,
  });

  return {
    // Ensure we always return an array even if the query returns something unexpected
    events: Array.isArray(q.data) ? q.data : [],
    isLoading: q.isLoading,
    isError: q.isError,
    dataUpdatedAt: q.dataUpdatedAt ?? 0,
  };
}
