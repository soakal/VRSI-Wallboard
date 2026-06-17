import { logger } from '../utils/logger.js';
import { getPersistence } from '../storage/factory.js';

export interface CalendarConfig {
  enabledCalendarIds: string[];
  daysToShow: number;
  showAllDayEvents: boolean;
  showDeclinedEvents: boolean;
}

export interface DisplayConfig {
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  theme: 'dark' | 'light' | 'auto';
  refreshIntervalSeconds: number;
}

export interface SharePointConfig {
  enableRecentFiles: boolean;
  recentFilesCount: number;
  defaultSiteId: string | null;
  defaultDriveId: string | null;
}

/**
 * Persists all client UI-only settings that have no natural home in the other
 * nested config objects.  Stored under the "ui" key in config.json.
 */
export interface UiConfig {
  displayMode: 'day' | 'week' | 'month' | 'twoWeek';
  showWeekends: boolean;
  startHour: number;
  endHour: number;
  showAgendaRail: boolean;
  showNextEvent: boolean;
  weatherLat: number | null;
  weatherLon: number | null;
  tempUnit: 'F' | 'C';
  showFiles: boolean;
  fileOpenMode: 'same-window' | 'new-window';
  sharePointSiteIds: string[];
}

export interface AppConfig {
  calendar: CalendarConfig;
  display: DisplayConfig;
  sharepoint: SharePointConfig;
  ui: UiConfig;
  showWeather: boolean;
  weatherLocation: string;
  showClock: boolean;
  showDate: boolean;
  panels: string[];
}

const DEFAULT_CONFIG: AppConfig = {
  calendar: {
    enabledCalendarIds: [],
    daysToShow: 7,
    showAllDayEvents: true,
    showDeclinedEvents: false,
  },
  display: {
    timezone: 'America/New_York',
    dateFormat: 'MMMM D, YYYY',
    timeFormat: '12h',
    theme: 'dark',
    refreshIntervalSeconds: 300,
  },
  sharepoint: {
    enableRecentFiles: false,
    recentFilesCount: 10,
    defaultSiteId: null,
    defaultDriveId: null,
  },
  ui: {
    displayMode: 'twoWeek',
    showWeekends: false,
    startHour: 7,
    endHour: 21,
    showAgendaRail: true,
    showNextEvent: true,
    weatherLat: 42.3709,
    weatherLon: -83.4702,
    tempUnit: 'F',
    showFiles: false,
    fileOpenMode: 'same-window',
    sharePointSiteIds: [],
  },
  showWeather: true,
  weatherLocation: '',
  showClock: true,
  showDate: true,
  panels: ['clock', 'calendar'],
};

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const stored = getPersistence().loadAppConfig() as Partial<AppConfig> | null;
    if (stored) {
      cachedConfig = deepMerge(DEFAULT_CONFIG, stored);
      logger.info('Config loaded from SQLite');
    } else {
      cachedConfig = { ...DEFAULT_CONFIG };
      logger.info('No config stored, using defaults');
    }
  } catch (err) {
    logger.error('Failed to load config, using defaults', { error: err });
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  cachedConfig = deepMerge(current, partial);
  getPersistence().saveAppConfig(cachedConfig);
  logger.info('Config updated and saved to SQLite');

  return cachedConfig;
}

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceVal = source[key];
      const targetVal = target[key];
      if (
        sourceVal !== null &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal !== null &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetVal as object,
          sourceVal as Partial<object>
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceVal;
      }
    }
  }
  return result;
}
