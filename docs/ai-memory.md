# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-05
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: v0.1.0 released to GitHub — update check live, scripts folder audited, release folder regenerated
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
- [x] v0.1.0 GitHub release created
- [ ] Full StorageProvider method implementations (deferred)
- [ ] SharePoint provider (deferred)
- [ ] Audit log UI panel (deferred)
- [ ] XLSM configurable path (deferred)

## Key Decisions Made

- **Local standalone only** for v1 — no SharePoint/NetworkShare providers yet
- **Footer nav**: both Calendar and Projects pages have matching pill-button footers. Active page is blue (`bg-blue-600/70`), inactive is gray (`bg-white/5`). Day/Week/Month is a `<select>` dropdown (not 3 buttons). Calendar/Projects nav replaced the old top-right links in BoardHeader.
- **Update check**: server polls `github.com/soakal/VRSI-Wallboard/releases/latest`, caches 6h (success) / 1h (failure). Client checks on mount + every 6h. Banner shows `Update-WallBoard.bat` instructions. Negative caching prevents rate-limit hammering.
- **Update-WallBoard.ps1**: stops server → git pull --ff-only (with dirty-tree warning) → calls Build-Production.ps1 → restarts server hidden (matches Task Scheduler model) → health checks → kills + relaunches kiosk browser. Menu entry P in WallBoard-Menu.bat.
- **Restore-Backup.ps1** had loop bug: `$i - $files.Count` → `$i -lt $files.Count` (fixed this session)
- **DisplayModePicker.tsx** deleted (orphaned, replaced by select dropdown in Dashboard footer)
- **boardColors.ts**: removed unused statusIndex, personBubbleColor, boardRouteForTab
- **auditService.ts**: removed unused logFileRead
- **events.ts**: removed unused GraphEvent import
- **ImportView.tsx**: replaced unguarded inline cast with proper ImportResult type from boardApi
- SheetJS via npm `xlsx` package (not CDN tarball)
- Dev `DATA_DIR=./server/data`

## Version

- Current: `v0.1.0` — tagged and released on GitHub
- Next release process: bump `server/package.json` version → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → create GitHub release → kiosks show update banner within 6h

## Files Modified This Session

- `client/src/components/Dashboard.tsx` — pill export button, dropdown view switcher, Calendar/Projects nav
- `client/src/components/board/BoardLayout.tsx` — matching pill footer, Projects active highlight
- `client/src/components/board/BoardHeader.tsx` — removed Calendar link and System button (now in footer)
- `client/src/components/board/ImportView.tsx` — fixed ImportResult cast
- `client/src/components/board/boardColors.ts` — removed 3 unused exports
- `client/src/App.tsx` — update banner with useUpdateCheck hook
- `client/src/hooks/useUpdateCheck.ts` — new: GitHub release check hook
- `client/src/components/DisplayModePicker.tsx` — DELETED (orphaned)
- `server/src/routes/update.ts` — new: /api/update/check endpoint
- `server/src/routes/events.ts` — removed unused GraphEvent import
- `server/src/services/auditService.ts` — removed unused logFileRead
- `server/src/index.ts` — registered updateRouter
- `scripts/windows/Update-WallBoard.ps1` — new
- `scripts/windows/Update-WallBoard.bat` — new
- `scripts/windows/WallBoard-Menu.bat` — added P option
- `scripts/windows/Restore-Backup.ps1` — fixed loop bug
- `scripts/windows/README.md` — full rewrite, all scripts documented

## Known Issues Status (§10)

- [x] SheetJS CDN fix (npm `xlsx` in server package.json)
- [ ] XLSM configurable path (deferred)
- [x] personIdentity.ts deduplication
- [x] ADMIN_TOKEN gate

## Context for Next Session

Run `npm start` at repo root (production build already in place). Health: `GET http://localhost:3001/health`. The app is at v0.1.0 — any new features should bump the version in `server/package.json` and create a new GitHub release tag to trigger the update notification on deployed kiosks.
