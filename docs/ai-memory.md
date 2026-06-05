# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-05
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)

## Current State

- Last completed task: Restore conflict blocking + shared artifact cleanup
- Next task: None pending
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
- [x] Codex 4-issue fix (build, restore merge, version, Node docs)
- [x] Restore conflict blocking + shared artifact cleanup
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

- `client/tsconfig.node.json` — added `"outDir": ".tsbuild-node"` so vite.config compiled output no longer lands beside source
- `.gitignore` — added `client/.tsbuild-node/`, `client/vite.config.js`, `client/vite.config.d.ts`, `shared/src/*.js`, `shared/src/*.d.ts`
- Deleted from git/disk: `client/vite.config.js`, `client/vite.config.d.ts`, `shared/src/paths.js`, `shared/src/result.js`
- `server/src/services/boardService.ts` — added `version?: number` to local `JobStateEntry`; pass version through `getBoardStateFile()`; increment version in all 6 mutators and in import functions (only on actual change)
- `server/src/storage/localProvider.ts` — replaced overwrite `restore()` with merge-based restore (`_mergeFromBackup`); board_state/notes/jobs merged per §7; conflicts logged to audit_log; pre-restore snapshot kept; config skipped
- `VRSI-WALLBOARD-RULES.md` — Node.js 18+ → 20+ in §1
- `docs/operations-guide.md` — Node.js 18 → 20 in two places
- `shared/src/index.ts` — removed Node-only `paths.ts` export from the shared browser-facing barrel
- `shared/src/storage/types.js`, `shared/src/types/board.js` — deleted stale generated artifacts from source tree
- `.gitignore` — changed shared generated-file ignores to cover nested `shared/src/**/*.js` and `shared/src/**/*.d.ts`
- `server/src/storage/storageTypes.ts` — added restore conflict/result types and updated `restore()` return shape
- `shared/src/storage/types.ts` — mirrored restore conflict/result types in the shared StorageProvider contract
- `server/src/storage/localProvider.ts` — restore now detects close-timestamp version conflicts before merge, logs them, and blocks data changes for user resolution instead of auto-resolving
- `server/src/routes/storage.ts` — returns `409 restore_conflict` with conflict details when restore is blocked
- `client/src/api/storageApi.ts` — added typed restore conflict error handling
- `client/src/components/MonitoringPanel.tsx` — Backup tab reports restore conflicts with sample job/version details

## Known Issues Status (§10)

- [x] SheetJS CDN fix (npm `xlsx` in server package.json)
- [ ] XLSM configurable path (deferred)
- [x] personIdentity.ts deduplication
- [x] ADMIN_TOKEN gate

## Context for Next Session

Run `npm start` at repo root (production build already in place). Health: `GET http://localhost:3001/health`. The app is at v0.1.0 — any new features should bump the version in `server/package.json` and create a new GitHub release tag to trigger the update notification on deployed kiosks.

The `VRSI WallBoard\` folder on disk is the built release artifact (gitignored). Regenerate it with `Package-Release.bat`. Give the folder to users; they run `INSTALL.bat` inside it.
