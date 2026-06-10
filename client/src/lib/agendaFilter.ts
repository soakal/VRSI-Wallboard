import { BoardUser, BoardConfig } from '@vrsi/wallboard-shared';
import { samePerson } from '@vrsi/person-identity';
import type { CalendarEvent } from '../types/index';

/**
 * Single source of truth for "whose agenda is this".
 *
 * Super users (by role from the live users list, or by name in the configured
 * superUsers list) see everything. Everyone else — pm, materials, AND manual —
 * sees only board jobs where they are the PM or the Materials Manager.
 * Matching uses the person's NAME against both job fields, never the role:
 * roles persisted in localStorage can go stale, and real people are PM on
 * some jobs and MM on others.
 */
export function isSuperUser(user: BoardUser | null, config: BoardConfig): boolean {
  if (!user) return false;
  if (user.role === 'super') return true;
  return (config.superUsers ?? []).some((s) => samePerson(s, user.name));
}

/** True when the board ship-date event belongs to this person (as PM or MM). */
export function eventBelongsToUser(ev: CalendarEvent, user: BoardUser): boolean {
  return (
    (!!ev.jobPm && samePerson(ev.jobPm, user.name)) ||
    (!!ev.jobMm && samePerson(ev.jobMm, user.name))
  );
}

/**
 * Agenda events for the selected user. No selection or super user → all
 * events. Any other selection → only their own board jobs. Non-board events
 * (Outlook calendars) are never filtered.
 */
export function filterAgendaEvents(
  events: CalendarEvent[],
  user: BoardUser | null,
  config: BoardConfig,
): CalendarEvent[] {
  if (!user || isSuperUser(user, config)) return events;
  return events.filter((ev) => ev.calendarId !== 'board-jobs' || eventBelongsToUser(ev, user));
}
