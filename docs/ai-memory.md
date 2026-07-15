# VRSI WallBoard — AI Memory

**Last saved:** 2026-07-15
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\`

---

## Current State

**Version:** v1.1.8 (root + server + client + shared — release commit on main)

**Last completed task:** Fixed the live Support-button garbling bug (below) and shipped it as v1.1.8. **Live verification on real Outlook is still outstanding** — see the checklist at the end of the section below.

**Next task:** Update this machine's installed copy (`C:\Program Files\VRSI WallBoard\`, tray-managed, Scheduled Task "VRSI WallBoard Tray") from v1.1.7 → v1.1.8 via the in-app Update button, then run the real-Outlook verification checklist against it. (Local dev-server testing on :3001 doesn't work for this — the Tray scheduled task auto-restarts the installed copy the moment the port frees up, so a plain `node dist/index.js` from the repo keeps losing the port back to the old installed build.)

---

## Support-mail garbling fix, root cause + fix (shipped in v1.1.8)

**Bug (confirmed via screenshot on a live kiosk):** Ctrl+M → Support → Send opened Outlook's "New mail" compose with Subject **empty**, Body **correct**, and To containing the literal decoded tail of a `subject=…&body=…` query string (`=VRSI WallBoard support — 2026-07-15&body=From: test test --- …`) — an invalid, unsendable email every time.

**Root cause:** the garbled text is the decoded remainder of the `mailto:` URI that the OLD `Open-SupportMail.ps1` built for its `mailto` mode (old lines 25-27: `"mailto:$To?subject=$encodedSubject&body=$encodedBody"`). The em-dash in the subject survived Node→argv→PowerShell→`EscapeDataString` intact, which rules out an argv-mangling theory. What actually happened: `composeSupportMail()` (old `supportService.ts:407-430`) called `runSupportMailScript('outlook', …)` first; on that kiosk the classic Outlook COM object either isn't registered (new-Outlook-only machine) or the call otherwise failed, and the script's bare `catch { exit 1 }` (old ps1:42-44) swallowed the real reason. `composeSupportMail` then treated that as total failure and fired a **second, separate** `runSupportMailScript('mailto', …)` spawn — and the new-Outlook (`olk.exe`) mailto handler mis-parsed the well-formed `?subject=&body=` query string, dumping its decoded tail into the To field while Body (extracted first, apparently) came through fine.

**Fix:**
- `scripts/windows/Open-SupportMail.ps1` — rewritten to a **single invocation** that tries Outlook COM, and only falls back to mailto internally if COM failed **before** `.Display()` was ever called (a `$displayAttempted` guard — never launches a second UI-touching attempt on top of a window that might already be visible). The mailto fallback is now **recipient-only** (`mailto:$To`, no `?subject=&body=`) since that query-string form is the demonstrated garbling vector — everything the recipient needs is already in the zip's `message.txt`. Subject now travels via a `-SubjectPath` temp file (mirrors the existing `-BodyPath` pattern) instead of raw argv. Script prints `outlook` or `mailto` to stdout on success; real COM exception goes to stderr instead of being swallowed.
- `server/src/services/supportService.ts` — `runSupportMailScript()` now spawns the script exactly once (was up to two `spawnSync` calls, doubling the worst-case UI-block time), stages `subject.txt`/`body.txt` in a `mkdtemp` dir, logs the script's stderr on failure (previously silent), and returns the method the script reports. `composeSupportMail()` simplified accordingly — same public return type/behavior contract (`'outlook' | 'mailto'`), client (`MonitoringPanel.tsx`) untouched.
- `docs/code-guide.md` rows for `supportService.ts` and `Open-SupportMail.ps1` updated to match.

**Verified:** `npm run build` clean, `npm test --prefix server` 63/63, `npx tsc --noEmit` clean in server/, ps1 parse-validated (`[Parser]::ParseFile`, 0 errors) and its file-not-found guards exercised directly — all without invoking real Outlook/mailto UI.

**NOT yet verified live (cannot be done from a dev/CI environment — needs a human on the real kiosk with real Outlook, same category as "the full update cycle can't be unit-tested" elsewhere in this doc). An attempted local test on 2026-07-15 reproduced the OLD bug — but that was a false negative: the Tray scheduled task auto-restarted the OLD installed copy the moment the dev server's port freed up, so the fix was never actually exercised. Real verification requires updating the installed copy first:**
0. Update `C:\Program Files\VRSI WallBoard\` (or whichever machine is being tested) from v1.1.7 → v1.1.8 via Settings → About & Updates → Update, and confirm it actually restarts on v1.1.8 (check the version shown, not just that Send was clicked).
1. Classic-Outlook machine: Send → exactly one compose window, correct To/Subject/Body, zip attached.
2. New-Outlook-only machine (the one that actually failed on the v1.1.7 screenshot): Send → `combined.log` shows the COM failure reason; a mailto window opens with **To only**, no garbling; client shows the "attach the zip manually" message.
3. Outlook busy/race scenario: trigger Send while Outlook already has a modal/compose open — confirm no second window ever stacks on top of a COM-shown one.
4. Repeat twice — no duplicate windows, no leftover `%TEMP%\vrsi-support-mail-*` dirs.
5. Audit log records the correct method (`outlook` vs `mailto`).

---

## v1.1.7 — Fable audit of Support feature, two kiosk-reliability fixes

Brian asked for a Fable pass to confirm the v1.1.6 Support feature was fully merged and working.
Merge status was already clean (PR #2 squash-merged `cursor/support-report-button-51e5`; that
branch ref was stale/redundant and has been deleted from GitHub). Fable's code+build+test audit
found two real bugs that only showed up on the actual Windows target, not the Linux CI runner:

1. **No timeout on `spawnSync` calls in `supportService.ts`.** The Outlook COM script and
   `Compress-Archive` calls could block the whole Node event loop indefinitely if Outlook hung
   (first-run wizard, stuck modal) — freezing the entire board for every kiosk user until the
   tray watchdog force-restarted the server ~2 minutes later. Fixed: shared 30s
   `SUPPORT_SPAWN_TIMEOUT_MS` on both `spawnSync` calls.
2. **`supportService.test.ts`'s "builds a zip" test depended on the real Desktop.** It only
   passed when `resolveDesktopDir()` found no Desktop (true on Linux CI, false on every real
   Windows box) — so it was silently red on Windows (62/63, not the claimed 63/63) and wrote a
   real zip to the Desktop on every run. Fixed: the test now points `HOME`/`USERPROFILE` at a
   Desktop-less temp dir for its duration.

Verified: 63/63 server tests genuinely pass on Windows, `npm run build` clean, `tsc --noEmit`
clean on server + client, no stray files left on disk.

**Shipped:** committed `96dfe73`, pushed to `main`, released as
https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.7 (zip + sha256 uploaded). Local
`releases/` folder has only v1.1.7 (nothing to prune yet). Stale branch
`cursor/support-report-button-51e5` deleted from GitHub (fully merged, redundant ref).

---

## v1.1.6 — Support tab (shipped in this release)

- Monitoring (Ctrl+M) → **Support** tab
- Outlook auto-attach when available; mailto fallback
- Support inbox **preconfigured**: `DEFAULT_SUPPORT_EMAIL` in server code + `SUPPORT_EMAIL=briank@vrs-inc.com` in `.env.production.example` / installer — no manual setup required
- Inbox not shown in UI (server-side only)
- `npm test --prefix server` → 63/63 pass

---

## Release flow (v1.1.8)

1. `npm run build` at root
2. `scripts\windows\Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.8.zip` + `.sha256`
3. `gh release create v1.1.8 "releases\VRSI-WallBoard-v1.1.8.zip" "releases\VRSI-WallBoard-v1.1.8.zip.sha256"`
4. Prune local `releases/` to 2 most recent versions (v1.1.7 + v1.1.8 after this release)

---

## Context for Next Session

1. Latest release: **v1.1.8** — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.8
2. **Live-verify the Support-mail fix is still outstanding** — see checklist above. This machine's installed copy (`C:\Program Files\VRSI WallBoard\`) needs to be updated from v1.1.7 → v1.1.8 via the in-app Update button before it can be tested for real.
3. Support inbox preconfigured to `briank@vrs-inc.com` (code default + installer `.env`)
4. Staff: Ctrl+M → Support → describe problem → Send support report
5. Kiosks still need to update from v1.1.6/v1.1.7 → v1.1.8 to pick up the Outlook-hang timeout fix and the mailto-garbling fix
