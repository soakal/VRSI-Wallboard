# VRSI WallBoard — Install & Upgrade Runbook

This is the companion to **Tour 1** (`tours/01-upgrade.spec.ts`). The Playwright
tour records the *in-app* Update experience; the **install** and the
**script-fallback update** are Windows PowerShell / UAC steps a browser cannot
perform, so they are written out here with the exact commands.

Screens referenced below land in `e2e/artifacts/screens/upgrade/` after a run.

---

## 1. Install (first time on a PC)

> Installation is a one-time, admin-elevated step. Not automatable from a browser.

1. Copy the `VRSI WallBoard\` release folder to the PC (anywhere; `C:\Program Files\VRSI WallBoard` is typical).
2. Right-click **`INSTALL.bat`** → **Run as administrator** (it self-elevates via UAC).
   - Installs Node.js if missing, creates `C:\ProgramData\VRSIWallBoard\{data,backups,logs}`,
     writes `server\.env` (standalone mode: `DISABLE_AZURE=true`), installs server deps,
     and grants the console user **Modify** on the install tree so the in-app Update
     button can replace files later without elevation.
3. (Optional, recommended on a kiosk) Right-click **`ENABLE-STARTUP.bat`** → **Run as administrator**
   to register the `VRSI WallBoard Tray` logon task.
4. Open **http://localhost:3001** to confirm the board is up.

Reference: `docs/START-HERE.txt` and `docs/operations-guide.md` §1.

---

## 2. Upgrade — in-app Update button (the normal path)

Captured by the tour. Steps for a person:

1. On the board, open **Settings** (footer **⚙ Settings**, or `Ctrl+S`).
2. Expand **About & Updates**.
   - Up to date → "You are on the latest version." + a **Release notes** link
     (`screens/upgrade/01-about-up-to-date.png`).
   - An update exists → an amber **"Update available: vX.Y.Z"** banner and an
     **"Update to vX.Y.Z"** button (`02-update-available.png`).
3. Click **Update to vX.Y.Z** and confirm the prompt.
   - The board shows "Update started. … leave it alone until then."
     (`03-update-started.png`), goes down for a few minutes, updates itself, and
     **reloads automatically** on the new version (`04-after-upgrade.png`).

Under the hood: `POST /api/update/run` launches the updater **detached via WMI**
so it survives the server/tray restart; the page polls `GET /api/update/check`
every 10s and reloads when the version changes. (The tour stubs both calls, so
no real update runs during the recording.)

---

## 3. Upgrade — script fallback (if the button fails)

Use this when the in-app button can't run (e.g. a kiosk still on an old build, or
a half-failed update left the board down). **Run the script as Administrator.**

### Kiosk / release install (no `.git` folder)

```powershell
# As Administrator:
& "C:\Program Files\VRSI WallBoard\scripts\windows\Update-FromRelease.bat"
```

Downloads the latest GitHub release, stops the tray + server, copies the new
files over the install, runs `npm install --omit=dev`, restarts the tray + kiosk
browser, and logs to `C:\ProgramData\VRSIWallBoard\logs\update.log`.

### Developer / git clone install (has a `.git` folder)

```powershell
# As Administrator, from the repo:
& ".\scripts\windows\Update-WallBoard.bat"
```

Auto-stashes a dirty tree, `git pull --ff-only`, rebuilds, restarts, polls
`/health`.

### Recovery — "Access is denied" during an update

If an update failed part-way under `C:\Program Files` (permissions), re-grant the
console user Modify and bring the tray back:

```powershell
# As Administrator:
$user = (Get-CimInstance Win32_ComputerSystem).UserName
icacls "C:\Program Files\VRSI WallBoard" /grant "${user}:(OI)(CI)M" /T
Enable-ScheduledTask -TaskName "VRSI WallBoard Tray"
Start-ScheduledTask  -TaskName "VRSI WallBoard Tray"
```

Then retry the in-app Update button — it now has write permission.

Reference: `docs/operations-guide.md` §1.5 (Updating) and its troubleshooting notes.

---

## 4. Where to look when an update misbehaves

- Update log: `C:\ProgramData\VRSIWallBoard\logs\update.log`
- Server log: same `logs\` folder — search for `Update script exited early` / `Update script stderr`
- Health probe: `Invoke-RestMethod http://localhost:3001/health`
