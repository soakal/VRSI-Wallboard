# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-10
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: Fable full audit (21 findings, 4 unused files removed, 5 release gaps fixed) + tray icon system (Start-TrayApp.ps1, Restart-WallBoard.ps1, pretty-icon shortcuts). Commit db72963.
- Next task: Soft-delete tombstones for notes (HIGH, deferred — schema change, needs human approval per §3)
- Blockers: None

## Active Plan

- [x] Scaffold + StorageProvider + SQLite local provider
- [x] JSON → SQLite migration on first run
- [x] Port board/config persistence to SQLite
- [x] Windows Task Scheduler backup script
- [x] ADMIN_TOKEN gate
- [x] ICS export for ship dates
- [x] Footer nav as pill buttons (day/week/month dropdown, Calendar/Projects active highlight)
- [x] Update check feature (GitHub releases API, dismissable banner, Update-WallBoard.bat)
- [x] Opus dead-code audit — all findings fixed
- [x] v0.1.0 GitHub release created (title: "VRSI Wallboard")
- [x] Release folder renamed from `release\` → `VRSI WallBoard\`
- [x] Codex 4-issue fix (build, restore merge, version, Node docs)
- [x] Restore conflict blocking + shared artifact cleanup
- [x] Fable audit + Sonnet fix of restore feature
- [x] **System tray icon** — Start-TrayApp.ps1/bat, blue "W" icon (GDI+), STA guard, named mutex, crash-loop protection, right-click menu, balloon notifications
- [x] **Restart-WallBoard.ps1/bat** — tray-aware restart with mutex detection and /health poll
- [x] **Pretty-icon shortcuts** — Install-WallBoard.ps1 creates Start WallBoard.lnk + Restart WallBoard.lnk (imageres.dll icons)
- [x] **Fable full audit** — 21 findings fixed (security, correctness, dead code); 2 files deleted; release folder verified distribution-ready
- [ ] Soft-delete tombstones for notes — fixes note resurrection on restore (HIGH, awaiting human approval — schema change)
- [ ] Full StorageProvider method implementations (deferred)
- [ ] SharePoint provider (deferred)
- [ ] Audit log UI panel (deferred)
- [ ] XLSM configurable path (deferred)

## Key Decisions Made

- **Tray app is now primary startup** — Task Scheduler task `VRSI WallBoard Tray` (replaces `VRSI WallBoard Server`). Script: `Start-TrayApp.ps1`. Runs with `-STA -WindowStyle Hidden`. `ExecutionTimeLimit([TimeSpan]::Zero)` prevents 72h kill.
- **Tray icon** — programmatic GDI+ 32x32 blue circle with white "W". Created via `Bitmap.GetHicon()` → `Icon.FromHandle()`. No external icon file needed.
- **Single-instance mutex** — named `VRSIWallBoardTray`. `Restart-WallBoard.ps1` probes this to detect whether tray is running.
- **Crash-loop protection** — max 3 auto-restarts in 60 seconds, then error balloon and stops retrying.
- **Security fixes (Fable audit 2026-06-10)** — `Stop-WallBoardServer` now verifies `ProcessName -eq 'node'` before killing; logon task registered for console user not elevated admin; admin token not printed to console; all `%~dp0` expansions quoted in bat files; `_run.ps1.bat` uses absolute `%SystemRoot%\System32\WindowsPowerShell` path; `Restore-Backup.ps1` stops tray watchdog before restore.
- **Dead files removed** — `Enable-Startup.bat` (stub), `Start-KioskAfterDelay.ps1` (legacy).
- **Release folder** — fully synced at commit db72963, 45 scripts, distribution-ready.
- **Local standalone only** for v1 — no SharePoint/NetworkShare providers yet.

## Version

- Current: `v0.1.0` — tagged and released on GitHub (title: "VRSI Wallboard")
- Latest commit: `db72963` (2026-06-10, Fable audit fixes)
- Next release: bump `server/package.json` → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → create GitHub release

## Files Modified This Session (2026-06-10)

**New files:**
- `scripts/windows/Start-TrayApp.ps1` — tray app (server manager + system tray icon)
- `scripts/windows/Start-TrayApp.bat` — hidden launcher for tray PS1
- `scripts/windows/Restart-WallBoard.ps1` — tray-aware restart with health poll
- `scripts/windows/Restart-WallBoard.bat` — wrapper for restart PS1
- `Start-TrayApp.bat` (repo root) — one-click tray launcher at install root

**Modified:**
- `scripts/windows/_Register-Startup.ps1` — registers `VRSI WallBoard Tray` task, removes legacy server task; `ExecutionTimeLimit([TimeSpan]::Zero)`; logon trigger uses console user
- `scripts/windows/Install-WallBoard.ps1` — shortcut creation (Start WallBoard.lnk + Restart WallBoard.lnk with imageres.dll icons); admin token no longer printed
- `scripts/windows/Uninstall-WallBoard.ps1` — kills tray process by cmdline match; removes Tray task
- `scripts/windows/WallBoard-Menu.bat` — added T=Start tray app option
- `scripts/windows/_common.ps1` — `Stop-WallBoardServer` uses `-State Listen` + verifies ProcessName is `node`
- `scripts/windows/Package-Release.ps1` — includes Start-TrayApp.bat, copies README.md, adds git hash to release-info.json, removes false $LASTEXITCODE check
- `INSTALL.bat` — all %~dp0 paths quoted
- `scripts/windows/Restore-Backup.ps1` — stops tray before restore
- `scripts/windows/Update-WallBoard.ps1` — tray-aware
- `scripts/windows/Register-BackupTask.ps1` — finite ExecutionTimeLimit; graceful non-admin exit
- `scripts/windows/_run.ps1.bat` — absolute powershell.exe path
- `scripts/windows/Start-WallBoard-Service.bat` — quoted path

**Deleted:**
- `scripts/windows/Enable-Startup.bat` (stub, superseded)
- `scripts/windows/Start-KioskAfterDelay.ps1` (legacy, never called)

## Known Issues Status (§10)

- [x] SheetJS CDN fix (npm `xlsx` in server package.json)
- [ ] XLSM configurable path (deferred)
- [x] personIdentity.ts deduplication
- [x] ADMIN_TOKEN gate

## Open Questions

- Soft-delete tombstones for notes: ready to implement when Brian approves schema change

## Context for Next Session

Run `npm start` at repo root. Health: `GET http://localhost:3001/health`. 
App is at v0.1.0. Any new features should bump `server/package.json` version and create a new GitHub release tag.
The `VRSI WallBoard\` folder is fully synced at commit db72963 — ready to copy to any PC and run INSTALL.bat.
Tray app launches at logon via Task Scheduler task `VRSI WallBoard Tray`. To start manually: double-click `Start-TrayApp.bat` in the install root.
