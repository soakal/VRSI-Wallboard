# VRSI WallBoard -- Windows kiosk scripts

## Easiest (project root)

| File | What it does |
|------|----------------|
| **`INSTALL.bat`** | Full one-time install + optional startup/backups |
| **`ENABLE-STARTUP.bat`** | Register server + kiosk at Windows logon (Admin) |
| **`UNINSTALL.bat`** | Simple uninstall menu (keep or delete data) |

## scripts\windows\ -- all actions

Open `WallBoard-Menu.bat` for an interactive menu, or run individual scripts:

| Batch file | What it does |
|------------|----------------|
| **`WallBoard-Menu.bat`** | Interactive menu for all actions |
| **`Install-WallBoard.bat`** | Same as root INSTALL.bat |
| **`Build-Production.bat`** | npm install + build client, server, shared |
| **`Update-WallBoard.bat`** | Pull latest code, rebuild, restart server + browser |
| **`Start-WallBoard.bat`** | Run server on port 3001 (foreground window) |
| **`Start-WallBoard-Service.bat`** | Run server silently (Task Scheduler mode) |
| **`Start-Kiosk.bat`** | Fullscreen Edge/Chrome browser |
| **`Stop-WallBoard.bat`** | Stop server on port 3001 |
| **`Backup-Now.bat`** | Run a backup immediately |
| **`List-Backups.bat`** | List wallboard-*.db backup files |
| **`Open-Backups-Folder.bat`** | Open backup folder in Explorer |
| **`Restore-Backup.bat`** | Restore a backup (stops server first) |
| **`Register-BackupTask.bat`** | Schedule backups every 6h (Admin) |
| **`Unregister-BackupTask.bat`** | Remove backup schedule (Admin) |
| **`Register-StartupTasks.bat`** | Start server + kiosk at logon (Admin) |
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

## PowerShell scripts reference

| Script | Purpose |
|--------|---------|
| `_common.ps1` | Shared helpers and variables (sourced by all scripts) |
| `Install-WallBoard.ps1` | Full install: dirs + env + build + optional tasks |
| `Install-DataDirs.ps1` | Create `ProgramData\VRSIWallBoard\` folders |
| `Build-Production.ps1` | `npm install` + build shared, client, server |
| `Update-WallBoard.ps1` | Pull + rebuild + restart server + reload browser |
| `Package-Release.ps1` | Build and bundle `VRSI Wallboard\` folder for deployment |
| `Start-WallBoard.ps1` | Run production server (foreground) |
| `Start-WallBoard-Service.ps1` | Run server silently (Task Scheduler / startup) |
| `Start-Kiosk.ps1` | Launch Edge/Chrome in kiosk mode |
| `Start-KioskAfterDelay.ps1` | Kiosk launch with a startup delay |
| `Stop-WallBoard.ps1` | Stop server on port 3001 |
| `Invoke-WallBoardBackup.ps1` | Trigger backup via API |
| `Register-BackupTask.ps1` | Task Scheduler backup every 6h |
| `Unregister-BackupTask.ps1` | Remove backup task |
| `Register-StartupTasks.ps1` | Register server + kiosk at logon |
| `_Register-Startup.ps1` | Internal -- called by Register-StartupTasks.ps1 |
| `Enable-Startup.ps1` | Enable startup tasks |
| `List-Backups.ps1` | List backup files |
| `Open-Backups-Folder.ps1` | Open backup folder in Explorer |
| `Restore-Backup.ps1` | Interactive backup restore |
| `Uninstall-WallBoard.ps1` | Remove tasks + optional data delete |
