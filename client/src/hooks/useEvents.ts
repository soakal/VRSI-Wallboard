import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfMonth, addDays, formatISO } from 'date-fns';
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
    // Fetch from the 1st of this month (the agenda rail shows past-due ship
    // dates from earlier in the month) through 45 days from today — enough
    // for the month grid, 3 weeks of week-view look-ahead, and the agenda's
    // rest-of-month horizon, in every display mode.
    const start = startOfMonth(now);
    const end = addDays(now, 45);
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
