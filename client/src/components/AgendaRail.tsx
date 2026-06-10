import React from 'react';
import { CalendarEvent } from '../types/index';

interface AgendaRailProps {
  events: CalendarEvent[];
  showWeekends?: boolean;
  className?: string;
  onSelectEvent?: (event: CalendarEvent) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatSectionDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/** How many days ahead the agenda looks (today + the next 13). */
const AGENDA_DAYS = 14;

const AgendaRail: React.FC<AgendaRailProps> = ({
  events,
  showWeekends = true,
  className = '',
  onSelectEvent,
}) => {
  const visibleEvents = showWeekends
    ? events
    : events.filter((ev) => {
        const day = new Date(ev.startDateTime).getDay();
        return day !== 0 && day !== 6;
      });
  const now = new Date();
  const todayStart = startOfDay(now);

  const sortGroup = (group: CalendarEvent[]) =>
    group.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
    });

  const sections: { key: string; label: string; events: CalendarEvent[] }[] = [];
  for (let i = 0; i < AGENDA_DAYS; i++) {
    const dayStart = addDays(todayStart, i);
    const dayEnd = addDays(todayStart, i + 1);

    const dayEvents = visibleEvents.filter((ev) => {
      const start = new Date(ev.startDateTime);
      const end = new Date(ev.endDateTime);
      if (start < dayStart || start >= dayEnd) return false;
      // Today: drop timed events that already ended
      if (i === 0 && !ev.isAllDay && end <= now) return false;
      return true;
    });
    if (dayEvents.length === 0) continue;

    sortGroup(dayEvents);
    const label =
      i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatSectionDate(dayStart);
    sections.push({
      key: dayStart.toISOString().slice(0, 10),
      label: i <= 1 ? `${label} — ${formatSectionDate(dayStart)}` : label,
      events: dayEvents,
    });
  }

  const renderEvent = (event: CalendarEvent) => {
    const start = new Date(event.startDateTime);
    const end = new Date(event.endDateTime);
    const inProgress = !event.isAllDay && start <= now && end > now;
    const accent = event.calendarColor || '#3b82f6';

    const secondaryParts: string[] = [];
    if (event.bodyPreview) secondaryParts.push(event.bodyPreview);
    else if (event.location) secondaryParts.push(event.location);
    if (event.calendarId !== 'board-jobs' && event.calendarName) {
      secondaryParts.push(event.calendarName);
    }

    const isBoardJob = event.calendarId === 'board-jobs';

    return (
      <div
        key={event.id}
        role={isBoardJob && onSelectEvent ? 'button' : undefined}
        tabIndex={isBoardJob && onSelectEvent ? 0 : undefined}
        onClick={() => isBoardJob && onSelectEvent?.(event)}
        onKeyDown={(e) => {
          if (isBoardJob && onSelectEvent && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelectEvent(event);
          }
        }}
        className={`flex items-stretch gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
          isBoardJob && onSelectEvent ? 'cursor-pointer hover:bg-white/10' : 'hover:bg-white/5'
        }`}
      >
        {/* Time column */}
        <div className="flex w-14 flex-shrink-0 flex-col items-end justify-center text-right">
          {event.isAllDay ? (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
              All day
            </span>
          ) : (
            <>
              <span className="text-xs font-semibold leading-tight text-slate-200">
                {formatTime(event.startDateTime)}
              </span>
              <span className="text-[11px] leading-tight text-slate-500">
                {formatTime(event.endDateTime)}
              </span>
            </>
          )}
        </div>

        {/* Colored accent bar */}
        <span
          className="w-1 flex-shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-medium leading-tight text-slate-100">
              {event.subject}
            </p>
            {event.isNew && (
              <span className="flex-shrink-0 text-[10px] font-bold uppercase text-red-400">
                New
              </span>
            )}
            {inProgress && (
              <span className="flex-shrink-0 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                Now
              </span>
            )}
          </div>
          {secondaryParts.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {secondaryParts.join(' · ')}
            </p>
          )}
        </div>
      </div>
    );
  };

  const isEmpty = sections.length === 0;

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
            <p className="text-sm font-medium text-slate-400">Nothing on the agenda</p>
            <p className="text-xs text-slate-600">No events in the next {AGENDA_DAYS} days</p>
          </div>
        )}

        {sections.map((section) => (
          <section key={section.key}>
            <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              {section.label}
            </h3>
            <div className="space-y-1">
              {section.events.map(renderEvent)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default AgendaRail;
