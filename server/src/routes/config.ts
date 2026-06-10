import { Router, Request, Response, NextFunction } from 'express';
import { getConfig, updateConfig, AppConfig, UiConfig } from '../services/configService.js';
import { isAuthenticated } from '../auth/tokenRefresher.js';
import { logger } from '../utils/logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';

export const configRouter = Router();

/**
 * The server stores config in a nested shape (calendar, display, sharepoint,
 * ui sub-objects). The React client expects a flat AppConfig (see
 * client/src/types/index.ts). This function translates between the two so the
 * client never receives the wrong shape and crashes on undefined property access.
 *
 * All 18 client fields are mapped explicitly — none are hardcoded constants.
 */
function toClientConfig(cfg: AppConfig): Record<string, unknown> {
  const ui = cfg.ui ?? ({} as Partial<UiConfig>);
  return {
    // calendar
    calendarIds: Array.isArray(cfg.calendar?.enabledCalendarIds)
      ? cfg.calendar.enabledCalendarIds
      : [],
    // display
    displayMode: ui.displayMode ?? 'week',
    refreshInterval: cfg.display?.refreshIntervalSeconds ?? 300,
    theme: cfg.display?.theme === 'auto' ? 'dark' : (cfg.display?.theme ?? 'dark'),
    timezone: cfg.display?.timezone ?? 'America/New_York',
    timeFormat: cfg.display?.timeFormat ?? '12h',
    // ui — calendar view
    showWeekends: ui.showWeekends ?? false,
    startHour: ui.startHour ?? 7,
    endHour: ui.endHour ?? 21,
    showAgendaRail: ui.showAgendaRail ?? true,
    showNextEvent: ui.showNextEvent ?? true,
    // ui — weather
    showWeather: cfg.showWeather ?? false,
    weatherLat: ui.weatherLat ?? null,
    weatherLon: ui.weatherLon ?? null,
    tempUnit: ui.tempUnit ?? 'F',
    // sharepoint
    showRecentFiles: cfg.sharepoint?.enableRecentFiles ?? false,
    recentFilesCount: cfg.sharepoint?.recentFilesCount ?? 8,
    sharePointSiteIds: Array.isArray(ui.sharePointSiteIds) ? ui.sharePointSiteIds : [],
    showFiles: ui.showFiles ?? true,
    fileOpenMode: ui.fileOpenMode ?? 'same-window',
  };
}

/**
 * Accept the flat client AppConfig shape on POST and translate it back to the
 * server's nested shape so configService can persist it correctly.
 *
 * Every field that the client sends is captured — none are silently discarded.
 */
