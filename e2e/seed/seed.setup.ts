import { test, expect } from '@playwright/test'
import {
  DEMO_JOBS,
  DEMO_STATUSES,
  DEMO_SHIP_OVERRIDE,
  DEMO_BINDER_JOB,
  DEMO_NOTE,
  DEMO_ACTOR,
  SPARE_PM,
} from './demo-jobs'

/**
 * Seeds the demo board through the SAME public API the real import uses
 * (POST /api/board/import → applyBoardImport merge logic) — never by writing
 * to SQLite directly, so the StorageProvider rule (§2) holds. Requests go to
 * 127.0.0.1, which the server trusts without an admin token (TRUST_LOCALHOST).
 */
test('seed demo data', async ({ request }) => {
  // 1. Wait for the server to report ready (mock mode is ready immediately).
  await expect
    .poll(
      async () => {
        try {
          const res = await request.get('/health')
          if (!res.ok()) return false
          const body = (await res.json()) as { ready?: boolean }
          return body.ready === true
        } catch {
          return false
        }
      },
      { timeout: 30_000, message: 'server /health never became ready' },
    )
    .toBe(true)

  // 2. Import the jobs (no-file JSON path → normal merge).
  const importRes = await request.post('/api/board/import', { data: { jobs: DEMO_JOBS } })
  expect(importRes.ok(), `import failed: ${importRes.status()} ${await importRes.text()}`).toBeTruthy()

  // 3. Route Dana's jobs to the Spare Parts tab.
  const cfgRes = await request.post('/api/board/config', { data: { spareCarrier: SPARE_PM } })
  expect(cfgRes.ok()).toBeTruthy()

  // 3b. Make the demo order-independent: ensure the Files button is shown at the
  // start of the tour even if a prior run left showFiles=false in a reused DB.
  const uiRes = await request.post('/api/config', { data: { showFiles: true } })
  expect(uiRes.ok()).toBeTruthy()

  // 4. Spread statuses across the jobs (canonical JobStatus values).
  for (const [jobNumber, status] of Object.entries(DEMO_STATUSES)) {
    const res = await request.patch(`/api/board/jobs/${encodeURIComponent(jobNumber)}/status`, {
      data: { status, actor: DEMO_ACTOR },
    })
    expect(res.ok(), `status ${jobNumber}→${status} failed: ${res.status()}`).toBeTruthy()
  }

  // 5. One manual ship-date override (with note).
  const ovRes = await request.patch(
    `/api/board/jobs/${encodeURIComponent(DEMO_SHIP_OVERRIDE.jobNumber)}/ship-date`,
    {
      data: {
        shipDateOverride: DEMO_SHIP_OVERRIDE.shipDateOverride,
        shipDateOverrideNote: DEMO_SHIP_OVERRIDE.shipDateOverrideNote,
        actor: DEMO_ACTOR,
      },
    },
  )
  expect(ovRes.ok()).toBeTruthy()

  // 6. One "binder printed" checkmark.
  const binderRes = await request.patch(
    `/api/board/jobs/${encodeURIComponent(DEMO_BINDER_JOB)}/binder-printed`,
    { data: { binderPrinted: true, actor: DEMO_ACTOR } },
  )
  expect(binderRes.ok()).toBeTruthy()

  // 7. One free-text note.
  const noteRes = await request.post(
    `/api/board/jobs/${encodeURIComponent(DEMO_NOTE.jobNumber)}/notes`,
    { data: { text: DEMO_NOTE.text, actor: DEMO_ACTOR } },
  )
  expect(noteRes.ok()).toBeTruthy()

  // Sanity check: the board now reports the jobs we imported.
  const jobsRes = await request.get('/api/board/jobs')
  expect(jobsRes.ok()).toBeTruthy()
  const jobs = ((await jobsRes.json()) as { data: unknown[] }).data
  expect(jobs.length).toBeGreaterThanOrEqual(DEMO_JOBS.length)
})
