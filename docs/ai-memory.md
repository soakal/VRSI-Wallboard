# VRSI WallBoard — AI Memory

**Last saved:** 2026-06-17
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)
**Vault record (v0.9.3→v0.14.1 session log):** Obsidian vault → `10-Projects/VRSI-Wallboard-Session-2026-06-16-v0.9.3-to-v0.14.1.md`

---

## Current State

**Version:** v0.15.3 (root + server + client all in sync). 12 commits ahead of remote. Not pushed — Brian is testing locally first.

**Last completed task:** Phase 2 cleanup (cleanup(phase2) commit) + Phase 3A CI (add client build + PS lint job) + Phase 3B tests (update semver, personIdentity, ICS generator — 47 total tests, all pass).

**Next task:** Phase 4 documentation sync — update VRSI-WALLBOARD-RULES.md (§1 version, §10 known-issues status, §19 changelog), then Phase 5 final verification.

**Blockers:** None.

**Machine recovery still needed on the live kiosk (elevated):**
```
icacls "C:\ProgramData\VRSIWallBoard\data" /grant "vrsi\briank:(OI)(CI)M" /T
Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray'
```

---

## This Session Work (2026-06-17 council audit remediation)

Brian said "continue with the rest of phase 1" at session start. Session covered a complete council-audited remediation plan.

### Phase 1 — Critical fixes (all done, committed)
1. **`personIdentity.ts`** — removed hardcoded PII (real employee emails); replaced with `PERSON_ALIASES` env-var (JSON array of alias groups).
2. **`shared/src/types/board.ts`** — cleared PII from `DEFAULT_BOARD_CONFIG` (spareCarrier → `''`, superUsers → `[]`); removed duplicate `Actor` interface.
3. **`.env.example`** — documented `PERSON_ALIASES` and `RESTORE_CONFLICT_WINDOW_MS`.
4. **`scripts/windows/Update-FromRelease.bat`** — added prominent warning for developers (run `Update-WallBoard.bat` on git installs, not this).
5. **`server/src/routes/board.ts`** — field-length validation: `jobNumber` ≤ 100, `noteId` ≤ 100, `spareCarrier`/`superUsers` ≤ 200, `blockedReason` ≤ 1000; import rows truncate display fields at 1000.
6. **`server/src/index.ts`** — DB writability probe at startup (warns with exact `icacls` fix); `dbIntegrity: getDbIntegrityStatus()` in `/health`.
7. **`server/src/auth/tokenRefresher.ts`** — HTTP 429 is now transient, not permanent (was breaking auth after a rate-limit).
8. **`server/src/storage/localProvider.ts`** — `getDbIntegrityStatus()` export; configurable `RESTORE_CONFLICT_WINDOW_MS` (default 60 s).
9. **`scripts/windows/Invoke-WallBoardBackup.ps1`** — copies `tokens.json` sidecar (`<stem>.tokens.json`) after each DB backup; pruning removes matching sidecars.
10. **`scripts/windows/Restore-Backup.ps1`** — offers sidecar token restore to skip re-authentication.

