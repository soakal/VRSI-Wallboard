# VRSI WallBoard -- Windows kiosk scripts

## Easiest (project root)

| File | What it does |
|------|----------------|
| **`INSTALL.bat`** | Full one-time install + optional startup/backups |
| **`ENABLE-STARTUP.bat`** | Register tray app at Windows logon (Admin) |
| **`UNINSTALL.bat`** | Simple uninstall menu (keep or delete data) |

## scripts\windows\ -- all actions

Open `WallBoard-Menu.bat` for an interactive menu, or run individual scripts:

| Batch file | What it does |
|------------|----------------|
| **`WallBoard-Menu.bat`** | Interactive menu for all actions |
| **`Install-WallBoard.bat`** | Same as root INSTALL.bat |
| **`Build-Production.bat`** | npm install + build client, server, shared |
| **`Update-WallBoard.bat`** | Dev/git installs: pull latest code, rebuild, restart server + browser |
| **`Update-FromRelease.bat`** | Kiosk installs: download latest GitHub release zip, install, restart |
| **`Start-WallBoard.bat`** | Run server on port 3001 (foreground window) |
| **`Start-WallBoard-Service.bat`** | Run server silently (Task Scheduler mode) |
| **`Start-TrayApp.bat`** | Launch tray app (server + system-tray icon) |
| **`Start-Kiosk.bat`** | Fullscreen Edge/Chrome browser |
| **`Restart-WallBoard.bat`** | Restart server (tray-aware) |
| **`Stop-WallBoard.bat`** | Stop server on port 3001 |
| **`Backup-Now.bat`** | Run a backup immediately |
| **`List-Backups.bat`** | List wallboard-*.db backup files |
| **`Open-Backups-Folder.bat`** | Open backup folder in Explorer |
| **`Restore-Backup.bat`** | Restore a backup (stops server first) |
| **`Register-BackupTask.bat`** | Schedule backups every 6h (Admin) |
| **`Unregister-BackupTask.bat`** | Remove backup schedule (Admin) |
| **`Register-StartupTasks.bat`** | Register tray app at logon (Admin) |
| **`Uninstall-WallBoard.bat`** | Remove tasks + optional data delete |
| **`Open-IT-Report.bat`** | Open System monitor panel in browser |
| **`Install-DataDirs.bat`** | Create ProgramData folders only |
| **`Setup-FirstTime.bat`** | Legacy -- use Install-WallBoard.bat instead |

## One-time setup (kiosk PC)

**Recommended:** double-click `INSTALL.bat` in the project root -- it handles everything.

Manual path:
1. Install **Node.js 20+**
2. Copy this project folder to the PC (e.g. `C:\VRSIWallBoard`)
3. In PowerShell:

```powershell
cd "C:\path\to\VRSI Wallboard"
.\scripts\windows\Install-WallBoard.ps1
```

This creates data folders, generates a random `ADMIN_TOKEN` in `server\.env`, builds the project, and optionally registers startup and backup tasks.

## Run manually

```powershell
.\scripts\windows\Start-WallBoard.ps1    # API + UI on http://localhost:3001
.\scripts\windows\Start-Kiosk.ps1        # Fullscreen browser
```

## Updating to a new version

**Easiest:** in the app, open Settings → **About & Updates** → **Update**. The board downloads the latest GitHub release, installs it, and restarts itself.

Manual, on a kiosk PC (installed from the release folder, no git):

```powershell
.\scripts\windows\Update-FromRelease.bat
```

Downloads the latest release zip from GitHub, stops the tray + server, copies the new files over the install (data and `server\.env` untouched), refreshes server dependencies, and restarts the tray and kiosk browser. Progress logs to `update.log` in the logs folder.

Manual, on a dev machine (git clone):

```powershell
.\scripts\windows\Update-WallBoard.bat   # or choose P from WallBoard-Menu
```

Pulls latest code from GitHub, rebuilds, restarts the server, and refreshes the kiosk browser.

## Automated backups (Administrator)

```powershell
.\scripts\windows\Register-BackupTask.ps1
.\scripts\windows\Invoke-WallBoardBackup.ps1   # test once
```

Backups go to `C:\ProgramData\VRSIWallBoard\backups\` (or `BACKUP_DIR` in `.env`).

## Start at logon (optional, Administrator)

```powershell
.\scripts\windows\Register-StartupTasks.ps1
```

This registers the **VRSI WallBoard Tray** scheduled task, which launches `Start-TrayApp.ps1` at logon. The tray app starts the Node server, shows a `W` icon near the system clock, and auto-restarts the server if it crashes. Any legacy `VRSI WallBoard Server` and `VRSI WallBoard Kiosk` tasks from older installs are removed automatically.

## PowerShell scripts reference

| Script | Purpose |
|--------|---------|
| `_common.ps1` | Shared helpers and variables (sourced by all scripts) |
| `Install-WallBoard.ps1` | Full install: dirs + env + build + optional tasks |
| `Install-DataDirs.ps1` | Create `ProgramData\VRSIWallBoard\` folders |
| `Build-Production.ps1` | `npm install` + build shared, client, server |
| `Update-WallBoard.ps1` | Dev/git: pull + rebuild + restart server + reload browser (`-Unattended` skips prompts) |
| `Update-FromRelease.ps1` | Kiosk: download latest GitHub release zip + install + restart (`-Unattended` for the Settings Update button) |
| `Package-Release.ps1` | Build and bundle `VRSI WallBoard\` folder for deployment (dev-only, not shipped) |
| `Start-WallBoard.ps1` | Run production server (foreground) |
| `Start-WallBoard-Service.ps1` | Run server silently (Task Scheduler / startup, no tray) |
| `Start-TrayApp.ps1` | Launch tray app: starts server + shows system-tray icon with crash-restart |
| `Restart-WallBoard.ps1` | Restart server; if tray is running lets it auto-restart, otherwise relaunches headless service |
| `Start-Kiosk.ps1` | Launch Edge/Chrome in kiosk mode |
| `Stop-WallBoard.ps1` | Stop server on port 3001 |
| `Invoke-WallBoardBackup.ps1` | Trigger backup via API |
| `Register-BackupTask.ps1` | Task Scheduler backup every 6h |
| `Unregister-BackupTask.ps1` | Remove backup task |
| `Register-StartupTasks.ps1` | Register tray app at logon (creates VRSI WallBoard Tray task) |
| `_Register-Startup.ps1` | Internal -- called by Register-StartupTasks.ps1; removes legacy Server/Kiosk tasks and registers the Tray task |
| `Enable-Startup.ps1` | Enable startup tasks |
| `List-Backups.ps1` | List backup files |
| `Open-Backups-Folder.ps1` | Open backup folder in Explorer |
| `Restore-Backup.ps1` | Interactive backup restore |
| `Uninstall-WallBoard.ps1` | Remove tasks + optional data delete |
