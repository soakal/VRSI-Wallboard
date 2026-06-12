# VRSI WallBoard — Playwright Tours

Two repeatable **visual tours** (screenshots + recorded video) you can show to IT
or stakeholders. They run against a freshly-booted server in **mock mode**
(`DISABLE_AZURE=true`) against a **throwaway data dir** (`e2e/.demo-data`), so they
never touch real dev or kiosk data.

| Tour | File | What it shows |
|------|------|---------------|
| 1. Upgrade | `tours/01-upgrade.spec.ts` | The in-app Update flow: current version → "Update available" banner → "Update started" → auto-reload. No real update runs (the API calls are stubbed). The OS install + script-fallback update are documented in **`UPGRADE-RUNBOOK.md`**. |
| 2. Features | `tours/02-feature-tour.spec.ts` | Calendar (Day/Week/Month, month nav, clicking a ship-date event into the board), agenda + user picker, every Settings section, the Files show/hide toggle, the Monitoring/Backup/Activity-log panel, Projects board tabs + job cards, and the Users view (who-you-are, super users, spare-parts PM, tab colours). |

The demo board is seeded first by `seed/seed.setup.ts` via the normal
`POST /api/board/import` API (no direct DB writes) using the fixed dataset in
`seed/demo-jobs.ts` (ship dates are relative to today, so there's always content).

## Prerequisites (one time)

```powershell
# from the repo root:
npm install                     # installs @playwright/test
npx playwright install chromium # downloads the browser (~120 MB, one time)
npm run build                   # npm start serves client/dist + server/dist
```

The tours boot their own isolated server on **port 3100** (so a live board/tray
on 3001 is left alone) using the throwaway demo data dir.

## Run

```powershell
npm run e2e:tour      # boots the server, seeds, runs both tours
npm run e2e:report    # opens the HTML report (screenshots + video + steps)
```

## Output (`e2e/artifacts/`, git-ignored)

- `screens/upgrade/…` and `screens/features/…` — numbered PNGs in story order
- `test-results/…` — per-test video (`video.webm`) and any traces
- `report/…` — the HTML report (each screenshot is also attached here)

## Notes

- These are a **demo/visual** harness, not a pass/fail gate, though core steps do
  assert (e.g. clicking an event routes to `/board`, turning Files off removes the
  Files button). Deep board-card interactions are best-effort so a layout tweak
  won't fail the whole run.
- Selectors are text/role/aria based — there are no `data-testid`s in the app yet.
  If a label changes, update the matching locator in the spec.
- To re-seed from scratch, just re-run `npm run e2e:tour` — `global-setup.ts`
  wipes `e2e/.demo-data` before the server starts.
