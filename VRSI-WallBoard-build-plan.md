# VRSI WallBoard — Master Build Plan
**Date:** June 4, 2026
**Author:** BK
**Copyright © VRSI**
**Purpose:** Single combined document — what the existing app does, what the new app must preserve, and exactly how to rebuild it clean for Windows, maintainability-first, with a config switch to SharePoint collaboration.

---

## The Strategy in One Sentence

Rebuild VRSI WallBoard as a Windows-native web app that works standalone today and upgrades to full SharePoint/M365 collaboration with a single config switch — no rewrite required.

---

## Why Rebuild (Not Branch)

The existing app is excellent and well-structured, but it was built for Linux with these assumptions baked in:
- `systemd` service management
- bash deployment scripts
- Linux file paths (`/var/backups/`, `/home/vrsi/`)
- Chromium kiosk via systemd
- POSIX-atomic file renames (different behavior on Windows)

Retrofitting all of that for Windows + the new storage abstraction + maintainability-first design is more work than starting clean. **Use the existing app as the feature/logic reference — not the codebase you ship.**

---

## What Must Be Preserved (from existing app)

Everything below must exist in the new app. Zero feature loss.

### Tech Stack to Keep (it's already good)
| Layer | Technology | Keep? | Notes |
|-------|-----------|-------|-------|
| Frontend framework | React 18 + Vite + TypeScript | ✅ Yes | Already working well |
| Styling | Tailwind CSS (dark mode: class) | ✅ Yes | Keep dark mode default |
| Server state | TanStack Query (React Query) | ✅ Yes | Already handles polling/cache |
| Client state | Zustand | ✅ Yes | Auth, display mode, active user |
| Routing | react-router-dom v6 | ✅ Yes | SPA routing already clean |
| Calendar UI | react-big-calendar + date-fns | ✅ Yes | Keep exact rendering logic |
| Backend | Node.js 20+ + Express + TypeScript | ✅ Yes | Clean, familiar |
| Auth | @azure/msal-node + Microsoft Graph | ✅ Yes | Already working |
| Logging | Winston | ✅ Yes | Keep structured logging |
| Security | helmet + cors | ✅ Yes | Keep |
| File upload | multer | ✅ Yes | XLSM import |
| XLSM parsing | SheetJS | ✅ Yes — fix CDN dependency | Move from CDN tarball to npm package |
| QR code | qrcode.react | ✅ Yes | Device code login |
| Cron | node-cron | ✅ Yes | Token refresh |

