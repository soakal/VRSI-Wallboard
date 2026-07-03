import { Router, Request, Response, NextFunction } from 'express';
import {
  listRecentFiles,
  listSites,
  listDrives,
  listFiles,
} from '../graph/sharepoint.js';
import { isAuthenticated } from '../auth/tokenRefresher.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { logger } from '../utils/logger.js';

export const sharepointRouter = Router();

// Graph IDs are opaque tokens (site/drive/item ids). Reject anything with path
// separators or traversal so a crafted siteId/driveId can't redirect the kiosk's
// delegated token to a different Graph path (e.g. siteId=x/../../me/messages).
const GRAPH_ID_RE = /^[A-Za-z0-9!$'()*+,.:;=@_~%-]+$/;
function isValidGraphId(id: string): boolean {
  return id.length > 0 && id.length <= 512 && GRAPH_ID_RE.test(id);
}

function authGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated()) {
    res.status(401).json({ error: { code: 'not_authenticated', message: 'Not authenticated' } });
    return;
  }
  next();
}

// requireAdminToken first: when TRUST_LOCALHOST is off (LAN exposure), these
// Graph-backed reads demand the admin token like the board/storage routes do,
// instead of leaking live M365 calendar/file data to any client that can reach
// the port. On the default localhost-trusted kiosk this is a no-op.
sharepointRouter.use(requireAdminToken);
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
      res.json({ data: normalized });
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
      res.json({ data: sites });
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
      if (!siteId || !isValidGraphId(siteId)) {
        res.status(400).json({ error: { code: 'invalid_site_id', message: 'A valid siteId query parameter is required' } });
        return;
      }
      logger.debug('GET /api/sharepoint/drives', { siteId });
      const drives = await listDrives(siteId);
      res.json({ data: drives });
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
      if (!isValidGraphId(siteId)) {
        res.status(400).json({ error: { code: 'invalid_site_id', message: 'Invalid siteId' } });
        return;
      }
      logger.debug('GET /api/sharepoint/sites/:siteId/drives', { siteId });
      const drives = await listDrives(siteId);
      res.json({ data: drives });
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
      if (!driveId || !isValidGraphId(driveId)) {
        res.status(400).json({ error: { code: 'invalid_drive_id', message: 'A valid driveId query parameter is required' } });
        return;
      }
      logger.debug('GET /api/sharepoint/files', { driveId });
      const files = await listFiles(driveId);
      res.json({ data: files });
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
      const { siteId, driveId } = req.params;
      if (!isValidGraphId(siteId) || !isValidGraphId(driveId)) {
        res.status(400).json({ error: { code: 'invalid_id', message: 'Invalid siteId or driveId' } });
        return;
      }
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
      res.json({ data: normalized });
    } catch (err) {
      next(err);
    }
  }
);
