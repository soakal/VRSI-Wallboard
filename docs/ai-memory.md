# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-11
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: v0.9.0 — calendar month navigation: ‹ › / Today chip buttons in the Dashboard footer (desktop + mobile) step the view by the current display mode; `viewDate` lives in appStore; CalendarView is date-controlled (`date` + no-op `onNavigate`, RBC toolbar stays hidden); AgendaRail takes `viewDate` — current month keeps past-due + today→month-end behavior, any other month lists all of that month's events grouped by day (agenda heading shows "Agenda — July 2026" when not current); useEvents takes `viewDate` and stretches the fetch window (earlier of now/anchor month start → later of now+45d/anchor month end); BoardLayout Files button now respects `config.showFiles` (reads store config, defaults true). All verified headless with puppeteer-core driving Edge against the running server: month forward/back, Today return, past month, agenda follows, July/Aug board ship events fetched, Files hidden on Projects + Calendar when toggled off. Previous task: full docs refresh after the verified v0.8.3 update fix (WMI launch; never spawn powershell.exe with detached:true). NEW `docs/START-HERE.txt` (plain-language 3-step install guide, copied to release root by Package-Release.ps1); operations-guide §1.5, scripts README, root README all note the pre-v0.8.3 bootstrap (run Update-FromRelease.bat as Administrator once) and the run-as-admin requirement for manual updates; code-guide rows updated (update.ts WMI launch, SettingsPanel/App.tsx localStorage polling, Update-WallBoard auto-stash). v0.8.3 zip asset re-uploaded with the new docs (--clobber). Before that: v0.8.3 — Update button TRULY fixed and **confirmed working end-to-end on the test VM** (v0.8.2's basename/$PSScriptRoot diagnosis was wrong). Sandbox bisect proved: `powershell.exe` spawned with `detached: true` (DETACHED_PROCESS) exits 0 instantly without running the script — no console to initialize, empty stderr, looks like success. Fix in `update.ts`: non-detached short-lived PS launcher (hidden console via CREATE_NO_WINDOW works) creates the updater via WMI `Win32_Process.Create` — updater's parent is WmiPrvSE, survives server/tray/Task Scheduler kills mid-update. Verified in sandbox: spaced paths, -Unattended passthrough, $PSScriptRoot, parent-death survival. RULE: never spawn powershell.exe with detached:true. To bootstrap a kiosk on v0.8.2 or older: double-click `scripts\windows\Update-FromRelease.bat` once — button works for all future updates after that.
- Next task: Soft-delete tombstones for notes (HIGH, deferred — schema change, needs human approval per §3)
- Blockers: None

## Active Plan

