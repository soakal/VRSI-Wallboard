import { Router, Request, Response, NextFunction } from 'express';
import { listCalendars } from '../graph/calendars.js';
import { isAuthenticated } from '../auth/tokenRefresher.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { logger } from '../utils/logger.js';

export const calendarsRouter = Router();

// Gated when TRUST_LOCALHOST is off (no-op on the localhost-trusted kiosk).
calendarsRouter.use(requireAdminToken);

calendarsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAuthenticated()) {
        res.status(401).json({ error: { code: 'not_authenticated', message: 'Not authenticated' } });
        return;
      }

      logger.debug('GET /api/calendars');
      const calendars = await listCalendars();

      const mapped = calendars.map((cal) => ({
        id: cal.id,
        name: cal.name,
        color: cal.color,
        hexColor: cal.hexColor,
        isDefault: cal.isDefaultCalendar,
      }));

      res.json({ data: mapped });
    } catch (err) {
      next(err);
    }
  }
);
