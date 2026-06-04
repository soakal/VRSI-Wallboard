import { Router, Request, Response, NextFunction } from 'express';
import {
  listRecentFiles,
  listSites,
  listDrives,
  listFiles,
} from '../graph/sharepoint.js';
import { isAuthenticated } from '../auth/tokenRefresher.js';
import { logger } from '../utils/logger.js';

export const sharepointRouter = Router();

function authGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}

sharepointRouter.use(authGuard);

sharepointRouter.get(
  '/recent',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const countParam = req.query.count as string | undefined;
      const count = countParam ? parseInt(countParam, 10) : 20;
      logger.debug('GET /api/sharepoint/recent', { count });
      const files = await listRecentFiles(count);
      // Normalize to the flat SharePointFile shape the client expects so that
      // fields like mimeType, siteName, driveId are never undefined in renders.
      const normalized = files.map((f) => ({
        id: f.id,
        name: f.name,
        webUrl: f.webUrl ?? '',
        lastModifiedDateTime: f.lastModifiedDateTime ?? new Date().toISOString(),
        size: f.size ?? 0,
        mimeType: f.file?.mimeType ?? '',
        siteName: 'OneDrive',
        driveId: '',
      }));
      res.json(normalized);
    } catch (err) {
      next(err);
    }
  }
);

sharepointRouter.get(
  '/sites',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.debug('GET /api/sharepoint/sites');
      const sites = await listSites();
      res.json(sites);
    } catch (err) {
      next(err);
    }
  }
);

sharepointRouter.get(
  '/drives',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const siteId = req.query.siteId as string | undefined;
      if (!siteId) {
        res.status(400).json({ error: 'siteId query parameter is required' });
        return;
      }
      logger.debug('GET /api/sharepoint/drives', { siteId });
      const drives = await listDrives(siteId);
      res.json(drives);
    } catch (err) {
      next(err);
    }
  }
);

// RESTful nested route: GET /sites/:siteId/drives
// (matches the URL pattern the FileBrowserPanel client uses)
sharepointRouter.get(
  '/sites/:siteId/drives',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { siteId } = req.params;
      logger.debug('GET /api/sharepoint/sites/:siteId/drives', { siteId });
      const drives = await listDrives(siteId);
      res.json(drives);
    } catch (err) {
      next(err);
    }
  }
);

sharepointRouter.get(
  '/files',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const driveId = req.query.driveId as string | undefined;
      if (!driveId) {
        res.status(400).json({ error: 'driveId query parameter is required' });
        return;
      }
      logger.debug('GET /api/sharepoint/files', { driveId });
      const files = await listFiles(driveId);
      res.json(files);
    } catch (err) {
      next(err);
    }
  }
);

// RESTful nested route: GET /sites/:siteId/drives/:driveId/files
// (matches the URL pattern the FileBrowserPanel client uses)
sharepointRouter.get(
  '/sites/:siteId/drives/:driveId/files',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { driveId } = req.params;
      logger.debug('GET /api/sharepoint/sites/:siteId/drives/:driveId/files', { driveId });
      const files = await listFiles(driveId);
      // Normalize to the flat SharePointFile shape the client expects
      const normalized = files.map((f) => ({
        id: f.id,
        name: f.name,
        webUrl: f.webUrl ?? '',
        lastModifiedDateTime: f.lastModifiedDateTime ?? new Date().toISOString(),
        size: f.size ?? 0,
        mimeType: f.file?.mimeType ?? '',
        siteName: '',
        driveId,
      }));
      res.json(normalized);
    } catch (err) {
      next(err);
    }
  }
);
