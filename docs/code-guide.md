# VRSI WallBoard — Code Guide

A plain-English walkthrough of every part of the codebase: what each piece does
and **why** it was built that way. Read top to bottom for the big picture, or
jump to a file when you need to change something.

---

## The big picture

WallBoard is **three packages in one repo**:

```
shared/   TypeScript types used by both sides (what a Job looks like, etc.)
server/   Node.js + Express API — owns ALL data, serves the built website
client/   React website — the calendar page and the Projects board
scripts/  Windows PowerShell/batch scripts — install, start, update, backup
```

One Node process runs everything in production. It listens on
**http://localhost:3001**, answers API calls under `/api/*`, and serves the
compiled React app for every other URL. The kiosk browser just opens that one
address.

**Why one process?** Shop-floor PCs should need exactly one thing running.
No database server, no separate web server — Node + a SQLite file.

**Where data lives:** `C:\ProgramData\VRSIWallBoard\data\wallboard.db`
(SQLite). Jobs, statuses, notes, settings, and the audit log are all inside
that single file, which makes backup = copy one file.

---

## shared/ — the contract between server and client

| File | What it does and why |
|------|----------------------|
| `src/types/board.ts` | Defines `Job`, `BoardJob`, `JobState`, `JobNote`, `BoardUser`, `BoardConfig`, and `DEFAULT_BOARD_CONFIG`. The server and client both import these, so they can never disagree about what a job looks like. Notable: `BoardConfig.superUsers` is a **list** (multiple super users); the old single `superUser` string is auto-migrated when read. |
| `src/types.ts`, `src/result.ts`, `src/paths.ts` | Smaller shared types and a `Result` wrapper (`ok/err`) used by the storage layer so errors are values, not exceptions. |

**Why a separate package?** If the server changed a field name and the client
didn't, the board would silently break. Sharing one set of types makes that a
compile error instead of a runtime surprise.

---

## server/ — the API

Entry point: `src/index.ts` — sets up Express, security headers (helmet),
CORS, mounts every router under `/api`, and serves `client/dist` as static
files. `NODE_ENV=production` is set by the tray app.

### Routes (`src/routes/`) — what each URL does

Routes are thin: they parse the request, call a service, and return
`{ data }` or `{ error: { code, message } }`. Business logic lives in
services, **never** in routes — that's project rule §2.

