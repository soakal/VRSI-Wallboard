# VRSI WallBoard — AI Memory

**Last saved:** 2026-07-15
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\`

---

## Current State

**Version:** v1.1.11 (root + server + client + shared — release commit on main). **Live-confirmed working end-to-end** — Brian updated this machine's installed/tray copy to v1.1.11 and confirmed Ctrl+M → Support → Send works as intended (mail app opens with correct To + Subject, zip already on the Desktop, no redundant save prompt).

**Last completed task:** The full Support-mail bug arc is closed: v1.1.7 (spawnSync timeout) → v1.1.8 (single-invocation, killed the garbling) → v1.1.9 (inner COM timeout, killed the COM-hang-starves-fallback regression) → v1.1.10 (restored Subject on the fallback) → v1.1.11 (removed the redundant Desktop+download double-save). Considered a Microsoft Graph `Mail.Send`-based auto-attach path (would eliminate the manual-attach step entirely) but decided against it — new permission scope + possible Entra ID admin consent for a fallback that already works well enough. Staying at v1.1.11.

**Next task:** None outstanding on Support. Normal kiosk fleet still needs to update from whatever version they're on to v1.1.11 to pick up all five fixes above.

**Fleet visibility gap (confirmed, not yet acted on):** there is no way to remotely check what version any OTHER kiosk is running — `server/src/routes/update.ts` (`GET /check`, `GET /status`) and `/health` are all per-machine only, nothing phones home or aggregates centrally. This machine (`VRSI-LAPT-189`) is confirmed on v1.1.11 via `release-info.json`; every other kiosk needs a physical/local check (Settings → About & Updates) until "fleet alerting" (already listed as deferred in the Known Issues backlog) gets built.

---

## Support-mail redundant download prompt, round 4 (shipped in v1.1.11)

**Report:** Brian: "since it is automatically saving to the desktop don't ask me to save somewhere else."

**Cause:** `buildSupportBundle()` (server) had always silently copied the zip to the user's Desktop when possible and returned that path as `savedPath` — this was true since v1.1.6. But `MonitoringPanel.tsx`'s `handleSendSupport` called `downloadSupportPackage(result.filename)` (triggering a browser "Save As" dialog) **unconditionally** whenever `result.method === 'mailto'`, regardless of whether `savedPath` was already set. So on the mailto fallback path the user got the file twice: once silently on the Desktop, once via an unwanted save prompt.

**Fix:** the download now only fires when `!result.savedPath` — i.e. only when the Desktop copy genuinely failed and the browser download is the only way to get the file. The success message no longer claims "a copy was also downloaded to your browser Downloads folder" when a Desktop copy already exists.

**Verified:** `npm run build` clean, `npm test --prefix server` 63/63, and **live-confirmed by Brian** on the real installed/tray copy — Send opens the mail app with correct To + Subject, zip already on the Desktop, no redundant save prompt. This closes the Support-mail bug arc (v1.1.7 → v1.1.11); see "Current State" above for the full chain.

---

## Support-mail fallback missing Subject, round 3 (shipped in v1.1.10)

**Report:** Brian updated to v1.1.9 and tested live — the fallback mail opened correctly (no garbling, no hang) but with an **empty Subject**. Expected: the v1.1.8 fix had deliberately stripped `?subject=&body=` from the fallback mailto URI entirely, since a well-formed subject+body query string was the proven garbling vector on this new-Outlook machine.

**Question:** does *subject alone* (no body) trigger the same garbling, or was body specifically the problem?

**Answer, verified live (not guessed) on the exact same hanging-COM machine:** subject-only does NOT garble. Two separate live tests:
1. Raw `Start-Process "mailto:$to?subject=$encoded"` — window opened with correct To and correct Subject (em-dash and parens rendered correctly), screenshot-confirmed.
2. Through the actual `Open-SupportMail.ps1` script path (fresh subject/body temp files, real invocation) — same clean result, window title showed the exact subject text.

**Fix:** `Open-SupportMail.ps1`'s Attempt 2 now sends `mailto:${To}?subject=$encodedSubject` (Subject restored, `&body=` stays out — untested, and the full message is already in the zip's `message.txt` for the manual-attach flow regardless). Comments updated in `supportService.ts` and `docs/code-guide.md` to describe "To + Subject, no Body" instead of "recipient only".

**Verified:** `npm run build` clean, `npm test --prefix server` 63/63, ps1 parses under PS 5.1 (0 errors), live smoke test through the real script path: 13.3s, exit 0, stdout `mailto`, window title showed the correct subject.

---

## Support-mail COM-hang fix, round 2 (shipped in v1.1.9)

**Bug (confirmed via `C:\ProgramData\VRSIWallBoard\logs\combined.log` on the same new-Outlook-only kiosk, after updating it to v1.1.8):** Send Support opened NOTHING — no Outlook window, no mailto window — and the log showed `{"error":"spawnSync powershell.exe ETIMEDOUT","message":"Support mail script failed to run or timed out"}`. The client fell back to the zip-download message because `composeSupportMail()` got `null` and defaulted its return label to `'mailto'` without anything having launched.

**Root cause:** on this machine `New-Object -ComObject Outlook.Application` does not fail fast — it **hangs** (new Outlook / olk.exe doesn't support classic COM automation, and the activation call blocks instead of throwing). Under the old two-spawn design that hang only killed the FIRST spawn; the second, independent mailto spawn still opened a (garbled) window. The v1.1.8 single-invocation design (correct, and kept) put the mailto fallback sequentially AFTER the COM attempt in the SAME process — so when Node's outer 30s `SUPPORT_SPAWN_TIMEOUT_MS` killed the hung powershell.exe, it killed the fallback with it. The fallback code was unreachable on any machine where COM hangs rather than throws.

**Fix (all inside `scripts/windows/Open-SupportMail.ps1` — single-invocation design and `$displayAttempted` guard unchanged):**
- The COM attempt (create → populate → attach → `Display()`) now runs in an **in-process STA runspace** (`[powershell]::Create()` + `BeginInvoke()` + `AsyncWaitHandle.WaitOne(10s)`), giving it its own **10-second inner timeout** independent of the outer 30s.
- **Runspace, not `Start-Job`:** a job is a second powershell.exe whose multi-second cold startup would eat the inner budget, and a killed job's streamed output is the only (racy) way to learn how far it got. The runspace shares a `[hashtable]::Synchronized` state object with the main thread, so `DisplayAttempted` is readable in real time even while the COM call is hung — the guard works identically on the timeout path (hung at/after `Display()` → fail closed, exit 1; hung before → safe to fall through to mailto).
- **On timeout the runspace is deliberately abandoned** — no `Stop()`/`Dispose()` (both can block on a thread stuck in a native COM call). **No `Stop-Process` on OUTLOOK.EXE** — can't distinguish a half-initialized automation-spawned instance from the user's real session with unsaved drafts; COM server lifetime handling reaps an abandoned activation once the client process exits.
- **Second pitfall found by harness, not theory:** the abandoned runspace pipeline thread is a **foreground** thread, so PowerShell's plain `exit` never returns — the process lingered for minutes (verified live on this machine), which would have made spawnSync report ETIMEDOUT *even after mailto successfully opened*. Fix: every exit path after the runspace starts goes through `Exit-Hard` (flush stdout/stderr, then `[Environment]::Exit`), which terminates the process regardless of hung foreground threads. Harness proof: hang + `Exit-Hard` → child exited in 4.8s total with exit code 0 and `mailto` intact on stdout.
- `supportService.ts`: comments updated only (`SUPPORT_SPAWN_TIMEOUT_MS` stays 30s — worst case is now ~10s COM + ~2s mailto + powershell startup, comfortably inside 30s). No code changes server-side.
- `docs/code-guide.md` `Open-SupportMail.ps1` row updated.

**Verified (build/tests, harnesses, AND a real live run on the actual hanging machine):**
- `npm run build` clean, `npm test --prefix server` 63/63, `npx tsc --noEmit` clean in server/, ps1 parse-validated under Windows PowerShell 5.1 (0 errors).
- Fable's standalone 5.1 harnesses proved the mechanism in isolation: a runspace hung in an infinite native sleep was abandoned at the test timeout with the main thread continuing to the fallback and the process hard-exiting cleanly (stdout intact); the fast-fail path (COM-not-registered analogue) completed with the error message readable from the shared state.
- **Direct live smoke test on this same real kiosk-like machine** (bypassing the server entirely — invoked `Open-SupportMail.ps1` directly with a fake `-To smoke-test@example.com`): real run against this machine's actual hanging Outlook COM completed in **13.3s**, exit code 0, stdout `mailto`, stderr `"Outlook COM compose timed out after 10s (hung COM activation; likely a new-Outlook-only machine)"` (not `ETIMEDOUT` — the outer Node timeout was never hit). A genuine new-Outlook "New mail" window opened (process `olk.exe`, title "New mail") with a **clean recipient-only To field, no garbling** — confirmed by screenshot. Temp files cleaned up after.

**Still to verify live (this exercised the repo's build directly, not the tray-managed installed copy):**
1. Update this machine's installed copy (`C:\Program Files\VRSI WallBoard\`) from v1.1.8 → v1.1.9 via Settings → About & Updates; confirm the running version shows 1.1.9.
2. Re-run Ctrl+M → Support → Send through the actual app UI (not the direct script invocation used above) and confirm the same clean result.
3. Classic-Outlook machine (if one is available to test): Send → exactly one compose window, correct To/Subject/Body, zip attached, well under 10s.
4. After the timeout path: check Task Manager — no lingering extra `powershell.exe` from the support script, no zombie half-initialized OUTLOOK.EXE.
5. Audit log records the method actually used (`mailto` in the hang case).

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

## Release flow (v1.1.11)

1. `npm run build` at root
2. `scripts\windows\Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.11.zip` + `.sha256`
3. `gh release create v1.1.11 "releases\VRSI-WallBoard-v1.1.11.zip" "releases\VRSI-WallBoard-v1.1.11.zip.sha256"`
4. Prune local `releases/` to 2 most recent versions (v1.1.10 + v1.1.11 after this release)

---

## Context for Next Session

1. Latest release: **v1.1.11** — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.11
2. This machine's installed/tray copy still needs updating to v1.1.11 and a final Ctrl+M → Support → Send re-test through the real app UI (To + Subject correct, no redundant save prompt).
3. Support inbox preconfigured to `briank@vrs-inc.com` (code default + installer `.env`)
4. Staff: Ctrl+M → Support → describe problem → Send support report
5. Kiosks still need to update from v1.1.6 through v1.1.10 → v1.1.11 to pick up the Outlook-hang timeout fix, the mailto-garbling fix, the COM-hang-starves-fallback fix, the restored fallback Subject, and the redundant-download-prompt fix
