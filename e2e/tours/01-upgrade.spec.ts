import { test, expect } from '@playwright/test'
import { makeShot } from '../lib/shot'
import { caption, clearCaption, beat } from '../lib/demo'

/**
 * TOUR 1 — In-app upgrade flow (Settings → About & Updates).
 *
 * This drives the real Update UI but NEVER runs a real update: both
 * /api/update/check and /api/update/run are intercepted, so the kiosk's
 * updater script is never launched and the machine is never touched.
 *
 * The OS install and the script-fallback update are Windows PowerShell / UAC
 * steps a browser cannot perform — those are documented in e2e/UPGRADE-RUNBOOK.md.
 *
 * Paced + captioned (slowMo + caption()/beat()) so it can actually be watched.
 */

const CURRENT = '0.9.2'
const NEXT = '0.9.3'
const REPO = 'https://github.com/soakal/VRSI-Wallboard'

test('upgrade flow — version, update banner, start, auto-reload', async ({ page }, info) => {
  const shot = makeShot(page, info, 'upgrade')

  // Mutable state lets one route handler answer differently as the story advances.
  let phase: 'up-to-date' | 'available' | 'installed' = 'up-to-date'

  await page.route('**/api/update/check**', async (route) => {
    const body =
      phase === 'installed'
        ? {
            data: {
              currentVersion: NEXT,
              currentReleaseUrl: `${REPO}/releases/tag/v${NEXT}`,
              latestVersion: NEXT,
              updateAvailable: false,
              releaseUrl: `${REPO}/releases/tag/v${NEXT}`,
              releaseName: `v${NEXT}`,
            },
          }
        : phase === 'available'
          ? {
              data: {
                currentVersion: CURRENT,
                currentReleaseUrl: `${REPO}/releases/tag/v${CURRENT}`,
                latestVersion: NEXT,
                updateAvailable: true,
                releaseUrl: `${REPO}/releases/tag/v${NEXT}`,
                releaseName: `v${NEXT}`,
              },
            }
          : {
              data: {
                currentVersion: CURRENT,
                currentReleaseUrl: `${REPO}/releases/tag/v${CURRENT}`,
                latestVersion: CURRENT,
                updateAvailable: false,
                releaseUrl: `${REPO}/releases/tag/v${CURRENT}`,
                releaseName: `v${CURRENT}`,
              },
            }
    await route.fulfill({ json: body })
  })

  // Stub the actual update trigger so nothing runs on this machine.
  await page.route('**/api/update/run', async (route) => {
    await route.fulfill({ json: { data: { started: true } } })
  })

  // The "Update now?" confirm() must be accepted for the run to fire.
  page.on('dialog', (d) => d.accept())

  const openSettings = async () => {
    await page.getByRole('button', { name: '⚙ Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await beat(page, 600) // let the slide-over animation settle
  }
  const closeSettings = async () => {
    await page.getByRole('button', { name: 'Discard' }).click()
  }

  // ── 1. Up to date ──────────────────────────────────────────────────────────
  await page.goto('/')
  await caption(page, 'Keeping VRSI WallBoard up to date — open Settings')
  await beat(page)
  await openSettings()
  await caption(page, 'Settings → About & Updates shows the version you are running')
  await expect(page.getByText(`v${CURRENT}`, { exact: true })).toBeVisible()
  await expect(page.getByText('You are on the latest version.')).toBeVisible()
  const notesLink = page.getByRole('link', { name: /Release notes/ })
  await expect(notesLink).toBeVisible()
  await notesLink.scrollIntoViewIfNeeded()
  await beat(page)
  await shot('about-up-to-date')
  await closeSettings()

  // ── 2. Update available ────────────────────────────────────────────────────
  phase = 'available'
  await page.reload()
  await caption(page, `A new version (v${NEXT}) is available — a banner appears`)
  await beat(page)
  await openSettings()
  await caption(page, 'About & Updates now offers the update')
  await expect(page.getByText(`Update available: v${NEXT}`, { exact: true })).toBeVisible()
  const updateBtn = page.getByRole('button', { name: `Update to ${NEXT}` })
  await expect(updateBtn).toBeVisible()
  await updateBtn.scrollIntoViewIfNeeded()
  await beat(page)
  await shot('update-available')

  // ── 3. Start the update (stubbed — no real updater runs) ────────────────────
  await caption(page, 'Click Update — the board updates itself and restarts')
  await beat(page)
  await updateBtn.click()
  const startedMsg = page.getByText(/Update started\./)
  await expect(startedMsg).toBeVisible()
  await startedMsg.scrollIntoViewIfNeeded()
  await beat(page)
  await shot('update-started')

  // ── 4. Auto-reload once the server reports the new version ───────────────────
  // The panel polls /api/update/check every 10s and reloads when the version
  // changes. Flip the stub to the installed version and wait for the reload.
  phase = 'installed'
  // The app fires window.location.reload() within ~10s of the version changing.
  // Wait for that load event; if the poll outpaces our wait, force the reload so
  // the final screenshot still reflects the upgraded state.
  await page.waitForEvent('load', { timeout: 15_000 }).catch(() => page.reload())
  await caption(page, `Done — the board is back up on v${NEXT}`)
  await beat(page)
  await openSettings()
  const newVersion = page.getByText(`v${NEXT}`, { exact: true })
  await expect(newVersion).toBeVisible()
  await newVersion.scrollIntoViewIfNeeded()
  await beat(page)
  await shot('after-upgrade')
  await clearCaption(page)
})
