import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../types/index';

interface NextEventBadgeProps {
  events: CalendarEvent[];
}

function getNextEvent(events: CalendarEvent[]): { event: CalendarEvent; minutesAway: number } | null {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let closest: { event: CalendarEvent; minutesAway: number } | null = null;

  for (const ev of events) {
    if (ev.isAllDay) continue;
    const start = new Date(ev.startDateTime);
    if (start <= now || start > cutoff) continue;
    const minutesAway = Math.round((start.getTime() - now.getTime()) / 60000);
    if (!closest || minutesAway < closest.minutesAway) {
      closest = { event: ev, minutesAway };
    }
  }

  return closest;
}

function formatCountdown(minutes: number): string {
  if (minutes < 60) return `in ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
}

const NextEventBadge: React.FC<NextEventBadgeProps> = ({ events }) => {
  const [next, setNext] = useState(() => getNextEvent(events));

  useEffect(() => {
    setNext(getNextEvent(events));
    const id = setInterval(() => {
      setNext(getNextEvent(events));
    }, 30_000);
    return () => clearInterval(id);
  }, [events]);

  if (!next) return null;

  const { event, minutesAway } = next;

  return (
    <div
      className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
      style={{ backgroundColor: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)' }}
    >
      <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
      <span className="text-blue-200 truncate max-w-[200px]">{event.subject}</span>
      <span className="text-blue-400 whitespace-nowrap">{formatCountdown(minutesAway)}</span>
    </div>
  );
};

export default NextEventBadge;
