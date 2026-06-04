import 'dotenv/config';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { initializeTokens, startRefreshCron, isAuthenticated, needsReauthentication } from './auth/tokenRefresher.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { calendarsRouter } from './routes/calendars.js';
import { eventsRouter } from './routes/events.js';
import { configRouter } from './routes/config.js';
import { sharepointRouter } from './routes/sharepoint.js';
import { boardRouter } from './routes/board.js';
import { storageRouter } from './routes/storage.js';
import { getPersistence } from './storage/factory.js';
import { resolveDataDir, resolveLogsDir, resolveBackupDir } from './lib/paths.js';
import { auditApiMiddleware } from './middleware/auditMiddleware.js';
import { logAudit } from './services/auditService.js';
import { runBackup } from './services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fail fast at boot if required environment is missing, instead of throwing
 * deep inside a request handler or cron job later.
 */
function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const azureDisabled = process.env.DISABLE_AZURE === 'true';
  const missing: string[] = [];

  if (!azureDisabled) {
    if (!process.env.ENCRYPTION_SECRET) missing.push('ENCRYPTION_SECRET');
    if (!process.env.AZURE_TENANT_ID) missing.push('AZURE_TENANT_ID');
    if (!process.env.AZURE_CLIENT_ID) missing.push('AZURE_CLIENT_ID');
  }

  if (isProd && !process.env.CORS_ORIGIN) {
    // Default to same-origin localhost; kiosk is always served from port 3001.
    process.env.CORS_ORIGIN = 'http://localhost:3001';
  }

  if (missing.length > 0) {
    logger.error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Refusing to start. Set them in .env (see .env.example).`
    );
    process.exit(1);
  }
}

validateEnv();

const app = express();

// Security & parsing middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.open-meteo.com'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// Default to the kiosk's own origin in all modes — never '*'.
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3001';

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(auditApiMiddleware);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/config', configRouter);
app.use('/api/sharepoint', sharepointRouter);
app.use('/api/board', boardRouter);
app.use('/api/storage', storageRouter);

// Simple health route (outside configRouter to avoid auth dependency)
app.get('/health', (_req: Request, res: Response) => {
  // Report readiness, not just liveness, so external monitoring can detect the
  // silent auth-failure state (token refresh died, kiosk showing no live data).
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    authenticated: isAuthenticated(),
    needsReauth: needsReauthentication(),
    testMode: process.env.DISABLE_AZURE === 'true',
    // Initialization is "done" once the token is resolved one way or another:
    // test mode, a live token, or a known re-auth state. Lets auto-update.sh
    // poll for ready:true to know token init finished (even if needsReauth).
    ready:
      process.env.DISABLE_AZURE === 'true' ||
      isAuthenticated() ||
      needsReauthentication(),
  });
});

// Static file serving — active whenever client/dist exists (production or explicit NODE_ENV)
import { existsSync } from 'fs';

// Unknown /api/* routes must return JSON 404, never the SPA index.html or a
// redirect to Vite — otherwise the client tries to JSON.parse HTML.
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (existsSync(path.join(clientDistPath, 'index.html'))) {
  app.use(express.static(clientDistPath));

  // SPA fallback: serve index.html for any unmatched route
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else if (process.env.NODE_ENV !== 'production') {
  // Dev mode without a built client: redirect SPA routes to the Vite dev server
  // so localhost:3001/board works the same as localhost:5173/board
  app.get('*', (req: Request, res: Response) => {
    res.redirect(`http://localhost:5173${req.path}`);
  });
}

// Error handler must be last
app.use(errorHandler);

async function bootstrap(): Promise<void> {
  const port = parseInt(process.env.PORT ?? '3001', 10);

  logger.info('VRSI WallBoard server starting up...', {
    dataDir: resolveDataDir(),
    storage: 'local',
  });
  getPersistence();
  logAudit('system', 'VRSI WallBoard server started', resolveDataDir(), true);
  logAudit(
    'system',
    `Mode: ${process.env.DISABLE_AZURE === 'true' ? 'standalone (no Microsoft cloud)' : 'Azure enabled'}; logs: ${resolveLogsDir()}; backups: ${resolveBackupDir()}`,
    undefined,
    true
  );

  const authenticated = await initializeTokens();

  if (authenticated) {
    logger.info('Tokens initialized successfully, starting refresh cron');
    startRefreshCron();
  } else {
    logger.warn(
      'Could not initialize tokens from storage — authentication required via /api/auth/start'
    );
  }

  // Bind to localhost only — the kiosk is a local machine; LAN access is not needed.
  const bindHost = process.env.BIND_HOST ?? '127.0.0.1';
  const httpServer = app.listen(port, bindHost, () => {
    logger.info(`Server listening on ${bindHost}:${port}`, {
      port,
      host: bindHost,
      env: process.env.NODE_ENV ?? 'development',
      authenticated,
    });
  });

  let shuttingDown = false;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, creating shutdown backup`);

    // Start the force-exit watchdog only now that shutdown has been triggered.
    const forceExitTimer = setTimeout(() => {
      logger.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 30_000);
    forceExitTimer.unref();

    httpServer.close();

    try {
      await runBackup('server_shutdown');
    } catch (e) {
      logger.warn('Shutdown backup error', { error: e });
    }

    try {
      getPersistence().close();
    } catch (e) {
      logger.warn('Error closing database', { error: e });
    }

    logAudit('system', `Server stopped (${signal})`, resolveDataDir(), true);
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
}

bootstrap().catch((err: unknown) => {
  logger.error('Fatal error during bootstrap', { error: err });
  process.exit(1);
});
