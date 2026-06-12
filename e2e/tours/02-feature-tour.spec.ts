import { test, expect, type Locator } from '@playwright/test'
import { makeShot } from '../lib/shot'
import { caption, clearCaption, beat } from '../lib/demo'

/**
 * TOUR 2 — Feature walkthrough on seeded demo data.
 *
 * Walks the whole app the way a person would, narrating each stop with an
 * on-screen caption and pausing so a viewer can read the screen (paced by
 * slowMo + beat()). A numbered screenshot is captured at each stop; the video
 * records the motion. Covers: the calendar (Day/Week/Month, month navigation,
 * clicking a ship-date event into the board), the agenda + user picker, every
 * Settings section, the Files show/hide toggle, the Monitoring / backup / audit
 * log, the Projects board tabs + job cards, and the Users view (who-you-are,
 * super users, spare-parts PM, tab colours).
 */

const PM_MARIA = 'maria.lopez@vrsi-demo.com'

test('feature tour — calendar, settings, files toggle, monitoring, board, users', async ({
  page,
}, info) => {
  const shot = makeShot(page, info, 'features')

  // Footer-scoped helpers (the desktop <footer> is the only <footer>; the mobile
  // bar is a <div>, so these never collide with the hidden mobile controls).
  const footer = page.locator('footer')
  const displaySelect = footer.locator('select').first()
  const userSelect = footer.locator('select').nth(1)
  // Both SettingsPanel and FileBrowserPanel use the same slide-over class, so
  // pin this to the one containing the "Settings" heading.
  const settingsPanel = page
    .locator('div.fixed.top-0.right-0.bottom-0')
    .filter({ has: page.getByRole('heading', { name: 'Settings' }) })

  const openSettings = async () => {
    await footer.getByRole('button', { name: '⚙ Settings' }).click()
    await expect(settingsPanel.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await beat(page, 600)
  }
  const expandSection = async (label: string) => {
    await settingsPanel.getByRole('button', { name: label, exact: true }).click()
  }

  // ── Calendar: Day / Week / Month ───────────────────────────────────────────
  await page.goto('/')
  await expect(page.locator('.rbc-calendar')).toBeVisible()
  await caption(page, 'The dashboard calendar — every job shows on its ship date')
  await displaySelect.selectOption('month')
  await expect(page.locator('.rbc-month-view')).toBeVisible()
  await beat(page)
  await shot('calendar-month')

  await caption(page, 'Switch the view: Day, Week, or Month')
  await displaySelect.selectOption('week')
  await beat(page)
  await shot('calendar-week')
  await displaySelect.selectOption('day')
  await beat(page)
  await shot('calendar-day')
  await displaySelect.selectOption('month')
  await beat(page, 800)

  // ── Month navigation: › then ‹ then Today ──────────────────────────────────
  await caption(page, 'Step through months with ‹ ›, or jump back with Today')
  await footer.getByRole('button', { name: 'Next month' }).click()
  await beat(page)
  await shot('calendar-next-month')
  await footer.getByRole('button', { name: 'Previous month' }).click()
  const todayBtn = footer.getByRole('button', { name: 'Today' })
  if (await todayBtn.isVisible().catch(() => false)) {
    await todayBtn.click()
  }
  await beat(page)
  await shot('calendar-today')

  // ── Click a ship-date event → routes into the Projects board ───────────────
  // The agenda rail renders each board ship-date as a clickable entry (role=button)
  // — a stable target, unlike the react-big-calendar grid which overlays its events.
  await caption(page, 'Click a ship date to open that job on the board')
  const shipEvent = page.locator('aside').getByRole('button', { name: /#(512|SP)-/ }).first()
  await expect(shipEvent).toBeVisible()
  await beat(page)
  await shipEvent.click()
  await expect(page).toHaveURL(/\/board/)
  await expect(page.getByRole('link', { name: /^Project/ })).toBeVisible()
  await caption(page, 'That job opens, ready to view or edit')
  await beat(page)
  await shot('event-opens-board')

  // ── Agenda rail follows the selected user ──────────────────────────────────
  await page.goto('/')
  await expect(page.locator('.rbc-calendar')).toBeVisible()
  await caption(page, 'Pick a person — the agenda shows only their jobs')
  await userSelect.selectOption({ label: PM_MARIA })
  await beat(page)
  await shot('agenda-filtered-by-user')
  await userSelect.selectOption('') // back to All users
  await beat(page, 700)

  // ── Settings: expand every section + screenshot top and bottom ─────────────
  await caption(page, 'Settings — calendars, display, widgets, time, location')
  await openSettings()
  await expandSection('Location')
  await expandSection('Files')
  await beat(page)
  await shot('settings-top')
  // Scroll the panel's inner scroll area to reveal the lower sections.
  await settingsPanel.locator('div.overflow-y-auto').first().evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await caption(page, 'Scroll for Location, Files, and About & Updates')
  await beat(page)
  await shot('settings-bottom')

  // ── Files show/hide toggle: turn the Files browser OFF, save, prove it's gone
  await caption(page, 'Turn the Files browser off…')
  const filesSwitch = settingsPanel
    .locator('label', { hasText: 'Files browser' })
    .getByRole('switch')
  await expect(footer.getByRole('button', { name: 'Files' })).toBeVisible() // present before
  await filesSwitch.click()
  await beat(page)
  await settingsPanel.getByRole('button', { name: 'Save' }).click()
  // Saving persists showFiles=false → the footer re-renders without the Files
  // button (toHaveCount retries until the config refetch lands).
  await expect(footer.getByRole('button', { name: 'Files' })).toHaveCount(0) // gone after
  await caption(page, '…and the Files button disappears from the footer')
  await beat(page)
  await shot('files-button-hidden')

  // ── Monitoring / System panel: Backup, Activity log, IT summary ────────────
  await caption(page, 'The System panel — back up the database in one click')
  await footer.getByRole('button', { name: 'System' }).click()
  const monitor = page.getByRole('heading', { name: 'System & IT Report' })
  await expect(monitor).toBeVisible()
  await expect(page.getByRole('button', { name: 'Backup now' })).toBeVisible()
  await beat(page)
  await shot('monitoring-backup')

  await page.getByRole('button', { name: 'Backup now' }).click()
  // A backup row (wallboard-*.db) should appear once the backup completes.
  await expect(page.getByText(/wallboard.*\.db/).first()).toBeVisible({ timeout: 30_000 })
  await caption(page, 'A timestamped backup is saved')
  await beat(page)
  await shot('monitoring-backup-made')

  await caption(page, 'Every file and network action is logged for IT')
  await page.getByRole('button', { name: 'Activity log' }).click()
  await beat(page)
  await shot('monitoring-activity-log')
  await caption(page, 'A plain-language safety summary you can hand to IT')
  await page.getByRole('button', { name: 'IT safety summary' }).click()
  await beat(page)
  await shot('monitoring-it-summary')
  // The monitoring panel is an <aside>; scope Close to it (the closed Settings
  // panel also has a "Close" button still in the DOM).
  await page.locator('aside').getByRole('button', { name: 'Close' }).click()

  // ── Projects board: tabs ───────────────────────────────────────────────────
  await page.goto('/board')
  await expect(page.getByRole('link', { name: /^Project/ })).toBeVisible()
  await caption(page, 'The Projects board — jobs grouped into tabs')
  await beat(page)
  await shot('board-project-tab')

  await caption(page, 'Spare Parts and Archive tabs')
  await page.getByRole('link', { name: /^Spare Parts/ }).click()
  await expect(page).toHaveURL(/spare-parts/)
  await beat(page)
  await shot('board-spare-parts-tab')

  await page.getByRole('link', { name: /^Archive/ }).click()
  await expect(page).toHaveURL(/archive/)
  await beat(page)
  await shot('board-archive-tab')

  // ── Board: pick a user → cards become editable; show the NEW filter ────────
  await page.getByRole('link', { name: /^Project/ }).click()
  await caption(page, 'Pick who you are to edit your jobs')
  const boardUserSelect = page.locator('header select').first()
  await boardUserSelect.selectOption({ label: PM_MARIA }).catch(() => undefined)
  await beat(page)
  await shot('board-user-selected')

  // Best-effort: open/toggle a control on a job card (don't fail the tour if the
  // card layout shifts — the screenshot still documents the editable board).
  const card: Locator = page.locator('[id^="job-card-"]').first()
  if (await card.isVisible().catch(() => false)) {
    await card.scrollIntoViewIfNeeded().catch(() => undefined)
    await caption(page, 'Each card: status, binder, ship date, and notes')
    await beat(page)
    await shot('board-job-card')
    const checkbox = card.getByRole('checkbox').first()
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.click().catch(() => undefined)
      await beat(page)
      await shot('board-status-changed')
    }
  }

  const newFilter = page.getByRole('button', { name: /New \(\d+\)/ })
  if (await newFilter.isVisible().catch(() => false)) {
    await caption(page, 'Filter to only the newly imported jobs')
    await newFilter.click()
    await beat(page)
    await shot('board-new-filter')
  }

  // ── Users view: who-you-are, super users, spare-parts PM, tab colours ──────
  await page.goto('/board/users')
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Super Users' })).toBeVisible()
  await caption(page, 'Users — who you are, and super users who see every job')
  await beat(page)
  await shot('users-view')

  // Add a super user live (dropdown → Add → "Saved!").
  const superSection = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Super Users' }) })
    .last()
  const addSelect = superSection.locator('select')
  const options = await addSelect.locator('option').allTextContents()
  const pick = options.find((o) => o && !o.startsWith('—'))
  if (pick) {
    await caption(page, 'Add a super user — saved instantly')
    await addSelect.selectOption({ label: pick })
    await superSection.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Saved!').first()).toBeVisible()
    await beat(page)
    await shot('users-super-added')
  }

  // Tab status colours.
  await page.getByRole('heading', { name: 'Tab Status Colors' }).scrollIntoViewIfNeeded()
  await caption(page, 'Choose the status colours used across the board tabs')
  await beat(page)
  await shot('users-tab-colors')
  await caption(page, 'That is the full VRSI WallBoard tour')
  await beat(page, 2500)
  await clearCaption(page)
})
