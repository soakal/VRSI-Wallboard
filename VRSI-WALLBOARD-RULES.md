# VRSI WallBoard — Project Rules & AI Standards
**Date:** June 4, 2026
**Author:** BK
**Copyright © VRSI**
**Purpose:** Single source of truth for how the VRSI WallBoard is built and maintained.
Read this at the start of every Claude Code / Cursor session. No exceptions.

---

## ⚡ Quick Start

**Starting a new session:**
> "Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue."

**First time on a new machine:**
> "Read VRSI-WALLBOARD-RULES.md. Scan the repo. Fill in everything you can detect, then ask me for the rest."

---

## 0. Session Protocol (DO THIS EVERY SESSION)

The AI must output this checklist at the start of every session — no silent skipping:

```
## ✅ SESSION START — VRSI WallBoard
- [ ] VRSI-WALLBOARD-RULES.md read in full
- [ ] docs/ai-memory.md read — last task: _____, next task: _____
- [ ] Project structure scanned
- [ ] Storage provider confirmed: Local | NetworkShare | SharePoint
- [ ] Windows deployment target confirmed
- [ ] Exchange counter reset to 0
Ready. Proceeding with: _____
```

### Commands You Can Type Anytime
| Command | What happens |
|---------|-------------|
| `/wrap` | Save everything, commit, output resume instructions |
| `/checkpoint` | Save memory + commit, keep working |
| `/status` | Show current exchange count and active task |

### Save Procedure (triggered at 30 exchanges, or when you type /wrap)
```
1. Stop at a safe point — never mid-edit, never mid-migration
2. Update docs/ai-memory.md with full current state
3. Update §1 Project Identity if anything changed
4. Commit: git add . && git commit -m "chore(ai): save session [agent]"
5. Output: "Saved. Type /clear then: Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue."
```

### Every 10 Exchanges
AI outputs one re-anchor line before responding:
```
[Exchange N | Working on: ___ | Storage: Local/NetworkShare/SharePoint]
```

---

## 1. Project Identity

```
PROJECT_NAME    = VRSI WallBoard
FORMERLY        = Nexus Kiosk (Dakboard Replacement)
VERSION         = 0.1.0
COPYRIGHT       = Copyright © VRSI. All Rights Reserved.
NORTH_STAR      = A job board + calendar display that works standalone on
                  Windows today and upgrades to SharePoint collaboration
                  with a single config switch — no rewrite required
TARGET_USERS    = VRSI enterprise staff on Windows machines
STACK           = React 18 + Vite + TypeScript (frontend)
                  Node.js 20+ + Express + TypeScript (backend)
                  SQLite (local) → SharePoint Lists (collaborative)
DEPLOY_TARGET   = Windows-native (Node.js process + browser kiosk mode)
STORAGE_MODE    = Local | NetworkShare | SharePoint  ← CONFIRM EACH SESSION
AUTH            = Azure Device Code Flow (MSAL) + Entra ID
LAST_UPDATED    = June 4, 2026
```

---

## 2. The One Rule That Cannot Break

**The app never talks to storage directly. It only ever calls the StorageProvider interface.**

```typescript
interface StorageProvider {
  getJob(jobNumber: string): Promise<Result<BoardJob>>
  listJobs(filter?: JobFilter): Promise<Result<BoardJob[]>>
  writeJobState(jobNumber: string, state: JobState): Promise<Result<void>>
  deleteJobState(jobNumber: string): Promise<Result<void>>
  addNote(jobNumber: string, note: Note): Promise<Result<Note>>
  updateNote(jobNumber: string, noteId: string, text: string): Promise<Result<Note>>
  deleteNote(jobNumber: string, noteId: string): Promise<Result<void>>
  getConfig(): Promise<Result<AppConfig>>
  writeConfig(config: Partial<AppConfig>): Promise<Result<AppConfig>>
  getBoardConfig(): Promise<Result<BoardConfig>>
  writeBoardConfig(config: Partial<BoardConfig>): Promise<Result<BoardConfig>>
  importJobs(jobs: Job[]): Promise<Result<ImportResult>>
  backup(destination: string): Promise<Result<void>>
  restore(source: string): Promise<Result<void>>
}
```

Break this rule = you've created a future rewrite. At every session start, verify no code bypasses this interface.

**Providers:**
| Provider | Backend | Status |
|----------|---------|--------|
| `LocalStorageProvider` | SQLite (`wallboard.db`) | Build first |
| `NetworkShareProvider` | UNC path / mapped drive | Add if needed |
| `SharePointProvider` | Microsoft Graph API | The goal |

