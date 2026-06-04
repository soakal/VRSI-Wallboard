import { Router, Request, Response, NextFunction } from 'express';
import { startDeviceCodeFlow, isPolling } from '../auth/deviceCodeFlow.js';
import { isAuthenticated, needsReauthentication } from '../auth/tokenRefresher.js';
import { getGraphClient } from '../graph/graphClient.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

authRouter.post(
  '/start',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (process.env.DISABLE_AZURE === 'true') {
        logger.warn('Test mode: skipping device code flow');
        res.json({
          deviceCode: 'test-device-code',
          userCode: 'TEST-1234',
          verificationUri: 'https://microsoft.com/devicelogin',
          expiresIn: 900,
          interval: 5,
          message: 'Test mode: no real authentication required',
        });
        return;
      }

      if (isPolling()) {
        res.status(409).json({ error: 'Device code flow already in progress' });
        return;
      }

      logger.info('Starting device code flow');
      const { codeInfo } = await startDeviceCodeFlow();
      res.json(codeInfo);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.get(
  '/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authenticated = isAuthenticated();
      const polling = isPolling();
      let userEmail: string | null = null;

      if (process.env.DISABLE_AZURE === 'true') {
        logger.debug('Test mode: returning mock auth status');
        res.json({
          authenticated: true,
          polling: false,
          userEmail: 'test@example.com',
          needsReauth: false,
        });
        return;
      }

      if (authenticated) {
        try {
          const client = getGraphClient();
          const user = await client
            .api('/me')
            .select('mail,userPrincipalName')
            .get() as { mail?: string; userPrincipalName?: string };
          userEmail = user.mail ?? user.userPrincipalName ?? null;
        } catch (err) {
          logger.warn('Could not fetch user email for status', { error: err });
        }
      }

      res.json({
        authenticated,
        polling,
        userEmail,
        needsReauth: needsReauthentication(),
      });
    } catch (err) {
      next(err);
    }
  }
);
