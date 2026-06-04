import { Client, AuthProvider } from '@microsoft/microsoft-graph-client';
import { getCurrentAccessToken } from '../auth/tokenRefresher.js';
import { logger } from '../utils/logger.js';

export function getGraphClient(): Client {
  const authProvider: AuthProvider = (done) => {
    const token = getCurrentAccessToken();
    if (!token) {
      const err = new Error('No access token available — not authenticated');
      logger.error('Graph client: no access token');
      done(err, null);
      return;
    }
    done(null, token);
  };

  return Client.init({
    authProvider,
  });
}