---

## 3. Data Model (never change without updating this file)

### Jobs (from `jobs.json` — preserve exactly)
```json
{
  "jobNumber": "424-9612A",
  "pm": "quinteng@vrs-inc.com",
  "customer": "Rivian",
  "materialsManager": "matm@vrs-inc.com",
  "pabsComplete": "2025-08-01",
  "shipToPm": "2025-07-04",
  "shipToCustomer": "2025-09-12"
}
```

### Board State (add `version` field to existing schema)
```json
{
  "424-9612A": {
    "status": "shipped",
    "shipDateOverride": null,
    "shipDateOverrideNote": null,
    "binderPrinted": false,
    "statusManual": false,
    "binderManual": false,
    "blocked": false,
    "blockedAt": null,
    "blockedReason": null,
    "version": 1,
    "notes": [
      {
        "id": "uuid",
        "text": "Waiting on vendor quote",
        "authorId": "board-user-uuid",
        "authorName": "Jon Shantry",
        "createdAt": "2026-06-01T14:23:00.000Z",
        "updatedAt": "2026-06-01T14:23:00.000Z"
      }
    ],
    "updatedAt": "2026-06-02T22:01:41.806Z"
  }
}
```

**Rules:**
- All IDs are UUIDs (strings) — never integers
- All timestamps ISO 8601 UTC: `2026-06-04T10:30:00Z`
- `version` increments on every write — conflict detection for SharePoint sync
- Soft deletes only — never hard-delete board state with notes (`deleted: true` flag)
- Ops Schedule notes (`authorId === "system:ops-schedule"`) replaced on each import, read-only in UI
- Orphaned board state WITH notes: never pruned (data safety rule — must be preserved)
- `statusManual` / `binderManual`: set `true` once a user changes status / the binder checkbox by hand.
  When set, import never overwrites that field (see §7). New/untouched jobs (flag `false`) still
  auto-fill from the spreadsheet. Set on first column-add for any pre-existing row with a non-empty
  `updatedBy` (those were user-touched under the old code).
- `blocked` / `blockedAt` / `blockedReason`: manual triage. A blocked job shows ONLY in the Blocked
  tab (removed from Project/Spare/Archive). Never set or cleared by import; a blocked job dropped from
  the spreadsheet is preserved by `pruneOrphanedBoardState`.
- `jobs_import_meta.changed_note_job_numbers` (JSON array, transient — recomputed each import like
  `new_job_numbers`): job numbers whose Ops Schedule note the latest import added/changed. Surfaced as
  the computed `BoardJob.hasNewNote`. `BoardTab` now includes `'blocked'`.

### Config (`config.json`) and Board Config (`board-config.json`)
Preserve all existing fields exactly. See master build plan §Data Model for full field lists.

---

## 4. Database

**Current phase: SQLite**
- Single file: `wallboard.db`
- Backup = copy this one file. Restore = copy it back.
- Use SQLite `.backup` API — safe copy while app is running
- JSON export available for human-readable snapshots and SharePoint migration
- On first run: auto-migrate existing JSON files → SQLite, rename originals to `.migrated`

**Migration rule:** Never change the database schema without a migration file. One migration = one change.

**Future phase: SharePoint Lists or PostgreSQL**
- Same StorageProvider interface — swap the provider, app logic unchanged

---

## 5. Architecture Principles

| Principle | Rule |
|-----------|------|
| Storage abstraction | App talks to StorageProvider only — never direct DB or file I/O |
| Merge, never overwrite | Import and restore always merge — never blind-replace |
| IDs and timestamps are truth | Conflict resolution based on `updatedAt` + `version` |
| Windows-native | No Linux paths, no bash scripts, no systemd — Node.js + Windows APIs |
| Preserve existing behavior | Zero feature loss from existing Nexus app — port, don't reinvent |
| Small API surface | Fewer endpoints = less to maintain |
| Fix known issues | Four issues must be fixed in the rebuild (see §10) |

---

## 6. Windows Deployment Rules

