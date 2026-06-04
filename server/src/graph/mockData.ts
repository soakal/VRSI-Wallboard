import { GraphCalendar } from './calendars.js';

export interface MockEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: { name: string; address: string } };
  bodyPreview: string;
  isOnlineMeeting: boolean;
}

export interface MockFile {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
}

export const mockCalendars: GraphCalendar[] = [
  {
    id: 'calendar-personal',
    name: 'Calendar',
    color: 'auto',
    hexColor: '#0078D4',
    isDefaultCalendar: true,
  },
  {
    id: 'calendar-team',
    name: 'Team Calendar',
    color: 'auto',
    hexColor: '#107C10',
    isDefaultCalendar: false,
  },
];

export function getMockEvents(): MockEvent[] {
  return [];
}

export const mockFiles: MockFile[] = [
  {
    id: 'file-1',
    name: 'Project Plan.docx',
    webUrl: 'https://sharepoint.example.com/files/project-plan',
    lastModifiedDateTime: new Date().toISOString(),
  },
  {
    id: 'file-2',
    name: 'Budget 2026.xlsx',
    webUrl: 'https://sharepoint.example.com/files/budget-2026',
    lastModifiedDateTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'file-3',
    name: 'Team Handbook.pdf',
    webUrl: 'https://sharepoint.example.com/files/handbook',
    lastModifiedDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