### What to Change
| Item | Current | New |
|------|---------|-----|
| Deployment | Linux/systemd/bash | Windows-native Node.js process |
| File paths | Linux (`/var/backups/`, `/home/vrsi/`) | Windows (`C:\ProgramData\VRSIWallBoard\` or configurable) |
| Kiosk mode | Chromium launched by systemd | Electron shell OR browser launched by Windows startup |
| Backup | bash scripts + systemd timer | Node.js backup service + Windows Task Scheduler |
| Atomic writes | POSIX rename (Linux-atomic) | Windows-safe temp→rename with explicit error handling |
| Database | JSON files | SQLite (single file — simple backup/restore) |
| Storage layer | Direct file I/O in services | StorageProvider interface (local first, SharePoint later) |
| SheetJS | CDN tarball | npm package (removes CDN build dependency) |
| XLSM source | VMware drag-and-drop cache path (fragile) | Configurable path OR SharePoint auto-pull |

---

## Core Architecture: Storage Abstraction Layer

**The one rule that cannot break:** The app never talks to storage directly. It only ever calls the StorageProvider interface.

```typescript
interface StorageProvider {
  // Notes / Board State
  getJob(jobNumber: string): Promise<Result<BoardJob>>
  listJobs(filter?: JobFilter): Promise<Result<BoardJob[]>>
  writeJobState(jobNumber: string, state: JobState): Promise<Result<void>>
  deleteJobState(jobNumber: string): Promise<Result<void>>

  // Notes
  addNote(jobNumber: string, note: Note): Promise<Result<Note>>
  updateNote(jobNumber: string, noteId: string, text: string): Promise<Result<Note>>
  deleteNote(jobNumber: string, noteId: string): Promise<Result<void>>

  // Config
  getConfig(): Promise<Result<AppConfig>>
  writeConfig(config: Partial<AppConfig>): Promise<Result<AppConfig>>

  // Board Config
  getBoardConfig(): Promise<Result<BoardConfig>>
  writeBoardConfig(config: Partial<BoardConfig>): Promise<Result<BoardConfig>>

  // Import
  importJobs(jobs: Job[]): Promise<Result<ImportResult>>

  // Backup / Restore
  backup(destination: string): Promise<Result<void>>
  restore(source: string): Promise<Result<void>>
}
```

**Providers to build:**
| Provider | Backend | When |
|----------|---------|------|
| `LocalStorageProvider` | SQLite (`wallboard.db`) | Build first — ships as v1 |
| `NetworkShareProvider` | UNC path / mapped drive | Add if IT approves shared folder |
| `SharePointProvider` | Microsoft Graph API + Lists | Add when IT approves — the goal |

---

## Data Model (preserve exactly — migration from existing JSON)

### Jobs (from `jobs.json` — unchanged)
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

### Board State (from `board-state.json` — add version field)
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

**New field added:** `version` (integer) — increment on every write. Used for conflict detection when syncing to SharePoint.

### Config (from `config.json` — unchanged)
All existing fields preserved exactly. See existing spec §3.4 for full field list.

### Board Config (from `board-config.json` — unchanged)
`spareCarrier`, `superUsers` (list since v0.3.0; legacy `superUser` string auto-migrated), `statusColors`, `extraUsers` — all preserved.

### Migration from Existing JSON → SQLite
On first run, if existing JSON files are detected in the configured data directory:
1. Read all four JSON files
2. Insert into SQLite tables with matching schema
3. Rename originals to `.migrated` (keep as backup, don't delete)
4. Log migration in audit log

---

## Database: SQLite

**Why SQLite:**
- Single file (`wallboard.db`) — entire database in one place
- Backup = copy one file. Restore = copy it back.
- SQLite `.backup` API safely copies while app is running
- Same schema works for local and can be exported to JSON for SharePoint migration
- Real querying and indexing — more reliable than hand-rolled JSON merging

**Tables:**
```sql
CREATE TABLE jobs (
  job_number TEXT PRIMARY KEY,
  pm TEXT,
  customer TEXT,
  materials_manager TEXT,
  pabs_complete TEXT,
  ship_to_pm TEXT,
  ship_to_customer TEXT,
  imported_at TEXT
);

CREATE TABLE board_state (
  job_number TEXT PRIMARY KEY,
  status TEXT DEFAULT 'none',
  ship_date_override TEXT,
  ship_date_override_note TEXT,
  binder_printed INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  updated_at TEXT
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  job_number TEXT,
  text TEXT,
  author_id TEXT,
  author_name TEXT,
  created_at TEXT,
  updated_at TEXT,
  is_ops_schedule INTEGER DEFAULT 0
);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  type TEXT,
  detail TEXT,
  path TEXT,
  success INTEGER,
  size_bytes INTEGER
);
```

---

## Features to Preserve (complete list)

### Dashboard (`/`)
- Full-screen calendar with Day / Week / Month views
- Week view: always uses `week` (7 columns) — NOT `work_week` (crashes on weekend events)
- Weekends hidden via CSS clip (`.weekends-hidden`), not by omitting data
- AgendaRail sidebar — upcoming events, time-column layout, "Now" badge, dated headers
- Real-time clock — 12h/24h configurable
- Weather widget — lat/lon configurable, °F/°C
- Next event badge
- Recent SharePoint files widget
- Staleness indicator (last calendar refresh time)
- Ship-date events synthesized from board jobs, injected into calendar stream
- Clicking a ship-date event routes to correct board tab (`boardTab` field)
- Nightly watchdog: `window.location.reload()` at 3:00 AM
- Keyboard shortcuts: `Ctrl+S` (settings), `Ctrl+F` (files), `D/W/M` (view), `Esc` (close)

### Settings Panel (slide-over, `Ctrl+S`)
All existing settings preserved exactly — calendar picker, display mode, weekends toggle, start/end hours, refresh interval, theme, timezone, clock format, temp unit, weather toggle + lat/lon, next event badge toggle, agenda rail toggle, recent files toggle + count, SharePoint site picker, file open mode.

### File Browser Panel (slide-over, `Ctrl+F`)
SharePoint sites → drives → recent files. File icon by MIME type. Click to open (same/new window).

### Auth Setup Screen (`/setup`)
Azure Device Code Flow — large user code, QR code, verification URL. Auto-polls, redirects to `/` on success.

### Project Board (`/board`)
**Tabs:** Project / Spare Parts / Archive / Users / Import

**Job Cards (preserve exactly):**
- Job number, customer bubble (hash-colored), original ship date
- PM / MM display names (canonical)
- Status checkboxes: In Progress / Ready to Ship / Shipped (mutually exclusive, user-colored)
- Binder printed checkbox (hidden on spare-parts jobs)
- Ship date editor with override + reason field
- Notes section: user notes (author-only edit/delete) + Ops Schedule note (read-only)
- NEW badge for first-seen jobs in current import

**Filters:**
- PM multi-select + MM multi-select (apply simultaneously)
- Click PM/MM name on card to toggle filter
- Filter state persists per-tab in sessionStorage

**30-day ship agenda panel**

**Users View:** active user picker, status color customization, spare carrier email, super user name, extra users management

**Import View:** drag-and-drop XLSM upload, result banner with counts (imported, shipped applied, warnings, errors)

**Board rules to preserve:**
- Spare job classification: PM email = spareCarrier OR job number starts `sp-` / `sp ` (case-insensitive)
- Spare jobs: `binderPrinted` forced `false`, binder checkbox hidden
- Ops Schedule notes: replaced on each import, read-only in UI
- Orphaned board state with notes: NOT pruned (data safety)
- Person name canonicalization: `personIdentity.ts` logic preserved exactly
- `isNew` badge: compare current vs previous jobs list
- Presence tracking: in-memory, 30s TTL per user per job, wiped on restart
- No auth on board APIs (LAN-accessible by design; ADMIN_TOKEN gate is roadmap)

### Test Mode (`DISABLE_AZURE=true`)
Preserve exactly — disables all Microsoft auth/Graph calls, returns mock data for calendar and SharePoint. Board unaffected.

---

## Windows Deployment

### Running the App on Windows
- Node.js 20+ installed on Windows machine
- `npm install` → `npm run build` → `npm start`
- App serves on configurable port (default 3001)
- Browser opens to `localhost:3001` (or configure as Windows startup app)

### Kiosk Mode on Windows
- Option A: Launch Edge/Chrome in kiosk mode via Windows startup shortcut: `chrome.exe --kiosk http://localhost:3001`
- Option B: Electron wrapper (packages app + browser together, cleanest user experience)
- Nightly watchdog reload at 3:00 AM preserved