### Phase 2 — Repo hygiene (all done, committed)
- `Package-Release.ps1`: stages in `%TEMP%` (no more `VRSI WallBoard\` in repo root); output zips + sha256 go to `releases/` (gitignored); prints `gh release create` command.
- `releases/` added to `.gitignore` (existing root-level artifact patterns retained for cleanup).
- Deleted stale `VRSI WallBoard\` staging dir from disk.
- `ErrorBoundary.tsx`, `useBoard.ts`: removed `console.error` calls.
- `Dashboard.tsx`: wrapped `agendaMonthLabel` in `useMemo`.
- `TwoWeekView.tsx`: expanded RBC internal-API fragility warning with upgrade checklist.
- `server/src/routes/update.ts`: reject `update-status.json` > 100 KB.
- `server/src/storage/localProvider.ts`: startup sweep deletes `.migrated` files older than 30 days (audit-logged).
- `Restore-Backup.ps1`: requires typing `YES` before disaster-recovery file overwrite.

### Phase 3 — Tests & CI (all done, committed)
- `.github/workflows/test.yml`: added client build step + new `ps-lint` job (`windows-latest`, parse-validates all `scripts/windows/*.ps1`).
- `server/src/routes/update.ts`: exported `isNewer` for testing.
- New test files: `update.test.ts` (9 semver tests), `personIdentity.test.ts` (8 tests), `icsGenerator.test.ts` (7 tests). **47/47 pass.**
- npm audit: server 5 vulns (1 low, 3 moderate, 1 high), client 2 (vite/esbuild — **build-time dev deps only, no runtime risk**). Deferred per the existing network-readiness backlog.

---

## Active Plan

- [x] Phase 1 — Critical security/correctness fixes (10 items)
- [x] Phase 2 — Repo hygiene and cleanup
- [x] Phase 3 — Test coverage + CI
- [ ] Phase 4 — Documentation sync (VRSI-WALLBOARD-RULES.md §1/§10/§19, operations-guide, code-guide) ← **NEXT**
- [ ] Phase 5 — Final verification + sign-off (build, full test suite, local smoke test)

---

## Version History (this session)

| Version | What |
|---------|------|
| v0.15.3 | Phase 2+3 cleanup: repo hygiene, console.* removed, CI fixed, 47 tests |
| v0.15.2 | `blockedReason` saved as permanent note (persists after unblock) |
| v0.15.1 | Board opens in a normal minimizable Edge/Chrome `--app=` window ("VRSI Calendar"), not fullscreen kiosk |
| v0.15.0 | Update-reliability overhaul: empty-stash abort fixed, `update-status.json` + failure banner |
| v0.14.3 | Updater Tier-2: Node-version guard, SHA256 download verify, rollback |
| v0.14.2 | Updater catch: restart existing version if update fails partway |
| v0.14.1 | Tier-1: migration parse guards, crash handlers, integrity_check, WAL checkpoint, retention 3→5 |
| v0.14.0 | XLSX.SSF fix, +12 tests (21 total), CI, log rotation, download-logs button |

---

## Key Decisions Made

### StorageProvider + data path
- `resolveDataDir()` from `lib/paths.ts` — reads `DATA_DIR` env var; defaults to `C:\ProgramData\VRSIWallBoard\data\`
- All routes go through `StorageProvider` — never direct DB/file I/O from route handlers

### Release flow
1. `npm run build` at root
2. `scripts/windows/Package-Release.ps1` (stages in `%TEMP%`, zips to `releases/`, emits `.sha256`)
3. `gh release create vX.Y.Z "releases\VRSI-WallBoard-vX.Y.Z.zip" "releases\VRSI-WallBoard-vX.Y.Z.sha256"`
4. Both assets MUST be uploaded (updater verifies SHA256 before extracting)

### Update paths
- **Kiosk** (no `.git`, no `server/src`): `Update-FromRelease.ps1` — downloads latest GitHub release zip, verifies SHA256, snapshots current dist, copies over, npm install --omit=dev, restarts, rolls back if health check fails
- **Dev** (git clone): `Update-WallBoard.ps1` — git pull, build, restart
- **In-app button**: `/api/update/run` detects which path to use via `.git` presence + `server/src` presence
- The WMI `Win32_Process.Create` launch is required — `powershell.exe` spawned with `detached:true` exits silently without running the script

### Tray app architecture
- Task Scheduler `VRSI WallBoard Tray` → `conhost.exe --headless powershell.exe ... Start-TrayApp.ps1`
- `conhost.exe --headless` prevents taskbar entry even with Windows Terminal as default host
- Principal: `New-ScheduledTaskPrincipal -UserId $consoleUser -LogonType Interactive` (must match logged-in kiosk user, NOT elevated admin)
- Named mutex `VRSIWallBoardTray` for single-instance detection
- Crash-loop protection: max 3 restarts per 60 seconds
- **Tray task must stay ENABLED** — updater re-enables it after update; Phase 1 fix ensures it is never left Disabled

### Board features
- `blocked` flag: blocked jobs leave Project/Spare/Archive tabs; visible ONLY in Blocked tab. Never touched by import. `blockedReason` saved as a permanent note on block so it persists after unblock.
- `statusManual` / `binderManual`: once set by user, import never overwrites those fields
- `PERSON_ALIASES` env var: JSON array of alias groups; site-specific, never committed. Canonicalizes to email form.
- `blockReason` max 1000 chars; validated at PATCH /api/board/jobs/:jobNumber/blocked

### Board opens as normal window (v0.15.1+)
- `--app=http://localhost:3001` flag on Chrome/Edge (not `--kiosk`)
- Window title: "VRSI Calendar"
- Minimizable, closeable — not fullscreen-locked

### Package-Release output (v0.15.3+)
- Staging: `$env:TEMP\vrsi-release-<timestamp>\VRSI WallBoard\` (cleaned up after zip)
- Output: `releases\VRSI-WallBoard-vX.Y.Z.zip` + `releases\VRSI-WallBoard-vX.Y.Z.zip.sha256`
- Both `releases/` and root-level artifact patterns are in `.gitignore`

### Security invariants
- No PII in source code (PERSON_ALIASES → env var; DEFAULT_BOARD_CONFIG → empty strings)
- No hardcoded secrets
- ADMIN_TOKEN gate on all destructive endpoints
- Parameterized SQL only (never string interpolation)
- `tokens.json` AES-256-GCM encrypted; backed up as `.tokens.json` sidecar alongside each DB backup

---

## Known Issues Status (§10 of rules)

| # | Issue | Status |
|---|-------|--------|
| 1 | SheetJS CDN → npm package | ✅ Done (early in project) |
| 2 | XLSM configurable path | Deferred (network-readiness project) |
| 3 | personIdentity.ts deduplication | ✅ Done — single server module; PERSON_ALIASES env var (Phase 1) |
| 4 | ADMIN_TOKEN gate | ✅ Done |

---

## Deferred (network-readiness project)

These were the council's top items but require design decisions or risk the live kiosk:
- Replace/sandbox `xlsx` (SheetJS — unmaintained, unpatched proto-pollution+ReDoS; matters when files come from untrusted sources)
- Per-user identity on board writes (real Azure-AD identity vs. client-supplied `actor`)
- `TRUST_LOCALHOST=false` + gate calendar/SharePoint reads + rate-limiting (breaks the LAN kiosk until CORS + ADMIN_TOKEN are fully wired)
- PIN on destructive kiosk UI actions
- Fleet heartbeat/alerting
- `vite`/`esbuild` build-time dep bump (major version — needs testing first)
- Soft-delete note tombstones (schema change — needs human approval)
- Cryptographic signing of release zip (vs. plain SHA256)

---

## Files Added/Modified This Session (2026-06-17)

**Phase 1 commits (5 commits):**
- `server/src/lib/personIdentity.ts` — PERSON_ALIASES env var; no hardcoded PII
- `shared/src/types/board.ts` — DEFAULT_BOARD_CONFIG cleared; duplicate Actor removed
- `.env.example` — documented PERSON_ALIASES, RESTORE_CONFLICT_WINDOW_MS
- `scripts/windows/Update-FromRelease.bat` — developer warning echo
- `server/src/routes/board.ts` — field-length validation
- `server/src/index.ts` — DB writability probe; dbIntegrity in /health
- `server/src/auth/tokenRefresher.ts` — 429 is transient
- `server/src/storage/localProvider.ts` — getDbIntegrityStatus; RESTORE_CONFLICT_WINDOW_MS; .migrated pruner
- `scripts/windows/Invoke-WallBoardBackup.ps1` — tokens.json sidecar backup + prune
- `scripts/windows/Restore-Backup.ps1` — sidecar restore offer; "type YES" confirmation

**Phase 2 commit:**
- `client/src/components/ErrorBoundary.tsx` — removed console.error
- `client/src/hooks/useBoard.ts` — removed console.error
- `client/src/components/Dashboard.tsx` — useMemo(agendaMonthLabel)
- `client/src/components/calendar/TwoWeekView.tsx` — RBC upgrade checklist comment
- `server/src/routes/update.ts` — update-status.json size check; exported isNewer
- `scripts/windows/Package-Release.ps1` — temp staging; releases/ output; gh command
- `scripts/windows/Restore-Backup.ps1` — YES confirmation gate
- `.gitignore` — releases/

**Phase 3 commits:**
- `.github/workflows/test.yml` — client build + ps-lint job
- `server/src/routes/update.test.ts` — 9 semver tests
- `server/src/lib/personIdentity.test.ts` — 8 identity tests
- `server/src/utils/icsGenerator.test.ts` — 7 ICS tests

---

## Context for Next Session

1. Start server: `npm start` at repo root → `http://localhost:3001`
2. Current test suite: `npm test --prefix server` → 47/47 pass
3. 12 commits ahead of remote — Brian wants to test before any release
4. Machine recovery still needed (elevated PowerShell on kiosk):
   ```powershell
   icacls "C:\ProgramData\VRSIWallBoard\data" /grant "vrsi\briank:(OI)(CI)M" /T
   Enable-ScheduledTask -TaskName 'VRSI WallBoard Tray'
   ```
5. Resume phrase: "Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue."
