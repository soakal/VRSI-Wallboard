import { defineConfig, devices } from '@playwright/test'
import path from 'path'

/**
 * VRSI WallBoard — Playwright visual tours.
 *
 * Two tours run against a freshly-booted server in mock mode (DISABLE_AZURE):
 *   1. tours/01-upgrade.spec.ts     — the in-app Update flow (no real update runs)
 *   2. tours/02-feature-tour.spec.ts — a guided walk through every feature
 *
 * Both record video + screenshots into e2e/artifacts/ so the run can be shown
 * to IT / stakeholders. A throwaway data dir (e2e/.demo-data) keeps real
 * dev/kiosk data untouched; global-setup wipes it before each run, and the
 * `seed` project fills it with demo jobs via the normal /api/board/import API.
 *
 * Prerequisites (see e2e/README.md):
 *   1. npm install
 *   2. npx playwright install chromium
 *   3. npm run build           (npm start serves client/dist + server/dist)
 *   4. Make sure nothing else is already listening on port 3001.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const DEMO_DATA_DIR = path.resolve(__dirname, '.demo-data')
const ARTIFACTS = path.resolve(__dirname, 'artifacts')
// The demo runs on its own port so it never clashes with a live board / tray
// already serving on 3001. The client uses relative URLs, so any port works.
const PORT = 3100
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: __dirname,
  // One worker — the tours share a single seeded server and tell a linear story.
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(ARTIFACTS, 'test-results'),
  // After the run, transcode the recordings to universal MP4 (H.264) with
  // friendly names in e2e/artifacts/videos/.
  globalTeardown: path.resolve(__dirname, 'export-videos.cjs'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(ARTIFACTS, 'report'), open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    // Record at full viewport size (crisp, no scaling distortion).
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    screenshot: 'on',
    trace: 'on-first-retry',
    // Slow every click/select/scroll so the recording is watchable, not a blur.
    launchOptions: { slowMo: 350 },
  },
  projects: [
    // Seeds demo data once; both tours depend on it.
    { name: 'seed', testMatch: /seed\/seed\.setup\.ts/ },
    {
      name: 'tours',
      testMatch: /tours\/.*\.spec\.ts/,
      dependencies: ['seed'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Wipe the demo data dir first (Playwright starts the webServer before
    // globalSetup, so the reset can't live there) — then boot the server.
    command: 'node e2e/reset-data.cjs && npm start',
    cwd: REPO_ROOT,
    url: `${BASE_URL}/health`,
    timeout: 120_000,
    // Always boot our own isolated server so the demo data dir applies and we
    // never seed/pollute a server an engineer happens to have running.
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
      DISABLE_AZURE: 'true',
      TRUST_LOCALHOST: 'true',
      CORS_ORIGIN: BASE_URL,
      DATA_DIR: DEMO_DATA_DIR,
      BACKUP_DIR: path.join(DEMO_DATA_DIR, 'backups'),
      LOGS_DIR: path.join(DEMO_DATA_DIR, 'logs'),
    },
  },
})
