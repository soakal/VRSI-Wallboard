import { getGraphClient } from './graphClient.js';
import { getMockEvents } from './mockData.js';
import { logger } from '../utils/logger.js';

export interface GraphEventDateTime {
  dateTime: string;
  timeZone: string;
}

export interface GraphEvent {
  id: string;
  subject: string;
  start: GraphEventDateTime;
  end: GraphEventDateTime;
  isAllDay: boolean;
  location?: { displayName: string };
  organizer?: { emailAddress: { name: string; address: string } };
  bodyPreview?: string;
  webLink?: string;
  calendarId: string;
}

export async function listEvents(
  calendarIds: string[],
  start: string,
  end: string
): Promise<GraphEvent[]> {
  if (process.env.DISABLE_AZURE === 'true') {
    const { logNetworkRequest } = await import('../services/auditService.js');
    logNetworkRequest('GET', 'https://graph.microsoft.com/v1.0/me/calendarView', true, 200, 'test mode mock — no cloud call');
    logger.info('Test mode: returning mock events');
    const mockEvents = getMockEvents();
    // calendarIds may be empty when no calendars have been selected yet in config;
    // fall back to a stable mock id so calendarId is never undefined.
    const fallbackId = 'calendar-personal';
    return mockEvents.map((event, index) => ({
      ...event,
      isAllDay: false,
      calendarId:
        calendarIds.length > 0
          ? calendarIds[index % calendarIds.length]
          : fallbackId,
    }));
  }

  logger.debug('Fetching events from Graph API', {
    calendarCount: calendarIds.length,
    start,
    end,
  });

  const { logNetworkRequest } = await import('../services/auditService.js');
  logNetworkRequest('GET', 'https://graph.microsoft.com/v1.0/me/calendars/{id}/calendarView', true, undefined, 'Microsoft Graph calendar');

  const client = getGraphClient();

  const results = await Promise.allSettled(
    calendarIds.map(async (calendarId) => {
      const response = await client
        .api(`/me/calendars/${calendarId}/calendarView`)
        .query({
          startDateTime: start,
          endDateTime: end,
        })
        .select(
          'id,subject,start,end,isAllDay,location,organizer,bodyPreview,webLink'
        )
        .orderby('start/dateTime')
        .top(100)
        .get() as { value: Omit<GraphEvent, 'calendarId'>[] };

      return response.value.map((event) => ({
        ...event,
        calendarId,
      }));
    })
  );

  const allEvents: GraphEvent[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allEvents.push(...result.value);
    } else {
      logger.warn('Failed to fetch events for a calendar', {
        reason: result.reason,
      });
    }
  }

  allEvents.sort((a, b) => {
    const aTime = new Date(a.start.dateTime).getTime();
    const bTime = new Date(b.start.dateTime).getTime();
    return aTime - bTime;
  });

  logger.info(`Fetched ${allEvents.length} total events across all calendars`);
  return allEvents;
}
