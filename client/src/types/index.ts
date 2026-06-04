export interface AuthStatusResponse {
  authenticated: boolean;
  polling: boolean;
  userEmail?: string;
  needsReauth?: boolean;
}

export interface AuthStartResponse {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
}

export interface CalendarItem {
  id: string;
  name: string;
  color: string;
  hexColor: string;
  isDefault: boolean;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  bodyPreview: string;
  location?: string;
  /** Ship-date events: which Projects tab owns this job */
  boardTab?: 'project' | 'spare-parts' | 'archive';
}

export interface AppConfig {
  calendarIds: string[];
  displayMode: 'day' | 'week' | 'month';
  refreshInterval: number;
  theme: 'dark' | 'light';
  timezone: string;
  showWeekends: boolean;
  startHour: number;
  endHour: number;
  showAgendaRail: boolean;
  showWeather: boolean;
  showNextEvent: boolean;
  weatherLat: number | null;
  weatherLon: number | null;
  timeFormat: '12h' | '24h';
  tempUnit: 'F' | 'C';
  showRecentFiles: boolean;
  recentFilesCount: number;
  sharePointSiteIds: string[];
  fileOpenMode: 'same-window' | 'new-window';
}

export interface SharePointFile {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
  size: number;
  mimeType: string;
  siteName: string;
  driveId: string;
}

export interface SharePointSite {
  id: string;
  displayName: string;
  name: string;
  webUrl: string;
}

export interface SharePointDrive {
  id: string;
  name: string;
  driveType: string;
}

export const CALENDAR_COLORS: Record<string, string> = {
  auto: '#3b82f6',
  lightBlue: '#60a5fa',
  lightGreen: '#4ade80',
  lightOrange: '#fb923c',
  lightGray: '#9ca3af',
  lightYellow: '#facc15',
  lightTeal: '#2dd4bf',
  lightPink: '#f472b6',
  lightRed: '#f87171',
  maxBlue: '#1d4ed8',
  maxPurple: '#7c3aed',
  maxGreen: '#15803d',
  maxOrange: '#c2410c',
  maxRed: '#b91c1c'
};

export const DEFAULT_CONFIG: AppConfig = {
  calendarIds: [],
  displayMode: 'month',
  refreshInterval: 300,
  theme: 'dark',
  timezone: 'America/New_York',
  showWeekends: false,
  startHour: 7,
  endHour: 21,
  showAgendaRail: true,
  showWeather: true,
  showNextEvent: true,
  weatherLat: null,
  weatherLon: null,
  timeFormat: '12h',
  tempUnit: 'F',
  showRecentFiles: true,
  recentFilesCount: 8,
  sharePointSiteIds: [],
  fileOpenMode: 'same-window'
};
