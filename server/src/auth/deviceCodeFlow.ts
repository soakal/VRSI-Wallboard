import { DeviceCodeRequest, AuthenticationResult } from '@azure/msal-node';
import { getMsalInstance } from '../config/msalConfig.js';
import { saveTokens } from './tokenStore.js';
import { logger } from '../utils/logger.js';

const SCOPES = [
  'Calendars.Read',
  'User.Read',
  'offline_access',
  'Files.Read.All',
  'Sites.Read.All',
];

export interface AuthStartResponse {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}

let _isPolling = false;
let _codeInfo: AuthStartResponse | null = null;

export function isPolling(): boolean {
  return _isPolling;
}

export async function startDeviceCodeFlow(): Promise<{
  codeInfo: AuthStartResponse;
  completionPromise: Promise<boolean>;
}> {
  _codeInfo = null;
  _isPolling = false;

  const msalApp = getMsalInstance();

  const completionPromise = new Promise<boolean>((resolve) => {
    const request: DeviceCodeRequest = {
      scopes: SCOPES,
      deviceCodeCallback: (response) => {
        logger.info('Device code received', { userCode: response.userCode });
        _codeInfo = {
          userCode: response.userCode,
          deviceCode: response.deviceCode,
          verificationUri: response.verificationUri,
          expiresIn: response.expiresIn,
          interval: response.interval,
          message: response.message,
        };
        _isPolling = true;
      },
    };

    msalApp
      .acquireTokenByDeviceCode(request)
      .then((result: AuthenticationResult | null) => {
        if (!result) {
          logger.warn('Device code flow returned null result');
          _isPolling = false;
          resolve(false);
          return;
        }

        logger.info('Device code flow succeeded, extracting refresh token');

        try {
          const cache = msalApp.getTokenCache();
          const serialized = cache.serialize();
          const cacheObj = JSON.parse(serialized) as {
            RefreshToken?: Record<string, { secret: string }>;
          };

          const refreshTokenEntries = cacheObj.RefreshToken ?? {};
          const firstEntry = Object.values(refreshTokenEntries)[0];

          if (!firstEntry?.secret) {
            logger.error('No refresh token found in MSAL cache');
            _isPolling = false;
            resolve(false);
            return;
          }

          const refreshToken = firstEntry.secret;
          const accessToken = result.accessToken;
          const expiresOn = result.expiresOn
            ? result.expiresOn.getTime()
            : Date.now() + 3600 * 1000;

          saveTokens({ refreshToken, accessToken, expiresOn });
          logger.info('Tokens saved after device code flow');
          _isPolling = false;
          resolve(true);
        } catch (err) {
          logger.error('Failed to extract/save tokens', { error: err });
          _isPolling = false;
          resolve(false);
        }
      })
      .catch((err: unknown) => {
        logger.error('Device code flow error', { error: err });
        _isPolling = false;
        resolve(false);
      });
  });

  // Wait for deviceCodeCallback to populate _codeInfo. Reject after 30s if
  // MSAL never delivers a device code (e.g. network failure), so the caller
  // gets an error response instead of a permanently hung request.
  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (_codeInfo !== null) {
        clearInterval(interval);
        resolve();
        return;
      }
      if (Date.now() - start > 30_000) {
        clearInterval(interval);
        _isPolling = false;
        reject(new Error('Timed out waiting for device code from Microsoft'));
      }
    }, 100);
  });

  return { codeInfo: _codeInfo!, completionPromise };
}