- [x] Scaffold + StorageProvider + SQLite local provider
- [x] JSON → SQLite migration on first run
- [x] Port board/config persistence to SQLite
- [x] Windows Task Scheduler backup script
- [x] ADMIN_TOKEN gate
- [x] ICS export for ship dates
- [x] Footer nav as pill buttons
- [x] Update check feature
- [x] v0.1.0 GitHub release
- [x] Restore conflict blocking + merge-based restore
- [x] **System tray icon** — Start-TrayApp.ps1/bat, blue "W" GDI+ icon, STA guard, mutex, crash-loop protection, hidden form (ShowInTaskbar=false), right-click menu, balloon notifications
- [x] **Restart-WallBoard.ps1/bat** — tray-aware restart with mutex detection
- [x] **Pretty-icon shortcuts** — Start WallBoard.lnk + Restart WallBoard.lnk (imageres.dll)
- [x] **Fable audit #1** — 21 code findings, 4 dead files removed, 5 release gaps fixed
- [x] **Taskbar fix** — Application::Run($hiddenForm) with ShowInTaskbar=false; no taskbar entry
- [x] **Fable verify pass** — 8 more findings fixed (see key decisions below)
- [x] **PS5.1 compatibility** — removed all em-dashes + `?.` operator from PS scripts; Start-TrayApp.ps1 fully rewritten clean
- [x] **Geocode proxy** — ZIP lookup now proxied through server (`GET /api/config/geocode`) instead of direct browser fetch (blocked on kiosk networks)
- [x] **Hidden users** — PM/materials users with only shipped jobs hidden from user picker; super users always shown
- [x] **Taskbar fix (VBS shim)** — superseded: see conhost --headless below
- [x] **Super user save fix** — `deepMergeConfig` used `||` for superUser (dropped empty string); changed to `??`
- [x] **Taskbar fix v2 (conhost --headless)** — VBS shim never shipped (Package-Release copies only *.ps1/*.bat → kiosk task pointed at missing .vbs); replaced with `conhost.exe --headless powershell.exe ...` everywhere; Start-TrayApp.vbs deleted
- [x] **v0.2.0 release** — version bump (root + server package.json), release folder rebuilt, tagged, GitHub release published
- [x] **Multiple super users (v0.3.0)** — `BoardConfig.superUsers: string[]` replaces `superUser: string`; legacy fold in `localProvider.getBoardConfigRaw` + `migrate.ts`; `getDerivedUsers` loops list; client `isSuper` checks list; UsersView chip-list UI with instant save (BK approved data model change)
- [x] **Calendar per-user agenda + NEW flag + new-items filter (v0.4.0)** — `NormalizedEvent`/`CalendarEvent` gain `isNew`/`jobPm`/`jobMm`; Dashboard has user select (desktop footer + mobile nav) and filters AgendaRail board events by role (pm→jobPm, materials→jobMm; super/none/manual see all); CalendarView custom event renderer shows red NEW chip; AgendaRail shows NEW badge; JobListView `newOnly` toggle ("New (n)" button, sessionStorage-persisted, hidden on archive)
- [x] **Files enable/disable toggle (v0.5.0)** — `UiConfig.showFiles` (server configService + config route mapping, default true); SettingsPanel Files section Toggle (fileOpenMode shown only when on); Dashboard hides Files button + Ctrl+F; App.tsx guards Ctrl+F, closes + unmounts FileBrowserPanel when off
- [ ] Soft-delete tombstones for notes (awaiting human approval — schema change)
- [ ] SharePoint provider (deferred)
- [ ] Audit log UI panel (deferred)
- [ ] XLSM configurable path (deferred)

## Key Decisions Made

### Tray App Architecture
- **Primary startup mechanism**: Task Scheduler task `VRSI WallBoard Tray` via `conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File Start-TrayApp.ps1`
- **Script**: `scripts/windows/Start-TrayApp.ps1` — pure ASCII (PS5.1 compatible), refreshes PATH from registry at start
- **No taskbar entry**: `conhost.exe --headless` never creates a console window, regardless of whether Windows Terminal is the default host. WinForms form also has `ShowInTaskbar=$false`. History: `cmd /c start /b` and `-WindowStyle Hidden` left a taskbar window; the `wscript.exe + .vbs` shim worked locally but the .vbs was never copied into the release folder (Package-Release.ps1 copies only *.ps1/*.bat), so kiosk startup failed — and VBScript is deprecated on Win11 24H2+ anyway. conhost --headless solves all of it with zero extra files.
- **Icon**: Programmatic GDI+ 32x32 blue circle + white "W" via `Bitmap.GetHicon()` → `Icon.FromHandle()`
- **Single-instance**: Named mutex `VRSIWallBoardTray`; `Restart-WallBoard.ps1` probes it to detect tray
- **Crash-loop protection**: max 3 auto-restarts per 60 seconds; error balloon then stops retrying
- **Port squatter detection**: if port 3001 is owned by a non-node process, shows MessageBox naming the process and exits cleanly (no EADDRINUSE crash loop)
- **ExecutionTimeLimit([TimeSpan]::Zero)**: prevents Task Scheduler 72h kill of the tray

### Task Scheduler Principal Fix (CRITICAL — Fable verify finding)
- `_Register-Startup.ps1` now passes `-Principal (New-ScheduledTaskPrincipal -UserId $triggerUser -LogonType Interactive)` to `Register-ScheduledTask`
- Without this: task ran as the elevated admin, not the kiosk user — tray never started on UAC-split machines
- `$triggerUser` = `Win32_ComputerSystem.UserName` (console session user, not `$env:USERNAME` which is the elevated account)

### Security (Fable audits)
- `Stop-WallBoardServer` verifies `ProcessName -eq 'node'` before killing
- Admin token not printed to console after install; dead `$token` assignment dropped
- `$isAdmin` guard on startup registration — friendly warning if non-admin answers Y
- All `%~dp0` paths quoted in bat files; `_run.ps1.bat` uses absolute `%SystemRoot%\System32\WindowsPowerShell` path
- `Restore-Backup.ps1` stops tray watchdog before restore (prevents mid-restore DB corruption)
- `Update-WallBoard.ps1`: tray-kill uses `Name -in @('powershell.exe','pwsh.exe')` filter; mutex handle disposed; comment fixed U→P; disables/enables scheduled task around rebuild (H1 race fix)

### Auto-Start PATH Fix + Fable Audit Fixes (2026-06-10, this session)
- **Root cause of exit-1**: Task Scheduler with `-NoProfile` does not inherit User PATH — winget Node install writes to User PATH, making `node` invisible
- `Start-TrayApp.ps1`: refresh Machine+User PATH from registry at script start; `Get-NodeExe` fallback covers ProgramFiles(x86), LOCALAPPDATA\Programs\nodejs, winget per-user packages; `Write-TrayLog` writes to `tray-startup.log` with 1 MB rotation; `Stop-Server` fallback now guards `ProcessName -eq 'node'`
- `_Register-Startup.ps1`: throws loudly when `$consoleUser` is empty (no silent fallback to admin account)
- `Restart-WallBoard.ps1`: checks port 3001 before launching headless fallback
- **To fix kiosk PC**: copy updated `scripts\windows\Start-TrayApp.ps1` and `_Register-Startup.ps1` to `C:\Program Files\VRSI WallBoard\scripts\windows\`, then run `ENABLE-STARTUP.bat` as admin

### Release Folder (`VRSI WallBoard\`)
- Root: `INSTALL.bat`, `UNINSTALL.bat`, `ENABLE-STARTUP.bat`, `Start-WallBoard.bat`, `Start-TrayApp.bat`, `operations-guide.md`, `README.md`, `release-info.json`
- `scripts/windows/`: 44 files (Package-Release.ps1 excluded — dev-only)
- No `.env` secrets, no `node_modules`
- Current at commit 88feb5f (2026-06-10)

### Package-Release.ps1 Changes
- Excludes `Package-Release.ps1` from scripts copy (dev tool, not for end users)
- Copies `docs/operations-guide.md` and `README.md` to release root
- Includes git commit hash in `release-info.json`

### Update Path for Already-Installed PCs
- **Single-file fix**: copy `scripts\windows\Start-TrayApp.ps1` from updated release folder over existing, restart tray
- **Full update**: copy updated `VRSI WallBoard\` folder to PC, re-run `INSTALL.bat` (safe on existing install — preserves data)

## Version

- Current: `v0.9.0` — tagged and released on GitHub (2026-06-11, commit 0ada277, zip asset uploaded). Calendar month navigation + agenda follows displayed month + Files toggle respected on Projects + 90-day audit log retention. Brian tested locally and approved before release.
- Previous: v0.8.3 (2026-06-11) — tagged and released. TRUE root cause fix: powershell + detached:true exits silently; WMI Win32_Process.Create launch. v0.8.2 (2026-06-11, wrong diagnosis), v0.8.1 (2026-06-11) — git pull auto-stash + transcript. v0.8.0 (2026-06-10) — unsaved-changes protection. Note: v0.5.1 tag exists with no GitHub release; v0.5.2 was never tagged.
- Next release: bump `server/package.json` (+ root) → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → `gh release create` (needs `dangerouslyDisableSandbox`)

## Files Modified This Session (2026-06-11)

**v0.9.0 (calendar navigation + agenda + files visibility):**
- `client/src/store/appStore.ts` — `viewDate` + `setViewDate`
- `client/src/components/Dashboard.tsx` — ‹ › / Today footer controls (desktop + mobile), view label, agenda heading month suffix, passes `date`/`viewDate` down
- `client/src/components/CalendarView.tsx` — `date` prop, controlled `date`/`onNavigate` on RBC Calendar
- `client/src/components/AgendaRail.tsx` — `viewDate` prop; non-current month lists that whole month
- `client/src/hooks/useEvents.ts` — `viewDate` param widens fetch window to navigated month
- `client/src/App.tsx` — passes `viewDate` from store into `useEvents`
- `client/src/components/board/BoardLayout.tsx` — Files button hidden when `showFiles` off

**v0.9.0 audit retention:**
- `server/src/storage/schema.ts` — `idx_audit_timestamp` index
- `server/src/storage/localProvider.ts` — `pruneAuditLog(retentionDays)` (DELETE < ISO cutoff, logs result)
- `server/src/storage/boardPersistence.ts` — interface method
- `server/src/services/auditService.ts` — `startAuditPruneCron()` (prune at startup + cron 3:30 AM daily, 90-day retention)
- `server/src/index.ts` — calls `startAuditPruneCron()` in bootstrap
- Verified live: fake 100-day-old row inserted → server restart → row pruned, "Pruned 1 audit entries" record written, index created on existing DB

**v0.8.1 fixes:**
- `scripts/windows/Update-WallBoard.ps1` — Start-Transcript + auto-stash dirty tree before git pull
- `client/src/components/SettingsPanel.tsx` — localStorage pending flag, alreadyRunning message
- `client/src/App.tsx` — resume version polling on mount from localStorage flag

**v0.8.2 fixes (root cause):**
- `server/src/routes/update.ts` — use `path.basename(script)` for `-File` arg; 10s stderr capture + exit-code logging
- `scripts/windows/Update-FromRelease.ps1` — `$PSScriptRoot` fallback guard before dot-source
- `scripts/windows/Update-WallBoard.ps1` — same fallback guard added

## Known Issues Status (§10)

- [x] SheetJS CDN fix
- [ ] XLSM configurable path (deferred)
- [x] personIdentity.ts deduplication
- [x] ADMIN_TOKEN gate

## Open Questions

- Soft-delete tombstones for notes: ready to implement when Brian approves schema change

### This Session Fixes (2026-06-10)
- **PS5.1 parse errors**: All PS scripts had em-dashes (U+2014) and `?.` (PS7-only) — rewrote Start-TrayApp.ps1 clean, bulk-replaced em-dashes in all other scripts
- **Auto-start PATH**: Task Scheduler `-NoProfile` skips user PATH; added registry PATH refresh + `Get-NodeExe` fallback in Start-TrayApp.ps1
- **Geocode proxy**: `GET /api/config/geocode?q=` proxies ZIP lookup through server (browser on kiosk can't reach geocoding-api.open-meteo.com directly)
- **Hidden users**: `getDerivedUsers` now uses `getMergedJobs()` and skips `status === 'shipped'` — users with only shipped jobs hidden from picker; super/manual always shown
- **Taskbar window**: Task now uses `wscript.exe + Start-TrayApp.vbs` — SW_HIDE=0 fully hides conhost. Previous `cmd /c start /b` was insufficient.
- **Super user save**: `deepMergeConfig` had `||` for `superUser` (dropped `""`); changed to `??`
- **release-info.json**: now includes `version` field from `server/package.json`

## Context for Next Session

Run `npm start` at repo root. Health: `GET http://localhost:3001/health`.
App is v0.8.3. `VRSI WallBoard\` folder is distribution-ready (zipped as `VRSI-WallBoard-v0.8.3.zip`).
Agenda filtering single source of truth: `client/src/lib/agendaFilter.ts` — change it there, nowhere else.
Kiosk update path: Settings → About & Updates → Update button now works reliably. Dev machine uses git-based Update-WallBoard.ps1 (auto-stashes dirty tree).
Update failures: check `C:\ProgramData\VRSIWallBoard\logs\update.log`; also check server logs for "Update script exited early" or "Update script stderr" entries.
Tray starts via Task Scheduler `VRSI WallBoard Tray` → `conhost.exe --headless powershell.exe ... Start-TrayApp.ps1`.
The tray W icon has no taskbar entry. Right-click to restart/stop.
To bootstrap a kiosk on v0.8.1 or older (button was broken): `powershell.exe -ExecutionPolicy Bypass -File "C:\Program Files\VRSI WallBoard\scripts\windows\Update-FromRelease.ps1"` — after that the button works for all future updates.
To update an already-installed PC on v0.8.2+: Settings → About & Updates → Update button.
