# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-10
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: v0.6.1 — release-notes link fix (`currentReleaseUrl`), agenda horizon now today → end of NEXT week (current week alone was empty: nearly all ship dates land the following week), full docs audit (READMEs, ops guide §1.5 Updating, Node 18→20 in CLAUDE/AGENTS/build-plan). v0.6.0 — Settings → About & Updates (version display + one-click Update button → `POST /api/update/run` → Update-FromRelease.ps1 downloads latest release zip on kiosks / Update-WallBoard.ps1 -Unattended on git installs); AgendaRail shows the current week (was today+tomorrow only → permanently empty). Before that: v0.5.0 Files toggle; v0.4.0 calendar user picker + per-user agenda + NEW badges + New filter; v0.3.0 multiple super users; v0.2.0 conhost --headless tray launcher.
- Next task: Soft-delete tombstones for notes (HIGH, deferred — schema change, needs human approval per §3)
- Blockers: None — kiosk needs updated `VRSI WallBoard\` folder copied over + ENABLE-STARTUP.bat re-run as Admin to pick up the conhost launcher

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

- Current: `v0.6.1` — tagged and released on GitHub (2026-06-10). Note: v0.5.1 tag exists with no GitHub release (superseded same-day); v0.5.2 was never tagged (folded into v0.6.0).
- Next release: bump `server/package.json` (+ root) → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → `gh release create`

## Files Modified This Session (2026-06-10)

**New:**
- `scripts/windows/Start-TrayApp.ps1` — tray app
- `scripts/windows/Start-TrayApp.bat` — hidden launcher (with node check)
- `scripts/windows/Restart-WallBoard.ps1` — tray-aware restart
- `scripts/windows/Restart-WallBoard.bat` — wrapper
- `Start-TrayApp.bat` (repo root) — one-click tray launcher

**Modified:**
- `scripts/windows/_Register-Startup.ps1` — Tray task + Principal fix (HIGH)
- `scripts/windows/Install-WallBoard.ps1` — shortcuts, dead token dropped, isAdmin guard
- `scripts/windows/Uninstall-WallBoard.ps1` — kills tray, removes Tray task
- `scripts/windows/WallBoard-Menu.bat` — T=Start tray app
- `scripts/windows/_common.ps1` — Stop-WallBoardServer: -State Listen + node name check
- `scripts/windows/Package-Release.ps1` — excludes Package-Release.ps1, adds docs/README
- `scripts/windows/Update-WallBoard.ps1` — process filter, mutex dispose, comment fix
- `scripts/windows/Restore-Backup.ps1` — stops tray before restore
- `scripts/windows/Register-BackupTask.ps1` — finite ExecutionTimeLimit
- `scripts/windows/_run.ps1.bat` — absolute powershell.exe path
- `scripts/windows/Start-WallBoard-Service.bat` — quoted path
- `INSTALL.bat` — quoted %~dp0 paths
- `VRSI-WALLBOARD-RULES.md` — §19 changelog
- `docs/operations-guide.md` — §1.5 tray docs, §1.7 user wording, §2.2 uninstaller wording

**Deleted:**
- `scripts/windows/Enable-Startup.bat` (stub, superseded)
- `scripts/windows/Start-KioskAfterDelay.ps1` (legacy, never called)

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
App is v0.6.1. `VRSI WallBoard\` folder is distribution-ready.
Kiosk update path: Settings → About & Updates → Update button (or Update-FromRelease.bat); dev machine uses git-based Update-WallBoard.bat.
Tray starts via Task Scheduler `VRSI WallBoard Tray` → `conhost.exe --headless powershell.exe ... Start-TrayApp.ps1`.
The tray W icon has no taskbar entry. Right-click to restart/stop.
To update an already-installed PC: copy new `VRSI WallBoard\` folder over existing, re-run `INSTALL.bat` + `ENABLE-STARTUP.bat` as Admin.
