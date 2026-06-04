import { getGraphClient } from './graphClient.js';
import { mockCalendars } from './mockData.js';
import { logger } from '../utils/logger.js';

export interface GraphCalendar {
  id: string;
  name: string;
  color: string;
  hexColor: string;
  isDefaultCalendar: boolean;
}

export async function listCalendars(): Promise<GraphCalendar[]> {
  if (process.env.DISABLE_AZURE === 'true') {
    const { logNetworkRequest } = await import('../services/auditService.js');
    logNetworkRequest('GET', 'https://graph.microsoft.com/v1.0/me/calendars', true, 200, 'test mode mock — no cloud call');
    logger.info('Test mode: returning mock calendars');
    return mockCalendars;
  }

  const { logNetworkRequest } = await import('../services/auditService.js');
  logNetworkRequest('GET', 'https://graph.microsoft.com/v1.0/me/calendars', true, undefined, 'Microsoft Graph calendars');

  logger.debug('Fetching calendars from Graph API');
  const client = getGraphClient();

  const response = await client
    .api('/me/calendars')
    .select('id,name,color,hexColor,isDefaultCalendar')
    .get() as { value: GraphCalendar[] };

  logger.info(`Fetched ${response.value.length} calendars`);
  return response.value;
}
