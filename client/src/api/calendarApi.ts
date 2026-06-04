import type { CalendarItem, CalendarEvent } from '../types/index';

export async function getCalendars(): Promise<CalendarItem[]> {
  const response = await fetch('/api/calendars');
  if (!response.ok) {
    throw new Error('Failed to get calendars');
  }
  return response.json();
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
  if (!response.ok) {
    throw new Error('Failed to get events');
  }
  return response.json();
}
