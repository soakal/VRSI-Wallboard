import { Router, Request, Response, NextFunction } from 'express';
import { listCalendars } from '../graph/calendars.js';
import { isAuthenticated } from '../auth/tokenRefresher.js';
import { logger } from '../utils/logger.js';

export const calendarsRouter = Router();

calendarsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAuthenticated()) {
        res.status(401).json({ error: 'Not authenticated' });
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

      res.json(mapped);
    } catch (err) {
      next(err);
    }
  }
);
