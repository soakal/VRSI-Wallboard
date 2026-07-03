import type { CalendarItem, CalendarEvent } from '../types/index';
import { unwrap } from './http';

export async function getCalendars(): Promise<CalendarItem[]> {
  const response = await fetch('/api/calendars');
  return unwrap<CalendarItem[]>(response);
}

export async function getEvents(
  calendarIds: string[],
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    calendars: calendarIds.join(','),
    start: start.toISOString(),
    end: end.toISOString()
  });
  const response = await fetch(`/api/events?${params}`);
  return unwrap<CalendarEvent[]>(response);
}
