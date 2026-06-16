import { Router, Request, Response, NextFunction } from 'express';
import { listEvents } from '../graph/events.js';
import { listCalendars, GraphCalendar } from '../graph/calendars.js';
import { isAuthenticated } from '../auth/tokenRefresher.js';
import { getConfig } from '../services/configService.js';
import { logger } from '../utils/logger.js';
import {
  getMergedJobs,
  getBoardConfig,
  getJobBoardTab,
  formatJobPmLabel,
} from '../services/boardService.js';

export const eventsRouter = Router();

/**
 * Shape returned to the client — must match client/src/types/index.ts CalendarEvent.
 * The Graph API returns start/end as nested objects; we flatten them here so the
 * client can use startDateTime / endDateTime directly without crashing.
 */
export interface NormalizedEvent {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  location?: string;
  bodyPreview: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  /** Present for ship-date events from the project board */
  boardTab?: 'project' | 'spare-parts' | 'archive' | 'blocked';
  /** Ship-date events: true when the job is newly imported */
  isNew?: boolean;
  /** Ship-date events: canonical PM / Materials Manager for per-user filtering */
  jobPm?: string;
  jobMm?: string;
}

eventsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAuthenticated()) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const config = getConfig();

      // Determine date range
      const now = new Date();
      const startParam = (req.query.start as string | undefined) ?? now.toISOString();

      const defaultEnd = new Date(now);
      defaultEnd.setDate(defaultEnd.getDate() + config.calendar.daysToShow);
      const endParam =
        (req.query.end as string | undefined) ?? defaultEnd.toISOString();

      logger.debug('GET /api/events', { start: startParam, end: endParam });

      const calendars = await listCalendars();
      const calendarIds =
        config.calendar.enabledCalendarIds.length > 0
          ? config.calendar.enabledCalendarIds
          : calendars.map((c) => c.id);
      const events = await listEvents(calendarIds, startParam, endParam);

      const calendarMap = new Map<string, GraphCalendar>();
      for (const cal of calendars) {
        calendarMap.set(cal.id, cal);
      }

      const normalized: NormalizedEvent[] = events.map((event) => {
        const cal = calendarMap.get(event.calendarId);
        return {
          id: event.id,
          subject: event.subject,
          // Flatten nested Graph dateTime objects into the flat strings the client expects
          startDateTime: event.start.dateTime,
          endDateTime: event.end.dateTime,
          isAllDay: event.isAllDay,
          location: event.location?.displayName,
          bodyPreview: event.bodyPreview ?? '',
          calendarId: event.calendarId ?? '',
          calendarName: cal?.name ?? 'Unknown',
          calendarColor: cal?.hexColor ?? '#3b82f6',
        };
      });

      // Append board job ship dates as all-day calendar events
      try {
        const boardJobs = getMergedJobs();
        const boardConfig = getBoardConfig();
        const { statusColors } = boardConfig;
        const statusLabels: Record<string, string> = {
          none: 'Not Started', in_progress: 'In Progress',
          ready_to_ship: 'Ready to Ship', shipped: 'Shipped',
        };

        // Only show jobs whose ship date falls within the requested view range,
        // and only actionable statuses (in_progress / ready_to_ship). Shipped
        // jobs go to the Archive tab; none-status jobs with a date add noise.
        const rangeStart = startParam.slice(0, 10); // 'YYYY-MM-DD'
        const rangeEnd = endParam.slice(0, 10);

        for (const job of boardJobs) {
          try {
            if (!job?.jobNumber || !job.effectiveShipDate) continue;
            if (job.status === 'shipped') continue;
            if (job.effectiveShipDate < rangeStart || job.effectiveShipDate > rangeEnd) continue;
            const customer =
              typeof job.customer === 'string' ? job.customer.trim() : '';
            const pmLabel = formatJobPmLabel(
              typeof job.pm === 'string' ? job.pm : String(job.pm ?? ''),
            );
            const boardTab = getJobBoardTab(job, boardConfig);
            const subjectParts = [`#${job.jobNumber}`];
            if (customer) subjectParts.push(customer);
            subjectParts.push(pmLabel);
            normalized.push({
              id: `board-ship-${job.jobNumber}`,
              subject: subjectParts.join(' · '),
              startDateTime: `${job.effectiveShipDate}T00:00:00`,
              endDateTime: `${job.effectiveShipDate}T23:59:59`,
              isAllDay: true,
              bodyPreview: statusLabels[job.status] ?? job.status,
              calendarId: 'board-jobs',
              calendarName: 'Ship Dates',
              calendarColor: statusColors[job.status] ?? '#475569',
              boardTab,
              isNew: job.isNew,
              jobPm: job.pm,
              jobMm: job.materialsManager,
            });
          } catch (jobErr) {
            logger.warn('Skipped board ship-date event for job', {
              jobNumber: job?.jobNumber,
              error: jobErr instanceof Error ? jobErr.message : String(jobErr),
            });
          }
        }
      } catch {
        // Board data may not exist yet — skip silently
      }

      res.json(normalized);
    } catch (err) {
      next(err);
    }
  }
);
