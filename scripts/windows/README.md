# VRSI WallBoard — Windows kiosk scripts

## Easiest (project root)

| File | What it does |
|------|----------------|
| **`INSTALL.bat`** | Full one-time install + optional startup/backups |
| **`ENABLE-STARTUP.bat`** | Register server + kiosk at Windows logon (Admin) |
| **`UNINSTALL.bat`** | Simple uninstall menu (keep or delete data) |

## More scripts in `scripts\windows\`

From `scripts\windows\` or repo root **`Start-WallBoard.bat`** (opens menu):

| Batch file | What it does |
|------------|----------------|
| **`Install-WallBoard.bat`** | Same as root INSTALL.bat |
| **`WallBoard-Menu.bat`** | Menu for all actions |
| **`Setup-FirstTime.bat`** | Legacy — use Install-WallBoard.bat instead |
| **`Install-DataDirs.bat`** | Create `ProgramData` folders |
| **`Build-Production.bat`** | npm install + build |
| **`Start-WallBoard.bat`** | Run server on port 3001 |
| **`Start-Kiosk.bat`** | Fullscreen browser |
| **`Backup-Now.bat`** | Run backup |
| **`List-Backups.bat`** | List `wallboard-*.db` files |
| **`Open-Backups-Folder.bat`** | Open backup folder in Explorer |
| **`Restore-Backup.bat`** | Restore a backup (stop server first) |
| **`Stop-WallBoard.bat`** | Stop server on port 3001 |
| **`Register-BackupTask.bat`** | Schedule backups every 6h (Admin) |
| **`Unregister-BackupTask.bat`** | Remove backup schedule (Admin) |
| **`Register-StartupTasks.bat`** | Start at logon (Admin) |
| **`Uninstall-WallBoard.bat`** | Remove tasks + optional data delete |

PowerShell `.ps1` files are still used behind the scenes.

## One-time setup (kiosk PC)

1. Install **Node.js 18+**
2. Copy this project folder to the PC (e.g. `C:\VRSIWallBoard`)
3. In PowerShell:

```powershell
cd "C:\path\to\VRSI Wallboard"

# Data folders
.\scripts\windows\Install-DataDirs.ps1

# Config — edit ADMIN_TOKEN before going live
copy server\.env.production.example server\.env
notepad server\.env

# Optional: copy existing database from dev machine
# copy \\dev-pc\share\wallboard.db C:\ProgramData\VRSIWallBoard\data\wallboard.db

# Build
.\scripts\windows\Build-Production.ps1
```

## Run manually

```powershell
.\scripts\windows\Start-WallBoard.ps1    # API + UI on http://localhost:3001
.\scripts\windows\Start-Kiosk.ps1        # Fullscreen browser
```

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

## Files

| Script | Purpose |
|--------|---------|
| `Install-DataDirs.ps1` | Create `ProgramData\VRSIWallBoard\` folders |
| `Build-Production.ps1` | `npm install` + build client & server |
| `Start-WallBoard.ps1` | Run production server |
| `Start-Kiosk.ps1` | Edge/Chrome kiosk mode |
| `Invoke-WallBoardBackup.ps1` | POST `/api/storage/backup` |
| `Register-BackupTask.ps1` | Task Scheduler every 6 hours |
| `Register-StartupTasks.ps1` | Server + kiosk at user logon |
