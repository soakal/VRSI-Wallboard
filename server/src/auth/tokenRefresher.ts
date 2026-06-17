import cron from 'node-cron';
import { loadTokens, saveTokens, TokenData } from './tokenStore.js';
import { logger } from '../utils/logger.js';

let currentAccessToken: string | null = null;
let isTestMode = process.env.DISABLE_AZURE === 'true';
// Set when a refresh fails permanently (invalid_grant) — the operator must
// re-run the device-code flow. Surfaced via /health so headless kiosks and
// external monitoring can detect the silent auth-failure state.
let needsReauth = false;

export function getCurrentAccessToken(): string | null {
  return currentAccessToken;
}

export function isAuthenticated(): boolean {
  return currentAccessToken !== null || isTestMode;
}

export function needsReauthentication(): boolean {
  return needsReauth;
}

export function setUnauthenticated(): void {
  currentAccessToken = null;
  logger.warn('Access token cleared — marked unauthenticated');
}

/**
 * Refresh with bounded exponential backoff on TRANSIENT failures only.
 * Permanent failures (invalid_grant) throw immediately so the caller can
 * flag re-auth instead of pointlessly retrying a dead token.
 */
async function refreshWithRetry(
  rt: string,
  maxAttempts = 4
): Promise<RefreshResponse> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await refreshViaEndpoint(rt);
    } catch (err) {
      lastErr = err;
      if (err instanceof RefreshError && err.permanent) throw err;
      if (attempt < maxAttempts) {
        const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
        logger.warn(
          `Token refresh transient failure (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
          { error: (err as Error).message }
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresOn: number;
}

/**
 * Distinguishes a permanent auth failure (refresh token revoked/expired/MFA —
 * `invalid_grant`) from a transient one (network error, Azure 5xx, throttling).
 * Permanent failures require human re-auth; transient ones should be retried.
 */
class RefreshError extends Error {
  constructor(message: string, public permanent: boolean) {
    super(message);
    this.name = 'RefreshError';
  }
}

async function refreshViaEndpoint(rt: string): Promise<RefreshResponse> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;

  if (!tenantId) throw new Error('AZURE_TENANT_ID is required');
  if (!clientId) throw new Error('AZURE_CLIENT_ID is required');

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: rt,
    scope:
      'Calendars.Read User.Read offline_access Files.Read.All Sites.Read.All',
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const { logNetworkRequest } = await import('../services/auditService.js');
    logNetworkRequest('POST', url, response.ok, response.status, 'OAuth token refresh');
  } catch (err) {
    const { logNetworkRequest } = await import('../services/auditService.js');
    logNetworkRequest('POST', url, false, undefined, 'OAuth token refresh failed');
    // Network-level failure (DNS, connection reset, Azure unreachable) — transient.
    throw new RefreshError(
      `Token refresh network error: ${(err as Error).message}`,
      false
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    // invalid_grant (400) = permanent: token revoked/expired/MFA, re-auth required.
    // 429 Too Many Requests = transient: Azure throttling, retry with backoff.
    // 5xx = transient Azure-side error, safe to retry.
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
    throw new RefreshError(
      `Token refresh failed: ${response.status} ${response.statusText} — ${errorText}`,
      permanent
    );
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? rt,
    expiresOn: Date.now() + json.expires_in * 1000,
  };
}

export async function initializeTokens(): Promise<boolean> {
  logger.info('Initializing tokens from stored data');

  if (isTestMode) {
    logger.warn('DISABLE_AZURE is enabled — using test mode (no real authentication)');
    currentAccessToken = 'test-token-mock';
    return true;
  }

  const stored: TokenData | null = loadTokens();
  if (!stored) {
    // In dev with no Azure credentials configured, auto-enable test mode so the
    // UI shows mock data without requiring DISABLE_AZURE=true to be set manually.
    if (process.env.NODE_ENV !== 'production' && !process.env.AZURE_TENANT_ID) {
      logger.warn('Dev mode: no Azure credentials found — auto-enabling test mode');
      isTestMode = true;
      process.env.DISABLE_AZURE = 'true';
      currentAccessToken = 'dev-auto-mock';
      return true;
    }
    logger.warn('No stored tokens found — authentication required');
    return false;
  }

  try {
    const refreshed = await refreshWithRetry(stored.refreshToken);
    currentAccessToken = refreshed.accessToken;
    needsReauth = false;

    saveTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresOn: refreshed.expiresOn,
    });

    logger.info('Tokens initialized and refreshed successfully');
    return true;
  } catch (err) {
    if (err instanceof RefreshError && err.permanent) {
      needsReauth = true;
      logger.error(
        'Stored refresh token is no longer valid (revoked/expired/MFA). ' +
          'Re-authentication required via /api/auth/start.',
        { error: err.message }
      );
    } else {
      logger.error('Failed to refresh stored tokens (transient)', { error: err });
      // On transient failure (not permanent invalid_grant), retry sooner than
      // the 55-min cron so a brief boot-time network blip doesn't leave the
      // kiosk dataless for nearly an hour.
      if (!needsReauth) {
        logger.info('Token init failed transiently — scheduling quick retry in 60s');
        setTimeout(() => {
          void quickRetryRefresh();
        }, 60_000);
      }
    }
    return false;
  }
}

/**
 * One-shot token refresh used by the post-boot quick-retry path. Mirrors the
 * cron's refresh-and-persist logic so a transient startup failure self-heals
 * without waiting for the 55-minute cron tick.
 */
async function quickRetryRefresh(): Promise<void> {
  try {
    const stored = loadTokens();
    if (!stored) {
      logger.warn('Quick retry: no stored tokens, cannot refresh');
      return;
    }
    const refreshed = await refreshWithRetry(stored.refreshToken);
    currentAccessToken = refreshed.accessToken;
    needsReauth = false;
    saveTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresOn: refreshed.expiresOn,
    });
    logger.info('Quick retry: access token refreshed successfully');
  } catch (e: unknown) {
    if (e instanceof RefreshError && e.permanent) {
      needsReauth = true;
      logger.error('Quick retry: refresh token permanently invalid — re-authentication required', {
        error: e.message,
      });
    } else {
      logger.error('Quick retry failed', { error: (e as Error).message });
    }
  }
}

export function startRefreshCron(): void {
  if (isTestMode) {
    logger.info('Test mode enabled — skipping token refresh cron');
    return;
  }

  // Every 55 minutes
  cron.schedule('*/55 * * * *', async () => {
    logger.info('Cron: refreshing access token');
    const stored = loadTokens();
    if (!stored) {
      logger.warn('Cron: no stored tokens, cannot refresh');
      setUnauthenticated();
      return;
    }

    try {
      const refreshed = await refreshWithRetry(stored.refreshToken);
      currentAccessToken = refreshed.accessToken;
      needsReauth = false;

      saveTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresOn: refreshed.expiresOn,
      });

      logger.info('Cron: access token refreshed successfully');
    } catch (err) {
      if (err instanceof RefreshError && err.permanent) {
        needsReauth = true;
        logger.error(
          'Cron: refresh token permanently invalid — re-authentication required ' +
            'via /api/auth/start (kiosk will show no live data until then).',
          { error: err.message }
        );
      } else {
        logger.error('Cron: token refresh failed after retries (transient)', {
          error: err,
        });
      }
      setUnauthenticated();
    }
  });

  logger.info('Token refresh cron started (every 55 minutes)');
}