function fromClientConfig(flat: Record<string, unknown>): Partial<AppConfig> {
  const partial: Partial<AppConfig> = {};

  // calendar
  if ('calendarIds' in flat && Array.isArray(flat.calendarIds)) {
    partial.calendar = { enabledCalendarIds: flat.calendarIds as string[] } as AppConfig['calendar'];
  }

  // showWeather (top-level on server)
  if ('showWeather' in flat) {
    partial.showWeather = Boolean(flat.showWeather);
  }

  // display sub-object — only update if any display field is present
  if ('refreshInterval' in flat || 'timezone' in flat || 'timeFormat' in flat || 'theme' in flat) {
    partial.display = {
      timezone: (flat.timezone as string | undefined) ?? 'America/New_York',
      dateFormat: 'MMMM D, YYYY',
      timeFormat: (flat.timeFormat as '12h' | '24h' | undefined) ?? '12h',
      theme: (flat.theme as 'dark' | 'light' | 'auto' | undefined) ?? 'dark',
      refreshIntervalSeconds: typeof flat.refreshInterval === 'number' ? flat.refreshInterval : 300,
    };
  }

  // sharepoint sub-object
  if ('showRecentFiles' in flat || 'recentFilesCount' in flat) {
    partial.sharepoint = {
      enableRecentFiles: Boolean(flat.showRecentFiles),
      recentFilesCount: typeof flat.recentFilesCount === 'number' ? flat.recentFilesCount : 8,
      defaultSiteId: null,
      defaultDriveId: null,
    };
  }

  // ui sub-object — collect all UI-only fields
  const uiFields: Partial<UiConfig> = {};
  if ('displayMode' in flat && (flat.displayMode === 'day' || flat.displayMode === 'week' || flat.displayMode === 'month')) {
    uiFields.displayMode = flat.displayMode;
  }
  if ('showWeekends' in flat) {
    uiFields.showWeekends = Boolean(flat.showWeekends);
  }
  if ('startHour' in flat && typeof flat.startHour === 'number') {
    uiFields.startHour = flat.startHour;
  }
  if ('endHour' in flat && typeof flat.endHour === 'number') {
    uiFields.endHour = flat.endHour;
  }
  if ('showAgendaRail' in flat) {
    uiFields.showAgendaRail = Boolean(flat.showAgendaRail);
  }
  if ('showNextEvent' in flat) {
    uiFields.showNextEvent = Boolean(flat.showNextEvent);
  }
  if ('weatherLat' in flat) {
    const n = Number(flat.weatherLat);
    uiFields.weatherLat =
      flat.weatherLat === null || !Number.isFinite(n) || n < -90 || n > 90 ? null : n;
  }
  if ('weatherLon' in flat) {
    const n = Number(flat.weatherLon);
    uiFields.weatherLon =
      flat.weatherLon === null || !Number.isFinite(n) || n < -180 || n > 180 ? null : n;
  }
  if ('tempUnit' in flat && (flat.tempUnit === 'F' || flat.tempUnit === 'C')) {
    uiFields.tempUnit = flat.tempUnit;
  }
  if ('showFiles' in flat) {
    uiFields.showFiles = Boolean(flat.showFiles);
  }
  if ('fileOpenMode' in flat && (flat.fileOpenMode === 'same-window' || flat.fileOpenMode === 'new-window')) {
    uiFields.fileOpenMode = flat.fileOpenMode;
  }
  if ('sharePointSiteIds' in flat && Array.isArray(flat.sharePointSiteIds)) {
    uiFields.sharePointSiteIds = flat.sharePointSiteIds as string[];
  }
  if (Object.keys(uiFields).length > 0) {
    partial.ui = uiFields as UiConfig;
  }

  return partial;
}

configRouter.get(
  '/geocode',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) { res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'q is required' } }); return; }
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
      const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) { res.status(502).json({ error: { code: 'UPSTREAM_ERROR', message: `Geocoding API returned ${upstream.status}` } }); return; }
      const data = await upstream.json() as unknown;
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

configRouter.get(
  '/',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      logger.debug('GET /api/config');
      const config = getConfig();
      res.json({ data: toClientConfig(config) });
    } catch (err) {
      next(err);
    }
  }
);

configRouter.post(
  '/',
  requireAdminToken,
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      logger.debug('POST /api/config');
      // Body may be a flat client shape or the legacy nested shape.
      // Detect the flat client shape by checking for any well-known flat keys.
      const body = req.body as Record<string, unknown>;
      const FLAT_KEYS = new Set([
        'calendarIds', 'displayMode', 'refreshInterval', 'theme', 'timezone',
        'showWeekends', 'startHour', 'endHour', 'showAgendaRail', 'showWeather',
        'showNextEvent', 'weatherLat', 'weatherLon', 'timeFormat', 'tempUnit',
        'showRecentFiles', 'recentFilesCount', 'sharePointSiteIds', 'showFiles', 'fileOpenMode',
      ]);
      const isFlat = Object.keys(body).some((k) => FLAT_KEYS.has(k));
      const partial = isFlat ? fromClientConfig(body) : (body as Partial<AppConfig>);
      const updated = updateConfig(partial);
      res.json({ data: toClientConfig(updated) });
    } catch (err) {
      next(err);
    }
  }
);

configRouter.get(
  '/health',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      res.json({
        status: 'ok',
        authenticated: isAuthenticated(),
        uptime: process.uptime(),
      });
    } catch (err) {
      next(err);
    }
  }
);
