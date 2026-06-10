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