- App runs as a Windows-native Node.js process — no Docker, no WSL, no Linux
- Data directory: `C:\ProgramData\VRSIWallBoard\data\` (configurable via `DATA_DIR` in `.env`)
- Backup directory: `C:\ProgramData\VRSIWallBoard\backups\` (configurable via `BACKUP_DIR`)
- Logs: `C:\ProgramData\VRSIWallBoard\logs\`
- Kiosk mode: launch Chrome/Edge with `--kiosk http://localhost:3001` via Windows startup, OR Electron wrapper
- Backup schedule: Windows Task Scheduler replaces systemd timer (every 6 hours, 28 copies retained)
- Nightly watchdog: `window.location.reload()` at 3:00 AM — preserve from existing app
- Atomic writes: temp→rename pattern must be explicitly tested on Windows (POSIX behavior differs)

---

## 7. Merge & Conflict Rules

**XLSM import:**
1. New jobs (not in DB) → insert
2. Existing jobs → update from spreadsheet data
3. Board state (status, notes, overrides) → never touched by import
   - 3a. A status or binder checkbox the user set by hand (`statusManual` / `binderManual` true) is
     never reverted by import; new/untouched jobs still take the spreadsheet's status/binder.
   - 3b. User-added notes → never touched by import.
4. Ops Schedule notes → replaced by latest import
5. Orphaned board state WITH notes → never pruned

**Backup restore:**
1. New records → append
2. Unchanged records (same `version`) → skip
3. Updated records (one side newer `updatedAt`) → newest wins
4. Conflicted records (both modified, close timestamps) → flag for user resolution
5. Conflict UI: show both versions, let user pick, log resolution in audit log

---

## 8. Audit / Monitoring Log

Every file operation and network call must be logged. This is the primary trust-builder with IT.

**Log every:**
- File read/write: path, timestamp, operation, size, success/fail
- Network request: URL, method, destination, payload size, response code
- Backup/restore: source, destination, record count, timestamp
- Conflict resolutions: which record, what was chosen, by whom
- Token refresh events

**Log format:**
```json
{
  "timestamp": "ISO8601-UTC",
  "type": "file_write | file_read | network_request | backup | restore | conflict | token_refresh",
  "detail": "human readable description",
  "path": "file path or URL",
  "success": true,
  "sizeBytes": 0
}
```

**Rules:**
- Visible in a dedicated Monitoring panel in the UI — not buried
- Stored in `audit_log` table in SQLite — travels with backup
- In standalone mode: ONLY localhost traffic should appear in network log
- Never log passwords, tokens, or PII beyond display names

---

## 9. Backup & Restore

**Standalone:**
- Schedule: every 6 hours (Windows Task Scheduler), retain 28 copies
- Method: SQLite `.backup` API — safe while running
- Destinations: configurable folder, USB drive, or network share path
- Reminder: warn in UI if no backup in 24 hours
- On failure: warn clearly, retain previous backup, log failure
- JSON export: available for portability and SharePoint migration

**SharePoint phase:**
- SharePoint version history + recycle bin handles backup automatically
- Custom backup system retires — do not gold-plate it before getting here

---

## 10. Known Issues — Fix in This Rebuild

| # | Issue | Fix |
|---|-------|-----|
| 1 | SheetJS installed from CDN tarball (`cdn.sheetjs.com`) — `npm install` fails if CDN unreachable | Move to standard npm package |
| 2 | XLSM source path hardcoded to VMware drag-and-drop cache (fragile, not stable) | Configurable path in settings + SharePoint auto-pull when available |
| 3 | `personIdentity.ts` duplicated on both client and server — must stay in sync manually | Single shared module in `/shared/` or `/lib/` |
| 4 | Board APIs fully unauthenticated on LAN | Implement `ADMIN_TOKEN` gate on all `/api/board/*` endpoints |

---

## 11. Features to Preserve (zero feature loss)

All of the following must exist in VRSI WallBoard exactly as they work in the existing Nexus app:

**Dashboard:**
- Calendar Day/Week/Month views (Week = always `week` view, never `work_week` — crashes on weekend events)
- Weekends hidden via CSS clip (`.weekends-hidden`), not by omitting data
- AgendaRail sidebar, Clock, WeatherWidget, NextEventBadge, RecentFilesWidget, StalenessIndicator
- Ship-date events synthesized from board jobs, `boardTab` field for routing
- Nightly watchdog at 3:00 AM
- Keyboard shortcuts: `Ctrl+S`, `Ctrl+F`, `D/W/M`, `Esc`

**Settings Panel:** All existing settings preserved — calendar picker, display mode, weekends, hours, refresh interval, theme, timezone, clock format, temp unit, weather, agenda rail, recent files, SharePoint sites, file open mode.

**File Browser Panel:** SharePoint sites → drives → recent files, file icons, open mode.

**Auth Setup:** Azure Device Code Flow, QR code, auto-poll, redirect on success.

