# VRSI WallBoard

Windows-native job board + calendar kiosk for the shop floor. **Local standalone**: all data lives in SQLite on the PC — no cloud required (Azure/Microsoft 365 calendar is optional).

## Features

- **Projects board** — jobs imported from the ops schedule XLSM, split across **Projects / Spare Parts / Archive** tabs. Per-job status (Not Started / In Progress / Ready to Ship / Shipped), ship-date overrides with notes, binder-printed checkbox, and job notes with author tracking.
- **Filters & search** — search by job number, customer, PM, or MM; Project Manager / Materials Manager multi-select filters; **My Jobs / All Jobs** toggle; **New (n)** button to show only jobs flagged NEW from the last import.
- **Users** — names derive from the imported schedule (PM + Materials Manager columns). Pick your name once and the board and calendar both filter to your jobs. **Super users** (Users tab → Super Users list) always see everything. Users with only shipped jobs are hidden from the picker.
- **Calendar page** — month/week/day grid with board ship dates as events (red **NEW** badge on newly imported jobs), an **Agenda rail showing the current week** (filtered to the selected user; super users see all), clock, weather, and optional Outlook calendars via Azure.
- **ICS export** — download ship dates as `.ics` for Outlook or any calendar app.
- **Settings** — calendar selection, display options, widgets, weather location by ZIP, **Files browser on/off**, and **About & Updates** with the current version and a one-click **Update** button.
- **System panel** (Ctrl+M) — IT summary, backup & restore, activity log.
- **Tray app** — the server runs behind a blue "W" system-tray icon with crash auto-restart. No console window ever appears (launched via `conhost.exe --headless`).

## Quick start (development)

```powershell
cd server
copy ..\.env.example .env   # or use server/.env
npm install
npm run dev
```

In another terminal:

```powershell
cd client
npm install
npm run dev
```

Open http://localhost:5173 (or the next free port Vite prints). Vite proxies `/api` to port 3001.

**Dev admin token:** `server/.env` sets `ADMIN_TOKEN`. The browser on localhost is trusted automatically — no token needed in the client.

**Full production build:** `npm run build` at the repo root builds shared → client → server; `npm start` runs the compiled server on port 3001.

## Data

- Default production path: `C:\ProgramData\VRSIWallBoard\data\wallboard.db`
- Dev: set `DATA_DIR=./server/data` in `.env`
- On first run, legacy `jobs.json` / `board-state.json` in `DATA_DIR` migrate into SQLite and are renamed to `*.migrated`

## Storage

All persistence goes through `LocalStorageProvider` (SQLite). Board business logic remains in `boardService.ts` and calls `getPersistence()` — no direct JSON file writes.

API: `GET /api/storage/status`, `GET /api/storage/backups`, `POST /api/storage/backup`, `POST /api/storage/restore`, `GET /api/storage/audit-log`, `GET /api/storage/security-report`

**When backups run:** closing the browser/kiosk window; stopping the Node server (Ctrl+C or service stop); **Backup now** in the System panel; optional Windows Task Scheduler every 6 hours (keeps 28 files). Logs: ProgramData `logs` in production; audit data in `wallboard.db`.

**Restores merge, never overwrite** — restoring a backup merges board state and blocks on conflicts instead of clobbering newer data.

## Windows kiosk (production) — single PC

Deployments use the packaged **`VRSI WallBoard\`** release folder (built by `scripts\windows\Package-Release.ps1`, attached as a zip to every [GitHub release](https://github.com/soakal/VRSI-Wallboard/releases)).

### Three files at the release-folder root

| File | What it does |
|------|----------------|
| **`INSTALL.bat`** | One-time: checks Node, folders, config, build. Asks about **startup at logon** and **backups**. |
| **`ENABLE-STARTUP.bat`** | Only registers auto-start (run as **Administrator** if backup schedule is needed). |
| **`UNINSTALL.bat`** | Pick **1** = remove auto-start only, **2** = also delete all data |

After install, the app runs at **http://localhost:3001** (reboot or log off/on if you enabled startup). The startup task launches the tray app invisibly — look for the blue **W** icon near the clock.

Manual start (no auto-start): `scripts\windows\Start-TrayApp.bat` (tray) or `Start-WallBoard-Service.bat` + `Start-Kiosk.bat` (headless).

### Updating an installed kiosk

- **Easiest:** Settings → **About & Updates** → **Update** button. The board downloads the latest GitHub release, installs it, and restarts itself (data and settings are preserved).
- Manual: run `scripts\windows\Update-FromRelease.bat`, or copy a downloaded release folder over the install and re-run `INSTALL.bat`.
- Dev machines with a git clone use `scripts\windows\Update-WallBoard.bat` (git pull + rebuild) instead.

An update banner appears in the app within 6 hours of a new GitHub release.

See **`scripts/windows/README.md`** for all scripts.

## Docs

- `VRSI-WALLBOARD-RULES.md` — project standards
- `VRSI-WallBoard-build-plan.md` — full rebuild plan
- `docs/operations-guide.md` — install, uninstall, backup, sending logs
- `docs/ai-memory.md` — session state for AI agents
- `scripts/windows/README.md` — kiosk PC deployment
