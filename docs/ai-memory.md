# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-05
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: Release folder renamed to `VRSI WallBoard`, Opus review fixed 3 issues (casing, stale comment, hardcoded literal)
- Next task: None pending — project is in a clean release state
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
- [x] Opus review of rename — 3 findings fixed
- [ ] Full StorageProvider method implementations (deferred)
- [ ] SharePoint provider (deferred)
- [ ] Audit log UI panel (deferred)
- [ ] XLSM configurable path (deferred)

## Key Decisions Made

- **Local standalone only** for v1 — no SharePoint/NetworkShare providers yet
- **Footer nav**: both Calendar and Projects pages have matching pill-button footers. Active page is blue (`bg-blue-600/70`), inactive is gray (`bg-white/5`). Day/Week/Month is a `<select>` dropdown (not 3 buttons). Calendar/Projects nav replaced the old top-right links in BoardHeader.
- **Update check**: server polls `github.com/soakal/VRSI-Wallboard/releases/latest`, caches 6h (success) / 1h (failure). Client checks on mount + every 6h. Banner shows `Update-WallBoard.bat` instructions. Negative caching prevents rate-limit hammering.
- **Update-WallBoard.ps1**: stops server → git pull --ff-only (with dirty-tree warning) → calls Build-Production.ps1 → restarts server hidden (matches Task Scheduler model) → health checks → kills + relaunches kiosk browser. Menu entry P in WallBoard-Menu.bat.
- **Restore-Backup.ps1** had loop bug: `$i - $files.Count` → `$i -lt $files.Count` (fixed prior session)
- **DisplayModePicker.tsx** deleted (orphaned, replaced by select dropdown in Dashboard footer)
- **boardColors.ts**: removed unused statusIndex, personBubbleColor, boardRouteForTab
- **auditService.ts**: removed unused logFileRead
- **events.ts**: removed unused GraphEvent import
- **ImportView.tsx**: replaced unguarded inline cast with proper ImportResult type from boardApi
- SheetJS via npm `xlsx` package (not CDN tarball)
- Dev `DATA_DIR=./server/data`
- **Release folder**: named `VRSI WallBoard\` (capital B — matches canonical brand). Produced by `Package-Release.ps1`, gitignored. Deploy: copy folder to target PC, run `INSTALL.bat`.
- **Write-Host deploy instruction** in Package-Release.ps1 uses `$(Split-Path $ReleaseDir -Leaf)\` so it always tracks the `$ReleaseDir` variable — no hardcoded literal.

## Version

- Current: `v0.1.0` — tagged and released on GitHub (title: "VRSI Wallboard")
- Next release process: bump `server/package.json` version → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → create GitHub release → kiosks show update banner within 6h

## Files Modified This Session

- `scripts/windows/Package-Release.ps1` — `$ReleaseDir` renamed to `VRSI WallBoard`, header comment fixed, Write-Host line now uses `Split-Path $ReleaseDir -Leaf`
- `.gitignore` — `release/` → `VRSI WallBoard/`
- `scripts/windows/README.md` — updated Package-Release.ps1 description

## Known Issues Status (§10)

- [x] SheetJS CDN fix (npm `xlsx` in server package.json)
- [ ] XLSM configurable path (deferred)
- [x] personIdentity.ts deduplication
- [x] ADMIN_TOKEN gate

## Context for Next Session

Run `npm start` at repo root (production build already in place). Health: `GET http://localhost:3001/health`. The app is at v0.1.0 — any new features should bump the version in `server/package.json` and create a new GitHub release tag to trigger the update notification on deployed kiosks.

The `VRSI WallBoard\` folder on disk is the built release artifact (gitignored). Regenerate it with `Package-Release.bat`. Give the folder to users; they run `INSTALL.bat` inside it.
