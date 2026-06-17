# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-17
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)
**Vault record (v0.9.3→v0.14.1 session log):** Obsidian vault → `10-Projects/VRSI-Wallboard-Session-2026-06-16-v0.9.3-to-v0.14.1.md`

---

## Current State

**Version:** v1.1.2 (root + server + client + shared all in sync). Pushed and released on GitHub.

**Last completed task:** Out-of-box defaults — 2-week calendar, weather on (Plymouth MI 48170), files off, spare carrier matto@vrs-inc.com (v1.1.2).

**Next task:** None assigned. Kiosk recovery still needed (see below).

**Blockers / Pending kiosk action:**
To recover an existing kiosk stuck on v1.1.0:
1. As Administrator, delete `C:\Program Files\VRSI WallBoard\server\src`
2. Run `Update-FromRelease.bat` — will download and apply v1.1.1
After that, the in-app Update button works normally forever.

---

## This Session Work (2026-06-17)

### New Features

**Status colors → Settings panel** (`feat(settings)`)
- Colors moved from `/board/users` page into the Settings slide-over panel
- Fold into Save/Discard flow (one button saves everything)
- Color pickers render from `STATUS_ORDER` (imported from shared) — never drift when new statuses are added
- UsersView cleaned up: removed all color state, savedFlash, handleSaveColors

**Three new first-class job statuses** (`feat(status)`)
- `parts_on_order` — orange `#f97316` — job waiting on materials
- `design` — purple `#a855f7` — engineering/design phase
- `build` — teal `#14b8a6` — actively building (Labor Only also maps here)
- `in_progress` kept as catch-all
- STATUS_ORDER: `['none', 'parts_on_order', 'design', 'build', 'in_progress', 'ready_to_ship', 'shipped']`
- Spreadsheet mapper: Build→build, Design→design, Parts on Order/on order→parts_on_order, Labor Only→build, In Progress→in_progress
- Calendar, board cards, status checkboxes, ship agenda all pick up new statuses automatically via existing `statusColors[job.status]` lookups
- Opus review fixes applied: SettingsPanel uses `STATUS_ORDER` (not a local copy); `migrate.ts` uses `DEFAULT_BOARD_CONFIG.statusColors` as fallback

**Fix kiosk self-update** (`fix(updater)` → v1.1.1)
- Root cause: `Package-Release.ps1` was copying `server/src` into the zip; `update.ts` detected `server/src` and routed to `Update-WallBoard.ps1` (git pull); git pull fails silently on kiosk (no `.git`)
- Fix A (`update.ts`): route on `.git` only — not `server/src`
- Fix B (`Update-FromRelease.ps1`): guard on `.git` only; scrub stale `server\src` + `shared\src` after copy
- Fix C (`Package-Release.ps1`): copy only `server\dist` — exclude `server/src` (comment explains why)

---

## Version History

| Version | What |
|---------|------|
| v1.1.2 | Out-of-box defaults: 2-week view, weather on (48170), files off, spare carrier set |
| v1.1.1 | Fix kiosk self-update (update routing, guard, package script) |
| v1.1.0 | New job statuses (parts_on_order, design, build); status colors in Settings |
| v1.0.0 | First numbered release (council audit remediation complete: Phases 1–4) |
| v0.15.3 | Phase 2+3 cleanup: repo hygiene, console.* removed, CI fixed, 47 tests |
| v0.15.2 | `blockedReason` saved as permanent note |
| v0.15.1 | Board opens in normal `--app=` window, not fullscreen kiosk |
| v0.15.0 | Update-reliability overhaul: empty-stash abort fixed, failure banner |

---

## Key Decisions

### Job status flow
`none` → `parts_on_order` → `design` → `build` → `in_progress` → `ready_to_ship` → `shipped`
- `in_progress` is a catch-all (e.g. "Labor Only" from spreadsheet)
- Each status has a color in `DEFAULT_BOARD_CONFIG.statusColors`; user can override in Settings

### Release flow
1. `npm run build` at root
2. `scripts/windows/Package-Release.ps1` (stages in `%TEMP%`, zips to `releases/`, emits `.sha256`)
   - Ships `server/dist` only — NO `server/src` (critical — its presence routes updates to git-pull)
