# VRSI WallBoard — Operations Guide

**Covers:** Install · Uninstall · Backup & Restore · Sending Logs for Support  
**Platform:** Windows 10 / 11 (64-bit)  
**Requires:** Node.js 20 or newer

---

## Table of Contents

1. [Install](#1-install)
2. [Uninstall](#2-uninstall)
3. [Backup & Restore](#3-backup--restore)
4. [Sending Logs for Support](#4-sending-logs-for-support)

---

## 1. Install

### 1.1 Prerequisites

| Requirement | Check / Download |
|-------------|-----------------|
| Node.js 20+ | `node --version` in PowerShell; download at nodejs.org |
| npm 9+ | bundled with Node — `npm --version` |
| Chrome or Edge | For kiosk display |

### 1.2 Copy the app files

Place the project folder wherever you want to run it from. The recommended location is:

```
C:\Program Files\VRSIWallBoard\
```

The folder should contain `INSTALL.bat`, `package.json`, `server\`, `client\`, `shared\`.

### 1.3 Configure the environment

Copy the production template and fill in your values:

```powershell
Copy-Item "server\.env.production.example" "server\.env"
notepad "server\.env"
```

Minimum required settings:

```
DATA_DIR=C:\ProgramData\VRSIWallBoard\data
BACKUP_DIR=C:\ProgramData\VRSIWallBoard\backups
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:3001
ADMIN_TOKEN=<replace with a long random string>
DISABLE_AZURE=true
```

To enable Microsoft calendar and SharePoint, also set:

```
DISABLE_AZURE=false
ENCRYPTION_SECRET=<replace with a long random string>
AZURE_TENANT_ID=<your Azure tenant ID>
AZURE_CLIENT_ID=<your Azure app client ID>
```

> **Security:** `ADMIN_TOKEN` and `ENCRYPTION_SECRET` should each be at least 32 random characters. Generate one in PowerShell:
> ```powershell
> -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 40 | ForEach-Object {[char]$_})
> ```

### 1.4 Run the installer

Double-click **`INSTALL.bat`** in the project folder. It will:

- Check Node.js is installed (prints instructions if not)
- Request Administrator approval (UAC prompt)
- Install npm dependencies, build the app, and create data directories

Verify the server is reachable after install:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

You should see `"status": "ok"`.

### 1.5 Start the server

**Recommended — tray app (server + icon near clock):**

Double-click **`Start-TrayApp.bat`**. A blue **W** icon appears in the taskbar notification area (near the clock). Right-click it for options:

| Menu item | Action |
|-----------|--------|
| Open in Browser | Opens `http://localhost:3001` |
| Restart Server | Stops and restarts Node.js |
| Stop & Exit | Stops the server and removes the tray icon |

Double-clicking the tray icon also opens the browser.

The tray app auto-restarts the server if it crashes (up to 3 times per 60 seconds), and shows balloon notifications on start, restart, and crash.

**Alternative — console window:**

Double-click **`Start-WallBoard.bat`**. The terminal window stays open — close it or press `Ctrl+C` to stop. No tray icon; useful for debugging.

### 1.6 Set up kiosk display (optional)

To launch the wallboard full-screen on startup, create a shortcut with this target:

**Chrome:**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:3001 --noerrdialogs --disable-infobars
```

**Edge:**
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk http://localhost:3001 --kiosk-printing --no-first-run
```

Place the shortcut in the Windows Startup folder (`shell:startup`) to auto-launch on login.

### 1.7 Auto-start the server on Windows login (optional)

Double-click **`ENABLE-STARTUP.bat`**. It will request Administrator approval and register a Windows Task Scheduler logon task (`VRSI WallBoard Tray`) that starts the tray app automatically whenever anyone logs in. The blue W icon will appear near the clock on every login — no console window.

---

## 2. Uninstall

### 2.1 Back up data first (recommended)

Before removing anything, back up your data — see [Section 3.1](#31-manual-backup).

### 2.2 Run the uninstaller

Double-click **`UNINSTALL.bat`**. It will request Administrator approval and then stop the server, remove the scheduled task, and remove the app files.

### 2.3 Remove data and logs (optional — permanent)

> **Warning:** This deletes all job data, notes, settings, and logs. Only do this if you are sure you no longer need the data.

```powershell
Remove-Item -Recurse -Force "C:\ProgramData\VRSIWallBoard"
```

### 2.4 Remove kiosk startup shortcut (if created)

If you manually placed a kiosk browser shortcut in the Windows Startup folder, open `shell:startup` in File Explorer and delete it. The `VRSI WallBoard Tray` scheduled task is removed automatically by the uninstaller.

---

## 3. Backup & Restore

All application data lives in the data directory (default `C:\ProgramData\VRSIWallBoard\data\`):

| File | Contents |
|------|----------|
| `wallboard.db` | All jobs, board state, notes, audit log |
| `config.json` | Calendar and display settings |
| `board-config.json` | Board column/status configuration |
| `tokens.json` | Encrypted Microsoft OAuth tokens |

### 3.1 Manual backup

Copy the entire data directory to a safe location:

```powershell
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$dest = "C:\ProgramData\VRSIWallBoard\backups\manual-$timestamp"
Copy-Item -Recurse "C:\ProgramData\VRSIWallBoard\data" $dest
Write-Host "Backup saved to $dest"
```

The SQLite `.backup` API used internally makes this safe to run while the app is running.

### 3.2 Scheduled automatic backup

The server creates a backup on every graceful shutdown. For scheduled backups every 6 hours, add a Windows Task Scheduler entry:

```powershell
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument '-NonInteractive -Command "$t = Get-Date -f yyyy-MM-dd_HH-mm; Copy-Item -Recurse C:\ProgramData\VRSIWallBoard\data C:\ProgramData\VRSIWallBoard\backups\auto-$t"'

$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Hours 6) -Once -At (Get-Date)
Register-ScheduledTask -TaskName "VRSI WallBoard Backup" -Action $action -Trigger $trigger -RunLevel Highest
```

Backups are kept indefinitely by this task; prune old ones manually or add a cleanup step.

### 3.3 Restore from backup

1. Stop the server (`Ctrl+C` or `Stop-ScheduledTask`).
2. Replace the data directory with the backup copy:

```powershell
# Replace data dir with a specific backup
$backup = "C:\ProgramData\VRSIWallBoard\backups\manual-2026-06-04_10-00"
Remove-Item -Recurse -Force "C:\ProgramData\VRSIWallBoard\data"
Copy-Item -Recurse $backup "C:\ProgramData\VRSIWallBoard\data"
```

3. Restart the server.

> **Note:** `tokens.json` contains your Microsoft OAuth token. If you restore an old backup, you may need to re-authenticate via the Auth Setup page at `http://localhost:3001`.

### 3.4 Find existing backups

```powershell
Get-ChildItem "C:\ProgramData\VRSIWallBoard\backups\" | Sort-Object LastWriteTime -Descending
```

---

## 4. Sending Logs for Support

### 4.1 Where logs are stored

| Log | Location | Contents |
|-----|----------|----------|
| Application log | `C:\ProgramData\VRSIWallBoard\logs\` | Server events, errors, startup |
| Audit log | `wallboard.db` (table `audit_log`) | File operations, network calls, backups |

Log files are named by date: `wallboard-2026-06-04.log`.

### 4.2 Collect logs for a support request

Run this script to bundle the last 7 days of logs plus system info into a zip file on your Desktop:

```powershell
$zipPath = "$env:USERPROFILE\Desktop\vrsi-wallboard-logs-$(Get-Date -f yyyy-MM-dd).zip"
$logDir  = "C:\ProgramData\VRSIWallBoard\logs"
$tmpDir  = "$env:TEMP\vrsi-logs-$(Get-Date -f yyyyMMddHHmmss)"

New-Item -ItemType Directory -Force $tmpDir | Out-Null

# Copy log files from the last 7 days
Get-ChildItem $logDir -Filter "*.log" |
  Where-Object { $_.LastWriteTime -ge (Get-Date).AddDays(-7) } |
  Copy-Item -Destination $tmpDir

# Add system info
@"
Date:        $(Get-Date -f "yyyy-MM-dd HH:mm:ss")
Computer:    $env:COMPUTERNAME
OS:          $((Get-CimInstance Win32_OperatingSystem).Caption)
Node:        $(node --version 2>&1)
npm:         $(npm --version 2>&1)
App version: $(Get-Content "C:\Program Files\VRSIWallBoard\package.json" | ConvertFrom-Json | Select-Object -ExpandProperty version 2>$null)
Server health: $(try { Invoke-RestMethod http://localhost:3001/health | ConvertTo-Json } catch { "server not reachable" })
"@ | Out-File "$tmpDir\system-info.txt"

# Zip everything
Compress-Archive -Path "$tmpDir\*" -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $tmpDir

Write-Host "Log bundle saved to: $zipPath"
```

Send the resulting zip file to your support contact.

### 4.3 View logs live (while the server is running)

```powershell
# Tail the most recent log file
Get-ChildItem "C:\ProgramData\VRSIWallBoard\logs\" -Filter "*.log" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 |
  ForEach-Object { Get-Content $_.FullName -Wait -Tail 50 }
```

### 4.4 Export the audit log to CSV

The audit log is in the SQLite database. Use this one-liner with the `sqlite3` CLI (install from sqlite.org/download if needed):

```powershell
sqlite3 -csv -header "C:\ProgramData\VRSIWallBoard\data\wallboard.db" `
  "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 500;" `
  > "$env:USERPROFILE\Desktop\vrsi-audit-log.csv"
```

Or open the Monitoring panel inside the app (`http://localhost:3001`) to view the audit log in the browser.

### 4.5 What to include in a support request

When reporting a problem, include:

- [ ] The log bundle zip from Section 4.2
- [ ] What you were doing when the problem occurred
- [ ] The exact error message shown (screenshot or copy-paste)
- [ ] Whether the problem is reproducible and how
- [ ] Output of `Invoke-RestMethod http://localhost:3001/health` at the time of the issue

> **Privacy note:** Logs never contain passwords, tokens, or email body content — only display names, file paths, API response codes, and timestamps. Review the zip before sending if you have any concerns.

---

## Quick Reference

| Task | Command / Location |
|------|--------------------|
| Install | Double-click `INSTALL.bat` |
| Start server | Double-click `Start-WallBoard.bat` |
| Enable auto-start on login | Double-click `ENABLE-STARTUP.bat` |
| Uninstall | Double-click `UNINSTALL.bat` |
| Stop server | `Ctrl+C` in the terminal window |
| Server health check | `http://localhost:3001/health` |
| Data directory | `C:\ProgramData\VRSIWallBoard\data\` |
| Backups directory | `C:\ProgramData\VRSIWallBoard\backups\` |
| Logs directory | `C:\ProgramData\VRSIWallBoard\logs\` |
| App config file | `server\.env` |
| Re-authenticate Microsoft | Open `http://localhost:3001` → Auth Setup |
| Rebuild after code changes | `npm run build` in app folder |
