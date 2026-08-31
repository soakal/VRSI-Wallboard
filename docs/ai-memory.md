# VRSI WallBoard — AI Memory

**Last saved:** 2026-08-31
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\`

---

## v1.1.13 — note timestamps always show the posted date

Brian: "make sure the notes just show the timestamp to always show the date that it was posted" — `NotesSection.tsx` previously rendered only `formatDistanceToNow` ("3 weeks ago") with no absolute date. Fable fixed it: the note-header timestamp now shows `format(noteDate, 'MMM d, yyyy')` (matches `JobCard.tsx`'s ship-date format convention) with the relative time kept as a dimmer `(3 weeks ago)` parenthetical; "(edited)" suffix unchanged. Client-only change, `client/src/components/board/NotesSection.tsx`. Verified: `npm run build` clean, `npm test --prefix server` 63/63.

---

## v1.1.12 packaged and released (2026-08-31)

Node.js was not installed on this Windows machine at session start (this machine had never actually run `npm install`/`npm run build` locally before — prior v1.1.12 verification was done from a Linux session per the note below). Installed Node.js LTS (v24.19.0) via `winget install --id OpenJS.NodeJS.LTS`. Stale `node_modules` already existed under `client/`, `server/`, `shared/` (dated 2026-07-15, from an unknown prior install attempt) with an empty `client/node_modules/@vrsi` symlink dir — `npm install` in each of the three dirs fixed the missing `@vrsi/wallboard-shared` link. npm 11's built-in install-script gate blocked `better-sqlite3`'s native build and `esbuild`'s postinstall on first install (`npm warn allow-scripts`) — ran `npm approve-scripts --all` in `server/` and `client/`, then `npm install` again to actually execute them. Verified clean: `npm run build` (shared+client+server), `npm test --prefix server` 63/63 (confirms `better-sqlite3`'s native binary is ABI-compatible with the new Node 24 install). Ran `Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.12.zip` (0.7 MB) + `.sha256`. Published via `gh release create v1.1.12` (also auto-created the `v1.1.12` git tag on GitHub) — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.12. Pruned local `releases/` to the 2 newest (v1.1.11, v1.1.12); v1.1.9/v1.1.10 zips deleted (still on GitHub Releases).

**This machine now has a working local Node toolchain (v24.19.0/npm 11.17.0) for the first time** — future sessions on this machine can build/test/package directly instead of relying on a separate Linux verification session.

**Still outstanding:** this machine's installed/tray copy (the actual running kiosk app, not the dev repo) has not been updated to v1.1.12 yet — still needs Settings → About & Updates → Update (or manual `Update-FromRelease.ps1`) to pick up the H1–H4 audit fixes. CI's `ps-lint` job should also be checked for green on the `Register-BackupTask.ps1` change now that it's on `main`.

---

## Current State

**Version:** v1.1.12 — **released** (see above), tagged, published to GitHub. Build clean, `npm test --prefix server` 63/63, verified via a real local Windows build+test+package this session (not just Linux CI).

**Last completed task:** Closed the loop on stale audit PR #1 (`docs(audit): full application audit`, opened 2026-07-03 against v1.1.3, never merged). Its base was a month behind `main` (v1.1.3 vs v1.1.11) — merging it as-is would have reverted everything from v1.1.4 onward. Re-verified its 4 HIGH findings against current `main` before touching anything: **all four were still live**, despite the PR's own "Remediation status" section claiming they were fixed in the same July 3 session — those fixes existed only on the unmerged PR branch and never reached `main`. Fixed and ported forward on this branch:
- **H1** (board-wipe on empty import) — `server/src/routes/board.ts` file-upload branch now 400s (`no_valid_jobs`) before calling `applyBoardImport` when `parseXlsm` returns zero jobs. The JSON-paste branch already had this guard; the file-upload branch didn't.
- **H2** (writable scripts + elevated backup task = local EoP) — `scripts/windows/Register-BackupTask.ps1` now runs the task as the interactive kiosk user (`-LogonType Interactive -RunLevel Limited`) instead of `-RunLevel Highest`. Didn't touch the `icacls` grant in `Install-WallBoard.ps1` (still needed for self-update) — closed the EoP by removing the elevated-execution half of the combination instead. `docs/operations-guide.md` §3.2 updated to point at the real script instead of a hand-rolled `-RunLevel Highest` snippet.
- **H3** (auth screen self-destructs) — `client/src/App.tsx`'s `handleAuthenticated` is now a stable `React.useCallback` passed to `AuthSetup`, instead of a new inline arrow (`onAuthenticated={() => setIsAuthenticated(true)}`) on every render.
- **H4** (one bad poll bounces into a new device-code flow) — added `routeAuthenticated` state, only flipped by the same debounce the imperative `navigate()` already used (`unauthCountRef >= 4 || needsReauth`); the `/` and `/setup` `<Route>` elements now render off that instead of the raw per-3s-poll `isAuthenticated`.

Also landed `docs/audit-2026-07-03.md` on `main` for the first time (it was only ever on the unmerged PR branch) with a dated correction note. MEDIUM/LOW findings from that report were **not** re-verified this session — flagged unconfirmed in the doc itself. Confirmed **M5 (multer 1.x, unpatched DoS advisories) is still present** — `server/package.json` still pins `^1.4.5-lts.1`, deprecation warning fires on every `npm install`.

**Verification gap:** the two edited `.ps1` files (`Register-BackupTask.ps1`) could not be parse-validated locally — no `pwsh` in this Linux session. Reviewed by hand against the working `_Register-Startup.ps1` pattern it mirrors (same `Win32_ComputerSystem.UserName` + `New-ScheduledTaskPrincipal -LogonType Interactive` approach already proven in production for the tray task). CI's `ps-lint` job (`.github/workflows/test.yml`, `windows-latest`) will parse-validate on push — **check that it's green before trusting this script further**, and ideally verify live on a real kiosk (register the task, confirm it fires under the kiosk user's token, not elevated).

**Next task:** None outstanding from this pass. Candidates from the audit doc's MEDIUM list, if picked up later: M5 (multer 2.x upgrade — flagged fixed in the PR's own report but not independently verified this session, and the deprecation warning suggests it wasn't actually applied), M1/M2/M4 (the "widen BIND_HOST" LAN-exposure cluster — relevant before any LAN rollout), M11–M14/M17 (client reliability quick wins). Normal kiosk fleet still needs to update through v1.1.11 for the Support-mail fixes, then to v1.1.12 (once released) for this session's security fixes.

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

## Release flow (v1.1.12)

1. `npm run build` at root
2. `scripts\windows\Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.12.zip` + `.sha256`
3. `gh release create v1.1.12 "releases\VRSI-WallBoard-v1.1.12.zip" "releases\VRSI-WallBoard-v1.1.12.zip.sha256"`
4. Prune local `releases/` to 2 most recent versions (v1.1.11 + v1.1.12 after this release)

---

## Context for Next Session

1. Latest **released** version: **v1.1.12** — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.12 (PR #4 merged to `main`, packaged and published 2026-08-31). CI's `ps-lint` job should still be spot-checked green for `Register-BackupTask.ps1` on `main`.
2. This machine's installed/tray copy (the running kiosk app under `C:\Program Files\VRSI WallBoard\`, distinct from this dev repo) still needs updating to v1.1.12 via Settings → About & Updates → Update, to pick up the H1–H4 audit fixes.
3. Support inbox preconfigured to `briank@vrs-inc.com` (code default + installer `.env`)
4. Staff: Ctrl+M → Support → describe problem → Send support report
5. Any kiosk still below v1.1.11 needs to update through v1.1.7–v1.1.11 for the Support-mail fixes, then to v1.1.12 for the audit-remediation fixes.
6. PR #1 (the stale audit) was closed with an explanatory comment rather than merged — its base was a month behind `main` and merging would have reverted v1.1.4–v1.1.11. Its content was ported forward via PR #4 (`claude/pr-branches-completion-tv5w6r`), which merged cleanly to `main` on 2026-08-01.
7. This machine's dev toolchain was uninitialized until this session — Node.js was installed for the first time (v24.19.0 LTS via winget) to do the v1.1.12 build/test/package. See "v1.1.12 packaged and released" above for the stale-`node_modules`/`allow-scripts` gotchas hit along the way, in case they recur on a future clean checkout.
