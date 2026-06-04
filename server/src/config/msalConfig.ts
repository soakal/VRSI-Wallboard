import { PublicClientApplication, Configuration } from '@azure/msal-node';
import { logger } from '../utils/logger.js';

let msalInstance: PublicClientApplication | null = null;

export function getMsalInstance(): PublicClientApplication {
  if (msalInstance) {
    return msalInstance;
  }

  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId) {
    throw new Error('AZURE_CLIENT_ID environment variable is required');
  }
  if (!tenantId) {
    throw new Error('AZURE_TENANT_ID environment variable is required');
  }

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (!containsPii) {
            logger.debug(`[MSAL] ${message}`);
          }
        },
        piiLoggingEnabled: false,
        logLevel: 3, // Warning
      },
    },
  };

  msalInstance = new PublicClientApplication(config);
  logger.info('MSAL PublicClientApplication initialized');
  return msalInstance;
}
