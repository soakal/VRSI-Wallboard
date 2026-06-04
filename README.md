# VRSI WallBoard

Windows-native job board + calendar kiosk. **Local standalone** phase: SQLite storage via `LocalStorageProvider`.

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

## Data

- Default production path: `C:\ProgramData\VRSIWallBoard\data\wallboard.db`
- Dev: set `DATA_DIR=./server/data` in `.env`
- On first run, legacy `jobs.json` / `board-state.json` in `DATA_DIR` migrate into SQLite and are renamed to `*.migrated`

## Storage

All persistence goes through `LocalStorageProvider` (SQLite). Board business logic remains in `boardService.ts` and calls `getPersistence()` — no direct JSON file writes.

API: `GET /api/storage/status`, `GET /api/storage/backups`, `POST /api/storage/backup`, `POST /api/storage/restore`, `GET /api/storage/audit-log`, `GET /api/storage/security-report`

**System panel:** Press **Ctrl+M** (or **System** on the board). Tabs: IT summary, **Backup & restore** (backup now, list, restore with confirm), activity log.

**When backups run:** closing the browser/kiosk window; stopping the Node server (Ctrl+C or service stop); **Backup now** in the app; optional Windows Task Scheduler every 6 hours (keeps 28 files). Logs: ProgramData `logs` in production; audit data in `wallboard.db`.

## Windows kiosk (production) — single PC

### Three files at the project root (easiest)

| File | What it does |
|------|----------------|
| **`INSTALL.bat`** | One-time: checks Node, folders, config, build. Asks about **startup at logon** and **backups**. |
| **`ENABLE-STARTUP.bat`** | Only registers auto-start (run as **Administrator** if backup schedule is needed). |
| **`UNINSTALL.bat`** | Pick **1** = remove auto-start only, **2** = also delete all data |

After install, the app runs at **http://localhost:3001** (reboot or log off/on if you enabled startup).

Manual start (no auto-start): `scripts\windows\Start-WallBoard-Service.bat` then `Start-Kiosk.bat`

See **`scripts/windows/README.md`** for all scripts.

Or PowerShell:

```powershell
.\scripts\windows\Install-DataDirs.ps1
copy server\.env.production.example server\.env   # edit ADMIN_TOKEN
.\scripts\windows\Build-Production.ps1
.\scripts\windows\Start-WallBoard.ps1
.\scripts\windows\Start-Kiosk.ps1
```

Optional (run as Administrator): `Register-BackupTask.ps1`, `Register-StartupTasks.ps1`

## Docs

- `VRSI-WALLBOARD-RULES.md` — project standards
- `VRSI-WallBoard-build-plan.md` — full rebuild plan
- `docs/ai-memory.md` — session state for AI agents
- `scripts/windows/README.md` — kiosk PC deployment