**Project Board:** All tabs (Project / Spare Parts / Archive / Users / Import), job cards with all fields, PM/MM filters (sessionStorage persistence), 30-day ship agenda, users view, import view.

**Board rules:** Spare job classification, binder checkbox hidden on spare jobs, Ops Schedule notes behavior, orphaned state preservation, person name canonicalization, `isNew` badge, presence tracking (in-memory, 30s TTL), no auth on board (LAN-accessible — ADMIN_TOKEN gate is the new fix).

**Test mode:** `DISABLE_AZURE=true` disables all Microsoft calls, returns mock data, board unaffected.

---

## 12. API Design

All existing endpoints preserved exactly. New endpoints added:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/storage/status` | Active provider + health |
| `POST` | `/api/backup` | Trigger manual backup |
| `POST` | `/api/restore` | Trigger restore + merge |
| `GET` | `/api/audit-log` | Get audit log entries |
| `GET` | `/health` | Preserved — same response shape |

**Response format always:** `{ data: <payload> }` or `{ error: { code, message } }`

---

## 13. Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | No | 3001 | HTTP server port |
| `NODE_ENV` | No | development | `production` = strict CORS |
| `CORS_ORIGIN` | Yes in prod | — | Never `*` |
| `ENCRYPTION_SECRET` | Yes* | — | AES-256-GCM (*unless DISABLE_AZURE) |
| `AZURE_TENANT_ID` | Yes* | — | *Unless DISABLE_AZURE |
| `AZURE_CLIENT_ID` | Yes* | — | *Unless DISABLE_AZURE |
| `DISABLE_AZURE` | No | false | Mock mode; board unaffected |
| `LOG_LEVEL` | No | info | debug/info/warn/error |
| `DATA_DIR` | No | `C:\ProgramData\VRSIWallBoard\data` | Override data path |
| `BACKUP_DIR` | No | `C:\ProgramData\VRSIWallBoard\backups` | Override backup path |

---

## 14. SharePoint / M365 Upgrade Path

When IT approves:
1. Write `SharePointProvider` — implements StorageProvider interface, reuses existing MSAL code
2. Board state → SharePoint List items
3. Jobs → SharePoint List items (or direct pull from SharePoint-hosted XLSM)
4. User switches storage mode in settings → authenticates with work account → done
5. Existing data migrates via JSON export → SharePoint import
6. XLSM auto-pull from SharePoint replaces manual upload (fixes hardcoded path issue)
7. Custom backup retires — SharePoint versioning takes over

**IT pitch:** "It runs on SharePoint using your existing work logins. We're not putting anything new on your network — we're building on infrastructure you already run."

---

## 15. AI Agent Rules

### Use the right model for the right job
| Role | Model | When |
|------|-------|------|
| **Planner** | Claude Opus 4.8 | Architecture, breaking down tasks, code review |
| **Writer** | Claude Sonnet 4.6 | Writing code, docs, implementing a scoped task |
| **Fast** | Claude Haiku 4.5 | Scanning files, parsing output, simple lookups |

**Pipeline:** Planner produces numbered task list → Writer implements one task at a time → Critic (Opus) approves or returns with specific failure reason → max 3 retries before human escalation.

### Session memory
- Read `docs/ai-memory.md` at session start — always
- Write `docs/ai-memory.md` before `/clear` — always
- Never clear context without saving memory first
- At 30 exchanges: full save + commit + output resume instructions

### Human ownership
- Review every line before committing
- Never paste secrets into any AI prompt
- Agent decisions are not final in production without human approval

---

## 16. Definition of Done

A task is done when:

- [ ] StorageProvider interface not bypassed anywhere in new code
- [ ] Existing feature behavior preserved exactly (zero feature loss)
- [ ] Windows file paths used — no Linux paths or bash
- [ ] Audit log captures relevant operations for the task
- [ ] Merge logic handles new data correctly (never overwrites)
- [ ] Data model matches §3 exactly (or §3 is updated if fields changed)
- [ ] Known issues list (§10) checked — fix if this task touches those areas
- [ ] `docs/ai-memory.md` updated if work spanned multiple sessions
- [ ] Committed with a clear message: what changed and why

---

## 17. Session Memory File

Location: `docs/ai-memory.md`

```md
# VRSI WallBoard — AI Memory

**Last saved:** YYYY-MM-DD HH:MM UTC
**Storage mode:** Local | NetworkShare | SharePoint
**Windows data path:** C:\ProgramData\VRSIWallBoard\data\