3. `gh release create vX.Y.Z "releases\VRSI-WallBoard-vX.Y.Z.zip" "releases\VRSI-WallBoard-vX.Y.Z.sha256"`
4. Both assets MUST be uploaded (updater verifies SHA256 before extracting)

### Update paths
- **Kiosk** (no `.git`): `Update-FromRelease.ps1` — downloads latest GitHub release zip, verifies SHA256, snapshots current dist, copies over, npm install --omit=dev, restarts, rolls back if health check fails
- **Dev** (`.git` present): `Update-WallBoard.ps1` — git pull, build, restart
- **In-app button**: `/api/update/run` — detects via `.git` presence ONLY (not `server/src`)
- WMI `Win32_Process.Create` launch is required — `powershell.exe` with `detached:true` exits silently

### StorageProvider + data path
- `resolveDataDir()` from `lib/paths.ts` — reads `DATA_DIR` env var; defaults to `C:\ProgramData\VRSIWallBoard\data\`
- All routes go through `StorageProvider` — never direct DB/file I/O from route handlers

### Tray app architecture
- Task Scheduler `VRSI WallBoard Tray` → `conhost.exe --headless powershell.exe ... Start-TrayApp.ps1`
- Named mutex `VRSIWallBoardTray` for single-instance detection
- Principal: `New-ScheduledTaskPrincipal -UserId $consoleUser -LogonType Interactive`
- Crash-loop protection: max 3 restarts per 60 seconds
- Tray task must stay ENABLED — updater always re-enables it on every exit path

### Board features
- `blocked` flag: blocked jobs leave Project/Spare/Archive tabs; visible ONLY in Blocked tab. Never touched by import. `blockedReason` saved as a permanent note on block so it persists after unblock.
- `statusManual` / `binderManual`: once set by user, import never overwrites those fields
- `PERSON_ALIASES` env var: JSON array of alias groups; site-specific, never committed
- Merge-never-overwrite on import and restore

### Security invariants
- No PII in source code (PERSON_ALIASES → env var; DEFAULT_BOARD_CONFIG → empty strings)
- No hardcoded secrets
- ADMIN_TOKEN gate on all destructive endpoints
- Parameterized SQL only
- `tokens.json` AES-256-GCM encrypted; backed up as `.tokens.json` sidecar

---

## Known Issues / Deferred

| # | Issue | Status |
|---|-------|--------|
| 1 | SheetJS CDN → npm package | ✅ Done |
| 2 | XLSM configurable path | Deferred (network-readiness project) |
| 3 | personIdentity.ts deduplication | ✅ Done — PERSON_ALIASES env var |
| 4 | ADMIN_TOKEN gate | ✅ Done |
| 5 | Import result counter misses new statuses (parts_on_order/design/build show as 0) | Known, display-only, low priority |

**Deferred (network-readiness project):**
- Replace/sandbox `xlsx` (SheetJS — unmaintained, unpatched vulns)
- Per-user identity on board writes (real Azure-AD identity vs. client-supplied `actor`)
- `TRUST_LOCALHOST=false` + rate-limiting
- PIN on destructive kiosk UI actions
- Fleet heartbeat/alerting
- `vite`/`esbuild` dep bump (major version, needs testing)
- Soft-delete note tombstones (schema change — needs human approval)
- Cryptographic signing of release zip

---

## Test Suite

`npm test --prefix server` → **47/47 pass**

Key test files:
- `server/src/services/boardService.test.ts` — import logic, manual locks, blocked routing
- `server/src/services/boardParsing.test.ts` — spreadsheet status mapping (all 7 statuses covered)
- `server/src/routes/update.test.ts` — semver comparison
- `server/src/lib/personIdentity.test.ts` — identity canonicalization
- `server/src/utils/icsGenerator.test.ts` — ICS generation

---

## Context for Next Session

1. Start server: `npm start` at repo root → `http://localhost:3001`
2. Current test suite: `npm test --prefix server` → 47/47 pass
3. Latest release: v1.1.1 on GitHub
4. **Kiosk recovery still needed** (if kiosk is on v1.1.0):
   ```powershell
   # As Administrator on the kiosk:
   Remove-Item "C:\Program Files\VRSI WallBoard\server\src" -Recurse -Force
   # Then double-click Update-FromRelease.bat
   ```
5. Resume phrase: "Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue."
