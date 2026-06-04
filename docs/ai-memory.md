# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-04
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: Windows deploy scripts in `scripts/windows/` (build, start, kiosk, backup, Task Scheduler)
- Next task: Run Build-Production on kiosk PC; set production ADMIN_TOKEN; configurable XLSM path
- [x] Audit log + IT Monitoring panel (Ctrl+M), security-report API, api/network audit middleware
- Blockers: None

## Active Plan

- [x] Scaffold + StorageProvider + SQLite local provider
- [x] JSON → SQLite migration on first run
- [x] Port board/config persistence to SQLite
- [ ] Full StorageProvider method implementations (currently board routes + persistence layer)
- [x] Windows Task Scheduler backup script (`Register-BackupTask.ps1`)
- [ ] Audit log UI panel
- [x] ADMIN_TOKEN gate (§10) — dev token in server/.env + client/.env
- [ ] SharePoint provider (deferred)

## Key Decisions Made

- **Local standalone only** for v1 — no SharePoint/NetworkShare providers yet
- Dev `DATA_DIR=./server/data` so bundled JSON from Nexus copy migrates on first boot
- SheetJS via npm `xlsx` package (not CDN tarball)
- Board APIs still unauthenticated (ADMIN_TOKEN is next security item)

## Files Modified This Session

- New: `shared/`, `server/src/storage/*`, `server/src/routes/storage.ts`
- Modified: `server/src/services/boardService.ts`, `configService.ts`, `index.ts`
- Copied: `client/`, `server/src/` from Dakboard Replacement

## Known Issues Status (§10)

- [x] SheetJS CDN fix (npm `xlsx` in server package.json)
- [ ] XLSM configurable path
- [x] personIdentity.ts deduplication
- [x] ADMIN_TOKEN gate

## Context for Next Session

Run `npm install` in `server/` and `client/`, then `npm run dev` in each with `DISABLE_AZURE=true`. Health: `GET http://localhost:3001/health`. Storage: `GET http://localhost:3001/api/storage/status`.