## Current State
- Last completed task:
- Next task:
- Blockers:

## Active Plan
- [x] Completed task
- [ ] Next task ← NEXT
- [ ] Future task

## Key Decisions Made
(decisions not yet obvious from the code)

## Files Modified This Session
- path/to/file.ts — what changed

## Known Issues Status (§10)
- [ ] SheetJS CDN fix
- [ ] XLSM configurable path
- [ ] personIdentity.ts deduplication
- [ ] ADMIN_TOKEN gate

## Open Questions
(waiting on human input)

## Context for Next Session
(anything the next agent needs to know)
```

---

## 18. What AI Must Never Do

- Bypass the StorageProvider interface — no direct DB, file, or SharePoint calls from routes or components
- Hard-delete any board state record that has notes — always soft delete or preserve
- Overwrite on import or restore — always merge
- Use Linux file paths (`/home/`, `/var/`, `/etc/`) — Windows paths only
- Write bash scripts or systemd units — Windows equivalents only
- Hardcode secrets, API keys, or connection strings
- Clear context without writing `docs/ai-memory.md` first
- Change §2 (The One Rule) or §3 (Data Model) without explicit human approval
- Add a library without checking: permissive license (MIT/Apache/BSD/ISC), last updated, actually needed
- Make the SheetJS CDN mistake again — always use the npm package

---

## 19. Change Log
> Append-only. Never edit past entries.

| Date | Who | What changed | Why |
|------|-----|-------------|-----|
| 2026-06-03 | BK | Created NEXUS-RULES.md | First session |
| 2026-06-04 | BK | Renamed to VRSI-WALLBOARD-RULES.md, integrated full existing app spec, added Windows deployment rules, known issues list, features to preserve, environment variables | Project renamed to VRSI WallBoard; full spec integrated |
| 2026-06-10 | BK+AI | Added Windows system tray icon (Start-TrayApp.ps1) — server now managed via tray at logon; Task Scheduler task renamed to `VRSI WallBoard Tray`; added Restart-WallBoard.ps1/bat, pretty-icon shortcuts (.lnk) created by installer; Fable security/correctness audit — 21 findings fixed, 2 dead files removed, release folder verified distribution-ready | Tray icon for visibility + control; audit hardened security and correctness |
| 2026-06-10 | BK+AI | Taskbar fix: Application::Run($hiddenForm) ShowInTaskbar=false — process no longer appears in taskbar; Fable verify pass — 8 more findings: Principal fix for UAC-split kiosks (HIGH), port-squatter MessageBox, node-check in scripts bat, watchdog always re-enables after restart, tray-kill process filter, mutex dispose, docs accuracy, Package-Release excludes dev scripts and ships ops guide | Second Fable audit pass; docs fully updated |
| 2026-06-10 | BK+AI | Replaced wscript.exe+VBS tray launcher with `conhost.exe --headless` in _Register-Startup.ps1, Start-TrayApp.bat (root+scripts), Start-TrayApp.ps1 STA guard, Restart-WallBoard.ps1 fallback; deleted Start-TrayApp.vbs; bumped version to 0.2.0 and tagged release | VBS never shipped in release (Package-Release copies only *.ps1/*.bat) so kiosk startup failed; VBScript is deprecated on Win11 24H2+; conhost --headless guarantees no taskbar window even with Windows Terminal as default host |
| 2026-06-10 | BK+AI | Data model §3: `BoardConfig.superUser: string` → `superUsers: string[]` (BK approved — requested multiple super users); legacy single string auto-folded into list at read (localProvider.getBoardConfigRaw) and JSON migration; UsersView now has add-dropdown + removable list with instant save; v0.3.0 | Multiple super users, easy to change |
| 2026-06-10 | BK+AI | v0.4.0: calendar page gets user picker (footer + mobile nav) and agenda rail filters ship-date events to the selected PM/Materials user (super users + no selection see all); board calendar events now carry isNew/jobPm/jobMm; NEW badge on calendar chips + agenda rail; Projects tabs get a "New (n)" toggle that filters to newly imported jobs | BK requested per-user agenda, NEW flag visibility in calendar, new-items filter, and user selection on the calendar page |
| 2026-06-10 | BK+AI | v0.5.0: `UiConfig.showFiles` toggle (default true) — Settings → Files section enables/disables the Files browser; when off the Files button (desktop footer + mobile), Ctrl+F shortcut, and FileBrowserPanel are hidden | BK requested enable/disable Files in settings |
| 2026-06-10 | BK+AI | v0.5.1: AgendaRail now shows the next 14 days grouped by day (Today/Tomorrow/dated sections) instead of only today+tomorrow; useEvents day-mode fetch span 14→21 days | Agenda was permanently empty — ship dates rarely land exactly today/tomorrow and standalone mode has no Outlook events |
| 2026-06-10 | BK+AI | v0.5.2: AgendaRail horizon changed from 14 days to the current week (today → week end; week start matches calendar: Sun, or Mon when weekends hidden) | BK requested the agenda show the current week |
| 2026-06-10 | BK+AI | v0.6.0: Settings → About & Updates shows current version + Update button; `POST /api/update/run` (admin-gated) launches the update script detached — git installs run Update-WallBoard.ps1 -Unattended, kiosk installs run new Update-FromRelease.ps1 (downloads latest GitHub release zip, stops tray/server, copies over install, npm install --omit=dev, restarts tray + kiosk browser, logs to update.log); client polls and reloads when the new version comes up | BK requested version display + one-click update in settings |
| 2026-06-10 | BK+AI | v0.6.1: update check returns `currentReleaseUrl` and Settings release-notes link targets the running version when up to date; AgendaRail horizon extended to today → end of NEXT week (current week alone was empty for nearly all users — jobs ship the following Monday); docs audit: README.md + scripts/windows/README.md rewritten, operations-guide gains §1.5 Updating + corrected data table + quick reference, Node 18→20 in CLAUDE.md/AGENTS.md/build-plan | Release-notes link opened stale release; agenda empty for most users; docs outdated |
| 2026-06-10 | BK+AI | v0.7.0 (agent-audited agenda overhaul): new client/src/lib/agendaFilter.ts is the single source of truth — selected user sees board jobs where they are PM **or** MM (role-based single-field matching hid half a person's jobs); manual-role users are now filtered (was: saw everything); stale localStorage activeUser auto-resyncs against the live users list (App.tsx); agenda covers the whole month — amber Past-due day sections from month start + Today→month-end (min 14 days); useEvents fetches month start → today+45d in all modes; Users + Import tabs moved from board header into Settings → Board (gear button added to board header for mobile) | BK: agenda leaked everyone's jobs and hid past-due (chandlerc's Jun 5 jobs invisible); wanted month coverage and Users/Import in Settings |
| 2026-06-11 | BK+AI | v0.9.0: calendar can navigate to other months — ‹ › / Today controls in the footer (desktop + mobile) step by the current view (day/week/month); CalendarView is date-controlled (`viewDate` in appStore); the agenda rail follows the displayed month (other months list all that month's events; current month keeps past-due + today→month-end); useEvents widens its fetch window to cover the navigated month; Projects footer Files button now respects the Settings → Files toggle (was always visible) | BK requested month navigation, agenda following the displayed month, and the hidden-Files setting applying on Projects too |
| 2026-06-11 | BK+AI | v0.9.2: Projects board user picker (BoardHeader) now leads with "👤 All users" (shows every job — matches the calendar page) instead of the "— Select user —" prompt, plus the same stale-saved-user guard the calendar footer uses. Board already showed all jobs when no user was selected (JobListView `!activeUser` → no role filter); this just makes the all-users view an explicit, labeled choice. Picking a name still filters to their jobs and enables card editing. | BK: Projects had the imported users + Jon Shantry but no "all users" choice like the calendar |
| 2026-06-11 | BK+AI | Update-button permission fix (root cause found on the test kiosk): the in-app updater runs as the non-admin kiosk user, which cannot overwrite files under `C:\Program Files` — `Update-FromRelease.ps1` stopped the server then died at the copy step with "Access is denied" on `client\dist\index.html`, leaving the board down (server stopped + tray task disabled). Fix: `Install-WallBoard.ps1` now grants the console user Modify on the install tree via `icacls "$RepoRoot" /grant "<user>:(OI)(CI)M" /T` (admin-gated, inherits to files from future updates). Existing kiosks repaired with the same one-time icacls grant; the v0.8.3 success was a one-off, NOT proof the button was immune. Ships in next release. | The "in-app button is immune because the updater runs as the server's own user" assumption was wrong — that user lacked write permission to Program Files |
| 2026-06-11 | BK+AI | v0.9.0 also: audit_log retention — entries older than 90 days deleted at startup and daily at 3:30 AM (`startAuditPruneCron` in auditService, `pruneAuditLog` on BoardPersistence); `idx_audit_timestamp` index added via idempotent SCHEMA_SQL (applies to existing DBs on next start) | Audit log was the only unbounded table — would slow the Monitoring panel after years of kiosk uptime |
| 2026-06-12 | BK+AI | Added `e2e/` Playwright **visual tours** (first browser-automation harness in the repo): two paced + narrated walkthroughs (screenshots + universal MP4 via ffmpeg) — `01-upgrade` (in-app Update UI, API stubbed so no real update runs; install/script-fallback in `e2e/UPGRADE-RUNBOOK.md`) and `02-feature-tour` (calendar/agenda/settings/files-toggle/monitoring/board/users). Own server on :3100, mock mode, throwaway data dir wiped before start, demo data seeded via `/api/board/import` (no direct DB writes). `@playwright/test` root devDep; `npm run e2e:tour`/`e2e:report`/`e2e:video`. Docs-only verification asset, no app/runtime changes | BK wanted shareable walkthroughs of install→upgrade and all features on mock data; follow-ups: slow enough to watch + a universal (MP4) format |
| 2026-06-16 | BK+AI | v0.14.0: hardening + diagnosability (council backlog). **Latent bug fixed:** `parseDateValue` threw on a numeric Excel date serial because `import * as XLSX` dropped `XLSX.SSF` — switched to a default import + added a guard; a numeric date cell could otherwise crash an import. Added a second test file `boardParsing.test.ts` (parseDateValue, detectColumns, status mapping, complete-flag, isSpareJob, getJobBoardTab — 12 tests; suite now 21). Added GitHub Actions CI (`.github/workflows/test.yml`: build shared+server, run `npm test`). Log rotation (winston `maxsize`/`maxFiles`, no new dep) so logs can't fill the disk. New admin-gated `GET /api/storage/logs-export` (tail-capped 5 MB) + a "Download logs" button in the Monitoring panel for remote diagnosis. Running version now shown in the Monitoring panel header. Weak-`ENCRYPTION_SECRET` startup warning (non-fatal). Note: the installer's `New-AdminToken` was already 192-bit crypto-random (the earlier "weak token" finding was wrong). DEFERRED (needs a design decision / would risk the live kiosk): per-user identity on board writes, flipping TRUST_LOCALHOST default, gating calendar/sharepoint reads, rate-limiting, the vite/esbuild build-time dep bump — these belong to the network-deployment project. | BK approved the backlog cleanup |
| 2026-06-16 | BK+AI | v0.13.0: reliability + UX quick-wins (council follow-up). (1) Backup-staleness warning — `/health` now returns `lastBackupAt`/`backupStale` (via `localProvider.getLastSuccessfulBackupAt()`, only stale once backups WERE happening then stopped >24h, so fresh/dev installs don't nag); new `useHealth` hook polls it and the Dashboard shows an amber "No successful backup in over 24 hours — check the backup drive" banner (StalenessIndicator). (2) Ship-date override validation — the PATCH ship-date route rejects anything but null or strict YYYY-MM-DD (a malformed date would have broken the whole ICS export). (3) Import-overwrite confirm — ImportView now asks before importing and the description was corrected (import MERGES; manual status/checkmarks/notes/Blocked are kept — the old "replaces all current jobs" text was misleading post-v0.9.3). (4) Block button restyled prominent (red, larger) for kiosk visibility. Verified: 7/7 route checks + 9/9 unit tests; build clean. | BK approved the council's quick-win bundle |
| 2026-06-16 | BK+AI | Build tooling: `Package-Release.ps1` now ALWAYS creates the installable `VRSI-WallBoard-v<version>.zip` (Compress-Archive of the release folder, named from server/package.json version) in the repo root as part of packaging — so a release is never published without its install zip. Release flow no longer needs a separate manual zip step. | BK: guarantee every release produces an install zip |
| 2026-06-16 | BK+AI | v0.12.0: 2-week calendar view (plan Phase 5 — the deferred item, now done + verified). New `client/src/components/calendar/TwoWeekView.tsx` SUBCLASSES react-big-calendar's internal `MonthView` (`react-big-calendar/lib/Month`) and overrides only `render()` (two 7-day rows from the week containing the date) + the static `range`/`navigate`/`title` — so it inherits ALL of RBC's month rendering (DateContentRow wiring, accessors/getters, "+N more" overlay, row measurement) with no hand-wiring (the crash risk that caused the deferral). Registered via `views={{…, twoWeek: TwoWeekView}}` on the Calendar; `'twoWeek'` wired into all displayMode sites (appStore, types/index, useEvents + widened fetch window, CalendarView prop/rbcView/weekends-clip, Dashboard ×2 selects + stepViewDate ±14d + range label, SettingsPanel option, configService, config route validation, App keyboard `t`). Weekend clip works per row. **Verified against the running app** (headless browser, mock data): renders 2 rows / 14 day cells / clean single-line chips / correct range label / zero page errors — screenshot in e2e/artifacts. | BK: finish the calendar — the 2-week "now + next week" view |
| 2026-06-16 | BK+AI | v0.11.0: calendar polish + first unit tests. Month view: event chips forced to a uniform 18px single line (no wrap) + tighter date number so RBC's row-limit measurement is exact — long titles no longer clip mid-text; overflow rolls cleanly into "+N more" (`CalendarView.tsx` scoped CSS). Week view label now shows the date range ("Jun 15 – 21, 2026", or cross-month "Jun 29 – Jul 5, 2026") honoring the Sun/Mon week start, instead of just the month (`Dashboard.tsx` viewLabel). Added the repo's first automated tests: `server/src/services/boardService.test.ts` (Node built-in runner via tsx, zero new deps, throwaway SQLite per test) covering import manual-locks, note-flag set/clear/re-flag, and blocked routing/import-safety/prune — `npm test` in server/, 9/9 green; `*.test.ts` excluded from the build. NOTE: the 2-week calendar view (plan Phase 5) is deferred — it needs an isolated spike + visual verification (custom RBC view wiring `DateContentRow` accessors/getters is a kiosk runtime-crash risk if mis-wired). | BK: fix the calendar cut-off/cramming + clearer week label; lock in the board logic with tests |
| 2026-06-16 | BK+AI | v0.10.0: (Phase 2) new/changed import notes flagged — `applyBoardImport` collects job numbers whose Ops Schedule note changed into `jobs_import_meta.changed_note_job_numbers` (transient, recomputed each import), surfaced as computed `BoardJob.hasNewNote`; JobCard shows a "New note" badge, NotesSection highlights the updated ops note, the "New (n)" toggle + the `new` search keyword now match `isNew || hasNewNote`. (Phase 3) Blocked tab — manual `blocked`/`blockedAt`/`blockedReason` on board state; a blocked job leaves Project/Spare/Archive and shows only under a new 4th "Blocked" tab (`/board/blocked`), with a bordered "Block"/"Unblock" control + reason on the card; new admin-gated `PATCH /api/board/jobs/:jobNumber/blocked`; import never touches blocked and `pruneOrphanedBoardState` preserves blocked jobs. New columns added via the same guarded `ensureColumns()` ALTER + carried through read/write/`_mergeFromBackup`. Write-path setters hardened to use `emptyJobState()` (council finding). Verified 20/20 merge checks; build clean. Council (correctness + security + roadmap) run — no critical issues; see ai-memory for the prioritized backlog. | BK: new-note visibility, a manual triage lane for problem children, and an independent verification pass |
| 2026-06-16 | BK+AI | v0.9.3: import-preservation hotfix — re-import no longer reverts a user's manual status/binder. `applyBoardImport` applied imported status whenever it differed (silently violating §7.3): a job manually marked `shipped` was dragged back out of Archive when the spreadsheet still said in-progress. Fix: `board_state.status_manual` / `binder_manual` flags (added via a new guarded `ensureColumns()` PRAGMA-checked ALTER in `localProvider` — the repo had no ADD COLUMN pattern), set by the status/binder setters, honored by both import loops, carried through `getBoardStateFile`/`writeBoardState`/`_mergeFromBackup` (old backups default to 0). On first column-add, any pre-existing row with a non-empty `updatedBy` is backfilled as locked so the very first post-upgrade import can't revert existing manual edits. New/untouched jobs still auto-fill. Verified: 8/8 merge checks pass. | Active data-loss bug — Brian's manual ships/checkmarks were reverted on every import |
| 2026-06-10 | BK+AI | v0.8.0: note drafts join the Apply flow — typed-but-unsent note makes the card dirty, "Apply all" saves status+binder+date+note in one click; un-applied edits tracked globally (appStore.dirtyJobs) with inline amber warning, confirm dialogs on tab switch / user switch / Calendar link / Settings nav, and beforeunload guard on refresh/close; Projects search treats "new" as a keyword matching NEW-flagged jobs | BK: warn when changes aren't applied, save multiple changes at once, find new jobs by typing "new" |