### Windows File Paths
- Data directory: `C:\ProgramData\VRSIWallBoard\data\` (configurable via `.env`)
- Backup directory: `C:\ProgramData\VRSIWallBoard\backups\` (configurable)
- Logs: `C:\ProgramData\VRSIWallBoard\logs\`
- Atomic writes: temp→rename pattern preserved; test explicitly on Windows (POSIX behavior differs)

### Backup on Windows
- Node.js backup service replaces bash scripts
- Windows Task Scheduler replaces systemd timer
- Default: every 6 hours, retain 28 copies (7 days)
- USB backup: app copies `wallboard.db` to user-chosen path

### Environment Variables (preserved from existing)
| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | No (default 3001) | HTTP server port |
| `NODE_ENV` | No | `production` enables strict CORS |
| `CORS_ORIGIN` | Yes in prod | Never `*` |
| `ENCRYPTION_SECRET` | Yes* | AES-256-GCM key (*unless DISABLE_AZURE) |
| `AZURE_TENANT_ID` | Yes* | *Unless DISABLE_AZURE |
| `AZURE_CLIENT_ID` | Yes* | *Unless DISABLE_AZURE |
| `DISABLE_AZURE` | No | `true` → mock data; board unaffected |
| `LOG_LEVEL` | No (default info) | debug/info/warn/error |
| `DATA_DIR` | No | Override default data directory path |
| `BACKUP_DIR` | No | Override default backup directory path |

---

## Audit / Monitoring Log

Every file operation and network call logged — primary IT trust-builder.

**Log captures:**
- File ops: path, timestamp, operation type, size, success/fail
- Network requests: URL, method, destination, payload size, response code
- Backup/restore: source, destination, record count, timestamp
- Conflict resolutions: which record, what was chosen, by whom

**Visible in UI:** dedicated Monitoring panel (not buried)
**Travels with backup:** `audit_log` table included in SQLite backup
**In standalone mode:** zero external network calls should appear (only localhost)

---

## Backup & Restore (Standalone Phase)

- **Backup:** copy `wallboard.db` using SQLite online backup API (safe while running)
- **Restore:** user picks a `.db` file → app merges (never blind overwrites)
- **Merge on restore:** new records appended, conflicts resolved by `updatedAt` + `version`
- **Reminder:** configurable interval (default 6 hours); warn if backup hasn't run in 24h
- **On failure:** warn clearly, retain previous backup, log failure in audit log
- **JSON export:** available for human-readable snapshots and SharePoint migration

---

## Merge & Conflict Rules

When importing jobs (XLSM) or restoring a backup:
1. **New jobs** (jobNumber not in DB) → insert, no prompt
2. **Unchanged jobs** (same version) → skip
3. **Updated records** (different version, one side newer) → newest `updatedAt` wins
4. **Conflicted records** (both sides modified, close timestamps) → flag for user resolution
5. **Ops Schedule notes** → always replaced by latest import (by design)
6. **Orphaned board state with notes** → never pruned (data safety rule preserved)

---

## SharePoint / M365 Upgrade Path

When IT approves SharePoint:

1. Write `SharePointProvider` implementing the StorageProvider interface
2. Auth via Microsoft Graph API + Entra ID (reuse existing MSAL code)
3. Board state stored as SharePoint List items
4. Jobs stored as SharePoint List items (or pulled directly from SharePoint-hosted XLSM)
5. User switches storage mode in settings → picks SharePoint → authenticates
6. Existing SQLite data migrates via JSON export → SharePoint import
7. Backup, versioning, permissions, audit handled by SharePoint from this point

**M365 features available after upgrade:**
- Calendar sync already works (existing code preserved)
- SharePoint file browser already works (existing code preserved)
- XLSM auto-pull from SharePoint (replaces manual upload / VMware drag-and-drop)
- OneDrive per-user backup replaces USB/local backup
- Entra ID login for board (currently unauthenticated by design)

---

## API Design (preserve existing, add storage-aware routes)

All existing endpoints preserved exactly. Add:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/storage/status` | Which provider is active, health |
| `POST` | `/api/backup` | Trigger manual backup |
| `POST` | `/api/restore` | Trigger restore + merge |
| `GET` | `/api/audit-log` | Get audit log entries |
| `GET` | `/health` | Preserved exactly — same response shape |

