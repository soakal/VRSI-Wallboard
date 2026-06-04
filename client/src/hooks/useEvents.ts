import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfWeek, startOfMonth, addDays, formatISO } from 'date-fns';
import { getEvents } from '../api/calendarApi';
import type { CalendarEvent } from '../types/index';

export function useEvents(
  calendarIds: string[],
  enabled: boolean,
  refreshSec: number,
  displayMode: 'day' | 'week' | 'month' = 'week'
): {
  events: CalendarEvent[];
  isLoading: boolean;
  isError: boolean;
  dataUpdatedAt: number;
} {
  const { weekStart, weekEnd } = useMemo(() => {
    const now = new Date();
    // Fetch a range that fully covers the visible period for the current view:
    //  - month: from the 1st of this month, +45 days (covers a 6-week grid)
    //  - week:  from the start of this week, +21 days (3 weeks of look-ahead)
    //  - day:   from the start of this week, +14 days
    let start: Date;
    let span: number;
    if (displayMode === 'month') {
      start = startOfMonth(now);
      span = 45;
    } else if (displayMode === 'week') {
      start = startOfWeek(now, { weekStartsOn: 0 });
      span = 21;
    } else {
      start = startOfWeek(now, { weekStartsOn: 0 });
      span = 14;
    }
    const end = addDays(start, span);
    return {
      weekStart: formatISO(start),
      weekEnd: formatISO(end),
    };
  }, [displayMode]);

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