| File | What it handles |
|------|-----------------|
| `board.ts` | Everything on the Projects board: `GET /api/board/jobs` (merged job list), `POST /api/board/config`, `GET /api/board/users`, import endpoints, per-job status / ship-date / binder / notes mutations, presence (who's editing). |
| `events.ts` | `GET /api/events` — Outlook calendar events (when Azure is configured) **plus** board ship dates injected as all-day events with `calendarId: 'board-jobs'`. Each board event carries `jobPm`, `jobMm`, and `isNew` so the client can filter the agenda per user and show NEW badges **without another API call**. |
| `update.ts` | `GET /api/update/check` — compares the running version (from `server/package.json`) against the latest GitHub release, cached 6 h so kiosks don't hammer GitHub. `POST /api/update/run` — launches the self-update script. Picks `Update-WallBoard.ps1` when a `.git` folder exists (dev machine), otherwise `Update-FromRelease.ps1` (kiosk). **Critical:** the script is NOT spawned with `detached: true` — `powershell.exe` silently exits 0 without running anything when given `DETACHED_PROCESS` (no console to initialize; verified by sandbox test). Instead a short-lived non-detached PowerShell launcher creates the real updater via WMI `Win32_Process.Create`, making it a child of the WMI service — so it survives the server, the tray, and any Task Scheduler job being killed mid-update. Launcher exit code and stderr are logged. |
| `config.ts` | App settings. The server stores config **nested** (calendar/display/ui sub-objects); the client wants it **flat**. `toClientConfig` / `fromClientConfig` translate both directions so neither side crashes on the other's shape. Also `GET /api/config/geocode` — proxies ZIP-code lookups because kiosk networks block the geocoding API directly. |
| `storage.ts` | Backup/restore/audit endpoints used by the System panel (Ctrl+M). Also **Support**: `GET /api/storage/support-info` (form limits only — inbox not exposed), `POST /api/storage/support` (build zip + open Outlook or mailto server-side), `GET /api/storage/support-download/:filename` (mailto fallback download). |
| `auth.ts` / `calendars.ts` | Azure device-code sign-in and the Outlook calendar list. Standalone kiosks skip all of this (`DISABLE_AZURE=true`). |

### Services (`src/services/`) — the business logic

| File | What it does and why |
|------|----------------------|
| `boardService.ts` | The heart of the board. `getMergedJobs()` combines the imported spreadsheet rows with the saved per-job state (status, overrides, notes) into the `BoardJob` objects the UI shows. `getDerivedUsers()` builds the user picker from the PM and Materials Manager columns of **non-shipped** jobs (people with only shipped jobs disappear — no clutter), plus configured super users and manual extras. `isSpareJob()` / `getJobBoardTab()` decide which tab owns a job (spare-parts PM match or `SP-` job numbers). `deepMergeConfig` merges config updates field-by-field so a partial save can never wipe other settings. |
| `configService.ts` | Loads/saves app config from SQLite with defaults deep-merged in, so a config saved by an old version never crashes a new version (missing fields just get defaults). |
| `importService.ts` (via board routes) | Parses the ops-schedule XLSM with the **npm SheetJS package** (never the CDN — rule §10) and merges jobs in. Jobs new to this import get flagged `isNew`. **Merge, never overwrite** (§7): re-importing can't destroy statuses or notes. |
| `supportService.ts` | In-app Support reports (v1.1.6). `buildSupportBundle()` assembles `message.txt`, `system-info.txt`, and optional log tails into a zip (Desktop copy + archive under `logs\support-reports\`). `composeSupportMail()` tries classic Outlook COM with the zip attached via `Open-SupportMail.ps1`, then falls back to server-launched `mailto:`. `DEFAULT_SUPPORT_EMAIL` / `SUPPORT_EMAIL` in `.env` — never returned to the client. |

### Storage (`src/storage/`) — the only place that touches the database

| File | What it does and why |
|------|----------------------|
| `boardPersistence.ts` | The **StorageProvider interface** (§2). Every read/write goes through this contract. Why: when SharePoint storage gets added someday, only a new provider is written — zero changes to routes or services. |
| `localProvider.ts` | The SQLite implementation (better-sqlite3). Parameterized queries only — no string-built SQL. `getBoardConfigRaw()` also folds the legacy single `superUser` string into the `superUsers` list so old installs keep their setting after upgrading. |
| `schema.ts` | Creates tables on first run. |
| `migrate.ts` | One-time migration: if old `jobs.json` / `board-state.json` files exist in the data dir, import them into SQLite and rename them `*.migrated`. Why rename instead of delete: never destroy a file we only just read. |
| `factory.ts` | `getPersistence()` — hands out the active provider. |

### Support (`src/lib/`, `src/middleware/`, `src/utils/`)

| File | What it does and why |
|------|----------------------|
| `lib/personIdentity.ts` | `canonicalPersonName()` / `samePerson()` — the same human shows up as `"Ted H"`, `"tedh"`, and `"tedh@vrs-inc.com"` across spreadsheets. This module maps known aliases to one canonical form so filters and user matching never miss. **Used by the client too** (aliased as `@vrsi/person-identity` in `client/vite.config.ts`) so both sides agree on who is who. |
| `middleware/adminAuth.ts` | `requireAdminToken` — write endpoints are gated. The kiosk browser on localhost is trusted (`TRUST_LOCALHOST=true`, the server binds locally anyway); anything else needs the `ADMIN_TOKEN` header, compared in constant time. |
| `utils/logger.ts` | Winston logger writing to the ProgramData logs dir. Project rule: no `console.log` in production, and **never** log emails/passwords/tokens. |

---

## client/ — the website

Entry: `src/main.tsx` → `src/App.tsx`.

### App-level plumbing

| File | What it does and why |
|------|----------------------|
| `App.tsx` | Routing (`/` calendar, `/board/*` projects, `/setup` Azure sign-in), keyboard shortcuts (Ctrl+S/F/M, d/w/m), the update banner, the nightly 3 a.m. reload (kiosks run for weeks — a daily refresh clears browser drift), and a **stale-user resync**: the name saved in localStorage gets refreshed against the live users list so an old saved role can't break filtering. Also debounces the redirect to `/setup` so a 10-second server restart doesn't kick a signed-in kiosk to the login screen. On mount it checks the `vrsi_update_pending` localStorage flag and resumes update polling (10 s, with a 15-minute staleness guard) so an in-progress update still triggers the reload even after Settings was closed. |
| `store/appStore.ts` | Zustand global state: who is signed in to the picker (`activeUser`, persisted to localStorage so the kiosk remembers across reboots), which panels are open, `displayMode` + `viewDate` (the calendar's day/week/month view and which date it is showing — driven by the footer ‹ › / Today controls; `viewDate` is **not** persisted, so a reload always lands on today), and `dirtyJobs` — the set of job cards with un-applied edits. `confirmDiscardUnsaved()` lives here: one function every navigation point calls before letting the user leave edits behind. |
| `lib/agendaFilter.ts` | **The single source of truth for "whose agenda is this".** A selected user sees board jobs where their *name* matches the job's PM **or** Materials Manager (matching one field by role hid half a person's jobs — real people are PM on some jobs and MM on others). Super users (live role or the configured list) and "no selection" see everything. If agenda filtering ever needs to change, change it here and nowhere else. |
| `hooks/useEvents.ts` | Fetches `/api/events` from the **1st of the month** through today+45 days, in every view mode. Why from the 1st: the agenda shows past-due ship dates from earlier in the month — if they aren't fetched, they can't be shown. When the calendar is navigated to another month (via `viewDate`), the window stretches to cover that whole month too, so events appear without a second round trip. |
| `hooks/useBoard.ts` | React-Query hooks for every board API call. Mutations invalidate both the board and events caches so the calendar updates the moment a ship date changes. |
| `hooks/useUpdateCheck.ts` | Polls `/api/update/check` every 6 h; feeds the update banner and the Settings About section. |
| `api/*.ts` | Thin fetch wrappers, one per API area. `http.ts` unwraps the `{ data } / { error }` envelope in one place. |

### Calendar page (`components/`)

| File | What it does and why |
|------|----------------------|
| `Dashboard.tsx` | The calendar page layout: clock, weather, the big calendar, the agenda rail, footer chips. Hosts the **user picker** and the **month navigation** (footer + mobile nav): ‹ › step the calendar by the current view (day/week/month) and a **Today** chip appears once you've moved away. Computes `agendaEvents = filterAgendaEvents(...)` — the grid stays unfiltered (it's a wallboard; everyone sees the whole picture) while the **agenda** is personal. |
| `CalendarView.tsx` | react-big-calendar wrapped in dark-theme CSS, date-controlled via the `date` prop (`viewDate`) with navigation handled by the footer rather than the built-in toolbar. The weekends-off trick: render the full 7-day grid at 140% width and clip the weekend columns — react-big-calendar's real "work week" mode crashes when an event lands on a Saturday. A custom event renderer prefixes a red **NEW** chip on newly imported jobs. |
| `AgendaRail.tsx` | The agenda list, which **follows the month shown on the calendar** (`viewDate`). On the current month: an amber **Past due** group (unshipped jobs from earlier in the month — the ones people need to chase), then day-by-day sections from Today through month end (minimum 14 days so it stays useful near month rollover). On any other navigated month: every day of that month that has events, listed in order (heading shows e.g. "Agenda — July 2026"). |
| `SettingsPanel.tsx` | The slide-over Settings: **Board** (links to Users and Import), calendars, display, widgets, time/units, weather ZIP lookup, the Files on/off toggle, and **About & Updates** — current version, the one-click Update button (POSTs `/api/update/run`, then polls every 10 s until the new version is alive and reloads), and the release-notes link. On Update click it also writes a `vrsi_update_pending` flag to localStorage so the reload still happens if the panel is closed mid-update (App.tsx picks it up). Settings are edited locally and only saved on **Save** — closing discards. |
| `AuthSetup.tsx`, `CalendarSelector.tsx`, `WeatherWidget.tsx`, `Clock.tsx`, `NextEventBadge.tsx`, `RecentFilesWidget.tsx`, `FileBrowserPanel.tsx`, `MonitoringPanel.tsx`, `StalenessIndicator.tsx` | One widget each: Azure device-code flow, calendar checkboxes, Open-Meteo weather (also drives evening screen dimming via sunset time), live clock, "next event" pill, SharePoint recent files, the file browser (hidden entirely when Files is toggled off), the System/IT panel (IT summary, backup/restore, activity log, and the **Support** tab — describe a problem, package logs, open Outlook or mail), and the offline/stale-data banner. |

### Projects board (`components/board/`)

| File | What it does and why |
|------|----------------------|
| `BoardLayout.tsx` | Frame around all board views: header, scroll container, footer chips. Carries the **beforeunload guard** — refreshing/closing the browser with un-applied edits pops the native "are you sure" dialog. |
| `BoardHeader.tsx` | Logo, the user switcher (leads with **👤 All users** — shows every job, matching the calendar page — then each name; picking a name filters to their jobs and enables card editing), a ⚙ Settings button (so Settings is reachable from the board on mobile), and the three tabs: Project / Spare Parts / Archive (Users and Import moved into Settings → Board). Tab clicks and user switches are guarded by `confirmDiscardUnsaved()`. |
| `JobListView.tsx` | The job list for one tab. Filter pipeline, in order: tab → PM/MM multi-select → role filter (My Jobs / All Jobs; super users always see all) → committed search → **New only** toggle → sort by ship date. Typing **`new`** in search matches NEW-flagged jobs. Search, filters, scroll position, and toggles persist in sessionStorage **per tab per user**, so switching tabs doesn't lose your place. The mobile-only 30-day ship agenda lives at the bottom. |
| `JobCard.tsx` | One job. All edits are **pending state** — nothing saves until **Apply all**, which commits status, binder, ship date, override reason, *and* a typed note in one click. Why pending: a wallboard gets bumped and fat-fingered; explicit Apply means no accidental writes. A typed-but-unsent note counts as dirty too (an amber warning shows). Dirty cards register in `appStore.dirtyJobs` (powers every leave-warning) and claim **presence** so two people editing the same job see "X is editing this job". |
| `NotesSection.tsx` | Notes list + composer. The draft lives in JobCard (see above). Only the author can edit/delete their note; notes imported from the ops schedule are locked. |
| `StatusCheckboxes.tsx`, `BinderPrintedCheckbox.tsx`, `ShipDateEditor.tsx` | The individual controls — all "dumb": they report changes up to JobCard's pending state and save nothing themselves. |
| `UsersView.tsx` | Reached via Settings → Board → Users. Who-are-you picker, the **Super Users** list (add from dropdown / × to remove, saves instantly), manual extra users, the spare-parts PM, and tab status colors. |
| `ImportView.tsx` | Reached via Settings → Board → Import. Upload the XLSM; shows imported/new/warning counts. |
| `boardColors.ts` | Tab tinting, status labels, `filterJobsForTab`, ship-date sorting, and the deterministic customer-bubble color (hash of the name → consistent color without storing anything). |

---

## scripts/windows/ — keeping it running on a Windows PC

The full list is in `scripts/windows/README.md`; these are the load-bearing ones:

| Script | What it does and why |
|--------|----------------------|
| `Start-TrayApp.ps1` | The supervisor — the ONLY supported production launch path. Shows the blue **W** tray icon (drawn in code — no icon file to lose), starts the Node server, and watches it two ways: crash → auto-restart (max 3 per minute, then a warning balloon instead of a restart loop), AND a `/health` probe every ~30s that force-restarts a process that's alive but unresponsive for ~2 minutes (a hang, not a crash — `HasExited` alone never catches this). Detects port squatters (something else on 3001) instead of crash-looping on EADDRINUSE. Refreshes PATH from the registry because Task Scheduler doesn't load user PATH — without this, winget-installed Node is invisible at logon. Every restart/update script relaunches via this, never the headless service, unless this file itself is missing. |
| `_Register-Startup.ps1` | Registers the logon task. Launches via **`conhost.exe --headless`** — the only reliable way to start PowerShell with *no window ever* (plain hidden-window flags leave a taskbar window when Windows Terminal is the default host, and the old VBScript shim broke because VBScript is being removed from Windows 11). Registers for the **console user**, not the elevated admin — on UAC-split kiosks those are different people. |
| `Update-FromRelease.ps1` | Kiosk self-update: download the latest GitHub release zip, verify it, stop tray+server, copy over the install (data and `.env` untouched), `npm install`, ensure `SUPPORT_EMAIL` is in `.env` if missing, restart everything including the kiosk browser. Logs to `update.log`. This is what the Settings Update button runs (launched via WMI — see `update.ts` above for why). Has a `$PSScriptRoot` fallback guard at the top as insurance for unusual invocation contexts. |
| `Update-WallBoard.ps1` | Dev-machine equivalent: `git pull --ff-only` + rebuild + restart, with the same transcript logging to `update.log`. `-Unattended` (used by the Update button) skips its prompts and **auto-stashes uncommitted local changes** before pulling (then pops them after) — a dirty working tree would otherwise abort the pull and kill the update silently. |
| `Package-Release.ps1` | Builds everything and assembles the deployable `VRSI WallBoard\` folder (dist files, scripts, docs, `release-info.json` with version+commit — **no** node_modules, **no** `.env` secrets). |
| `Install-WallBoard.ps1` / `Uninstall-WallBoard.ps1` | Create data dirs, generate a random `ADMIN_TOKEN`, set production paths and **`SUPPORT_EMAIL=briank@vrs-inc.com`** in `server\.env`, build, optionally register startup/backup tasks — and cleanly remove it all. |
| `Open-SupportMail.ps1` | Called by the server for in-app Support. Tries Outlook COM with the diagnostic zip attached (`.Display()` — user reviews and clicks Send); on failure launches `mailto:` via the shell. Email address passed from server only — never from the browser. |
| `Restore-Backup.ps1` / `Invoke-WallBoardBackup.ps1` / `Register-BackupTask.ps1` | Backup/restore. Restore stops the tray watchdog first — otherwise it would restart the server mid-restore and corrupt the database. |

All scripts are **Windows PowerShell 5.1 compatible** (plain ASCII, no `?.`
operator) because that's what a stock kiosk PC has.

---

## How a release happens

1. Bump `version` in root **and** `server/package.json` (the update banner reads the server one)
2. `Package-Release.ps1` → fresh `VRSI WallBoard\` folder
3. Commit (conventional commits, one concern each), push, `git tag vX.Y.Z`, push the tag
4. `gh release create vX.Y.Z` with the folder zipped as the asset
5. Kiosks see the update banner within 6 hours and update themselves via Settings → About & Updates

---

## The rules that shape all of this

| Rule | Why it exists |
|------|---------------|
| All storage through `StorageProvider` | Swap SQLite for SharePoint later without touching business logic |
| Merge, never overwrite (imports & restores) | A re-import or restore must never destroy someone's statuses and notes |
| All API responses `{ data }` or `{ error: { code, message } }` | The client handles every response the same way (known exception: `/api/events` returns a bare array for historical reasons) |
| Pending edits + explicit Apply | Touchscreen wallboard: no accidental saves, and one Apply commits everything together |
| Parameterized SQL only, no secrets in code, no PII in logs | Security basics — the audit log proves what happened without leaking who typed what |
| TypeScript strict, shared types | Disagreements between server and client become compile errors, not 2 a.m. kiosk bugs |

*Full rules: `VRSI-WALLBOARD-RULES.md`. Session history: `docs/ai-memory.md`.*