**Response format — always `{ data }` or `{ error }` — preserved from existing.**

---

## Known Issues to Fix in Rebuild

| Issue | Fix |
|-------|-----|
| SheetJS installed from CDN tarball | Move to standard npm package |
| XLSM source path hardcoded to VMware drag-and-drop cache | Configurable path + SharePoint auto-pull |
| `personIdentity.ts` duplicated on client and server | Single shared module |
| Atomic rename untested on Windows | Explicitly test + handle Windows behavior |
| Board APIs unauthenticated | Add ADMIN_TOKEN gate (roadmap item — implement in rebuild) |
| `work_week` calendar view crashes on weekend events | Already fixed (use `week`); preserve the fix |

---

## Realistic Time Estimate (Cursor or Claude Code)

| Milestone | Estimate |
|-----------|----------|
| New repo scaffold + StorageProvider interface + SQLite provider | 1–2 days |
| JSON → SQLite migration tool (import existing data) | 1 day |
| Preserve all existing features (port from existing app) | 3–5 days |
| Windows deployment (paths, startup, kiosk mode) | 1–2 days |
| Audit log (file + network, visible panel) | 1–2 days |
| Backup/restore + reminder (Windows-native) | 1–2 days |
| XLSM fix (npm SheetJS, configurable path) | 0.5 day |
| `personIdentity.ts` deduplication | 0.5 day |
| ADMIN_TOKEN gate on board APIs | 0.5 day |
| SharePoint provider (when IT approves) | 2–4 days |
| **Total v1 ship-ready** | **~2–3 weeks part-time** |

---

## Recommended Build Sequence

1. **Talk to IT first** — "If I build this on SharePoint/M365 using existing work logins, are you comfortable?" Their answer shapes everything.
2. **Scaffold new repo** — Windows-native, StorageProvider interface from day one.
3. **Build migration tool** — reads existing JSON files, writes to SQLite. Validates no data is lost.
4. **Port existing features** — use the existing app as reference; preserve all behavior exactly.
5. **Add Windows deployment** — paths, startup, kiosk mode, Task Scheduler backup.
6. **Add audit log** — file + network, visible panel, travels with backup.
7. **Run OWASP scan** — fix findings, save report for IT.
8. **Pitch IT** — container (optional) + audit log + OWASP scan. Ask for one small pilot.
9. **Add SharePoint provider** when approved — config switch, ~2–4 days.

---

## The One Rule

**All storage goes through the StorageProvider interface. No exceptions.**

Do this and local → network share → SharePoint is always a config switch, never a rewrite.

