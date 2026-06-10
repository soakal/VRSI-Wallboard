# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-10
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: Fable audit pass + auto-start PATH fix + 6 audit findings resolved. Latest commit: 25d5c8c.
- Next task: Soft-delete tombstones for notes (HIGH, deferred — schema change, needs human approval per §3)
- Blockers: None — auto-start fix deployed; kiosk PC needs updated Start-TrayApp.ps1 copied over

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
- [ ] Soft-delete tombstones for notes (awaiting human approval — schema change)
- [ ] SharePoint provider (deferred)
- [ ] Audit log UI panel (deferred)
- [ ] XLSM configurable path (deferred)

## Key Decisions Made

### Tray App Architecture
- **Primary startup mechanism**: Task Scheduler task `VRSI WallBoard Tray` (replaces `VRSI WallBoard Server`)
- **Script**: `scripts/windows/Start-TrayApp.ps1` — runs with `-STA -WindowStyle Hidden`
- **No taskbar entry**: Uses `Application::Run($AppForm)` with `$AppForm.ShowInTaskbar = $false`, never shown. Closing the task in taskbar no longer possible — only tray icon controls the app.
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
- Current at commit 25d5c8c (2026-06-10)

### Package-Release.ps1 Changes
- Excludes `Package-Release.ps1` from scripts copy (dev tool, not for end users)
- Copies `docs/operations-guide.md` and `README.md` to release root
- Includes git commit hash in `release-info.json`

### Update Path for Already-Installed PCs
- **Single-file fix**: copy `scripts\windows\Start-TrayApp.ps1` from updated release folder over existing, restart tray
- **Full update**: copy updated `VRSI WallBoard\` folder to PC, re-run `INSTALL.bat` (safe on existing install — preserves data)

## Version

- Current: `v0.1.0` — tagged and released on GitHub (title: "VRSI Wallboard")
- Latest commit: `7c6b948` (2026-06-10, Fable final check fixes)
- Next release: bump `server/package.json` → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → create GitHub release

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

## Context for Next Session

Run `npm start` at repo root. Health: `GET http://localhost:3001/health`.
App is v0.1.0, latest commit d1d0af7. `VRSI WallBoard\` folder is distribution-ready.
Tray app starts at logon via Task Scheduler `VRSI WallBoard Tray`. Manual start: `Start-TrayApp.bat`.
The tray W icon has no taskbar entry — only visible near the clock. Right-click to restart/stop.
To update an already-installed PC: copy new `Start-TrayApp.ps1` over existing, or re-run `INSTALL.bat`.
