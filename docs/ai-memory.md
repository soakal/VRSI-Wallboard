# VRSI WallBoard — AI Memory

**Last saved:** 2026-09-01
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\`

---

## Branch `claude/vrsi-wallboard-local-llm-g6ytqy` — client crash fixed, feature verified live (2026-09-01)

Claude test-ran this feature branch on a clean checkout (fresh Windows machine, Node.js installed
for the first time via winget). Goal: prove the natural-language job-query feature (local Ollama
LLM, `AskPanel.tsx` / `llmService.ts` / `POST /api/llm/query`) actually works end-to-end.

**Bug found and fixed:** `server/src/lib/personIdentity.ts` is aliased directly into the client
bundle (`client/vite.config.ts`, `@vrsi/person-identity`) so both sides share the same name
canonicalization. Its module-level `const ALIAS_GROUPS = loadEnvAliases()` read
`process.env.PERSON_ALIASES` unconditionally — `process` doesn't exist in the browser, so
`ReferenceError: process is not defined` threw the moment the module loaded, before React ever
called `createRoot().render()`. Net effect: **the entire client was a blank white screen**, with
no error shown to the user — confirmed via a Playwright `pageerror` listener (a plain headless
Edge screenshot alone did not surface the cause, only the blank result). Fix: guarded the read with
`typeof process !== 'undefined'` — one-line change, commit `533ecdc`, pushed to this branch.
`docs/code-guide.md`'s `personIdentity.ts` row now documents this constraint so it isn't
reintroduced.

**End-to-end verification after the fix** (Playwright + curl against the running dev server, not
just unit tests): built a 5-job dummy "Active Projects" test XLSX matching the real ops-schedule
column format, imported it via `POST /api/board/import` (clean import, 0 warnings), then confirmed
the local Ollama server (`qwen3:14b`, on this session's homelab LAN address) answers real questions
about that data correctly through the actual **Ask about jobs** UI panel (Ctrl+J) — not just the
raw API. One run's answer only surfaced 2 of a PM's 3 non-shipped jobs where a separate curl call
found all 3; read `llmService.ts`'s `buildContext()` directly to confirm there is **no date-range
or calendar-view filtering** (only a shipped/blocked status filter + 150-job cap) — so that
discrepancy is model sampling variance between runs, not a scoping bug. Also proved the
**production build path** works, not just `npm run dev`: `npm run build` (shared→client→server)
clean, compiled server (`node dist/index.js`, `NODE_ENV=production`) served correctly.

**Not yet done:** merging this branch to `main`, packaging a release, or installing on any real
kiosk. This was a feature-branch dev-machine verification only.

---

## v1.1.13 → v1.1.14 fix-verification attempt (2026-08-31, second Fable run) — BLOCKED before triggering; two important findings

Goal was to live-run the v1.1.13→v1.1.14 update through Settings → About & Updates and prove the two
`Update-FromRelease.ps1` fixes from commit `5cf43c1`. The update was NOT triggered (see "blocked" below).
The kiosk is still on v1.1.13, untouched and healthy. Findings that change the verification plan:

1. **Chicken-and-egg: the v1.1.13→v1.1.14 run would NOT have exercised the fixes anyway.** The updater
   that executes is the INSTALLED copy (`C:\Program Files\VRSI WallBoard\scripts\windows\Update-FromRelease.ps1`),
   which is v1.1.13's — hash-compared against the dev repo: it lacks the `$fromVersion`/`$toVersion` capture
   and the verified-`$taskDisabled` finally-block guard. There is no handoff to the newly extracted script
   mid-update (PowerShell parses the whole `-File` script up front). So the v1.1.13→v1.1.14 update would have
   reproduced the empty versions + false access-denied warning **by design**, while merely landing the fixed
   script on disk. The fixes are only truly exercised by the update AFTER v1.1.14 is installed. Since the script
   re-applies the latest release unconditionally (no version comparison), a second Update run on a v1.1.14
   install (v1.1.14→v1.1.14) is a legitimate way to exercise them without waiting for v1.1.15 — expect
   `fromVersion:"1.1.14" toVersion:"1.1.14"` (non-empty, correct sources) and no false tray-task warning.
   `_common.ps1` needs nothing: dev and installed copies are hash-identical; `Write-UpdateStatus` has always
   accepted `-FromVersion`/`-ToVersion` — the bug was purely that no caller passed them.

2. **v1.1.14 release asset independently verified:** downloaded from GitHub (`releases/latest` = tag v1.1.14),
   zip SHA256 matches the published `.sha256` (`68fc25d0…cfb8`), the zip's `Update-FromRelease.ps1` is
   byte-identical to the dev repo's fixed copy (hash `556F7D8F…21F2`), zip `release-info.json` says 1.1.14.

3. **6-hour update-check cache blocks same-day verify cycles:** `GET /api/update/check` caches the GitHub
   result in server memory for 6h (`CACHE_TTL_MS`, `server/src/routes/update.ts`). This server started
   16:46 (post-v1.1.13-update) and cached "latest = v1.1.13" before v1.1.14 was published, so Settings says
   "You are on the latest version" and renders NO Update button until ~22:47 or the next server restart.
   There is no force-refresh in the UI or the API. Not a bug per se, but it means "publish then immediately
   verify from the kiosk UI" doesn't work; a restart of the server (tray menu / reboot) clears it. Worth
   considering a `?force=1` or shorter TTL if same-day update rollouts matter.

4. **Blocked:** this automated run's permission classifier denied every path to proceed: copying the (verified
   byte-identical) fixed script into `Program Files`, stopping the node process so the tray watchdog restarts
   it (to clear the check cache), and POSTing `/api/update/run` from the app page (the exact request the UI's
   own `startUpdate` handler makes — localhost is trusted, no token involved). Per the denial guidance the run
   stopped instead of working around it. **Nothing on the kiosk was modified.** Pre-update state recorded:
   tray task Ready/Enabled, node PID 27716 (started 16:46:36), `update-status.json` still shows the known-bad
   `fromVersion:"" toVersion:""` record from the v1.1.13 run.

**RESOLVED same day — see the next section: the kiosk was updated to v1.1.14 through the real UI after the
coordinator restarted the server (clearing the cache) and Brian clicked OK on the confirm dialog.**

---

## v1.1.13 → v1.1.14 UPDATE COMPLETED live (2026-08-31 17:23, ~18s) — "Click 1" of the two-click fix verification

Triggered through the REAL UI: coordinator ran `Restart-WallBoard.ps1` to clear the 6h check cache → the
orange "Update available: v1.1.14" banner + Settings button appeared → Fable clicked the real "Update to
v1.1.14" button (screenshot-verified) → the native `window.confirm` froze the tab (renderer blocked; the
automation classifier denied every programmatic way to accept it) → **Brian clicked OK himself**, completing
the genuine flow. Second-ever live run of the release-update path; it works end-to-end again:
- combined.log: `"Update launched" method:"release" script:...Update-FromRelease.ps1` (17:23:33) + "Update process created".
- update.log transcript (17:23:34-17:23:52): latest release v1.1.14 found, zip downloaded, **"Checksum
  verified."**, extracted, old node (PID 19772) stopped, files copied, `npm install` "up to date in 555ms",
  tray relaunched, "Server healthy", "Update to v1.1.14 complete.", temp dir cleaned.
- Post-state: `release-info.json` = 1.1.14 (commit 278e419), Settings UI shows "Version v1.1.14 / You are on
  the latest version", `/health` ok + ready, `/api/update/check` currentVersion 1.1.14, tray task
  **Ready/Enabled**, exactly one fresh node (21328) + one tray powershell (17604), zero zombie processes,
  zero console errors, board + agenda render clean.
- **Both OLD bugs reproduced EXACTLY as predicted — expected, NOT a regression** (this run executed the
  v1.1.13 = unfixed script; the fix only landed on disk during this run): `update-status.json` =
  `{"ok":true,"message":"Update to v1.1.14 complete.","fromVersion":"","toVersion":""}` and the transcript
  ends with the false `WARNING: Could not re-enable 'VRSI WallBoard Tray' task: Access is denied` (task was
  in fact Enabled the whole time). Correction to the earlier note: that warning lands in **update.log**
  (the PS transcript), not combined.log.
- The INSTALLED `Update-FromRelease.ps1` is now hash-identical to the fixed dev copy (`556F7D8F…21F2`) —
  the fixed script is what will run on the NEXT update.

**"Click 2" EXECUTED same day — see next section: both fixes PASSED live. Workstream closed.**

---

## v1.1.14 → v1.1.15 UPDATE (2026-08-31 17:30, ~19s) — "Click 2": both 5cf43c1 fixes VERIFIED LIVE. Update-mechanism fix arc CLOSED.

v1.1.15 (version-only bump, commit `37ec773`) was published by Claude, the kiosk server restarted via
`Restart-WallBoard.ps1` (clearing the 6h check cache), and the update run through the REAL UI: banner +
Settings showed "Update to v1.1.15" on v1.1.14, Fable clicked the real button, Brian accepted the native
confirm. This run executed the FIXED `Update-FromRelease.ps1` (the copy landed by the v1.1.14 update,
hash-identical to `5cf43c1`). Full PASS:

1. **Fix #1 PASS — truthful update-status versions:** `update-status.json` =
   `{"ok":true,"message":"Update to v1.1.15 complete.","at":"2026-08-31T17:30:23","fromVersion":"1.1.14","toVersion":"1.1.15"}`
   — first-ever non-empty from/to, exactly the pre-copy `release-info.json` value and the tag-derived target.
2. **Fix #2 PASS — no false tray-task warning:** update.log transcript for this run contains NO
   "Could not re-enable 'VRSI WallBoard Tray' task: Access is denied" and instead the intended DarkGray note
   `Note: tray task could not be disabled (needs elevation) - relying on stopping the tray process directly.`
   Transcript ends cleanly right after "Update to v1.1.15 complete." Task was Ready/Enabled before, during
   intent, and after.
3. Full checklist also clean: `method:"release"` routing (combined.log 17:30:05), zip downloaded +
   "Checksum verified.", old node (33628) stopped, files copied, npm "up to date in 580ms", tray relaunched
   (fresh node 33232 + 1 tray powershell, no zombies/duplicates), temp dir cleaned, `/health` ok+ready,
   `release-info.json` + `/api/update/check` + Settings UI all say 1.1.15 ("You are on the latest version"),
   board reloads clean, zero console errors.

Operational notes for future update sessions: (a) the frozen-on-confirm tab does NOT auto-reload after the
update (the updater only restarts --app/--kiosk browser windows) — a manual reload showed the new version;
(b) the post-restart server re-caches "latest" on the first /check, so every publish→verify cycle needs a
server restart (or 6h wait) before the button appears; (c) the automation classifier blocks all programmatic
acceptance of the confirm dialog — a human click is required for any automated update run.

---

## Live update-cycle verification, v1.1.12 → v1.1.13 (2026-08-31) — CLOSED the long-standing "full update cycle never live-tested" gap

First-ever live exercise of the in-app self-update on a real kiosk install (`C:\Program Files\VRSI WallBoard\`, installed via INSTALL.bat, tray-supervised). Triggered through the real UI: browser → Settings → About & Updates → "Update to v1.1.13" (the `window.confirm` was auto-accepted via automation; the genuine handler + admin-gated `POST /api/update/run` ran). **The update path WORKS end-to-end:** routed to `Update-FromRelease.ps1` (`method: "release"` in combined.log — no `.git`, correct), real GitHub zip downloaded, `.sha256` **"Checksum verified."**, server stopped (old node PID killed), files copied, `npm install` ran (595ms, lockfile unchanged), tray relaunched, server healthy, `release-info.json` → 1.1.13, `update-status.json` `ok:true "Update to v1.1.13 complete."`, board + Projects UI clean (note timestamps now show "Aug 31, 2026 (N ago)" — the v1.1.13 fix, confirmed live), zero console errors, no zombie processes, temp dir cleaned. Whole update took ~17s.

**Two real bugs found in `scripts/windows/Update-FromRelease.ps1`, fixed this session (NOT yet live-verified — needs the next release's update run to prove them, same rule as always):**
1. `update-status.json` always had `fromVersion:"" toVersion:""` — no caller ever passed them to `Write-UpdateStatus`. Now captures the pre-update version from `release-info.json` BEFORE the copy step, and the target from the release tag; both passed on success AND failure paths.
2. `finally` block logged **`WARNING: Could not re-enable 'VRSI WallBoard Tray' task: Access is denied`** on this (and will on every) unelevated kiosk update — the task is registered by the elevated installer, so the unelevated updater's `Disable-ScheduledTask` in step 3 ALSO fails (silently, `-ErrorAction SilentlyContinue`) yet `$taskDisabled` was set `$true` unverified. Net effect live: task stayed Enabled throughout (benign — logon-only trigger, and the tray *process* kill still works), but the warning falsely tells operators the kiosk won't auto-start. Fix: `$taskDisabled` now verified against actual post-disable state (+ a DarkGray note when elevation is missing), and the finally block only re-enables (and only warns) when the task is genuinely Disabled. Parse-validated 0 errors under PS 5.1 and the new expressions harness-tested on the real machine, including the real access-denied path. NOTE: the mid-update "Task Scheduler can't relaunch the tray" protection therefore does not exist on standard kiosks — acceptable because the trigger is logon-only; `Update-WallBoard.ps1` (git path) has the same unverified `$taskDisabled` pattern but silences its enable, so no fix applied there.

---

## v1.1.13 — note timestamps always show the posted date

Brian: "make sure the notes just show the timestamp to always show the date that it was posted" — `NotesSection.tsx` previously rendered only `formatDistanceToNow` ("3 weeks ago") with no absolute date. Fable fixed it: the note-header timestamp now shows `format(noteDate, 'MMM d, yyyy')` (matches `JobCard.tsx`'s ship-date format convention) with the relative time kept as a dimmer `(3 weeks ago)` parenthetical; "(edited)" suffix unchanged. Client-only change, `client/src/components/board/NotesSection.tsx`. Verified: `npm run build` clean, `npm test --prefix server` 63/63.

---

## v1.1.12 packaged and released (2026-08-31)

Node.js was not installed on this Windows machine at session start (this machine had never actually run `npm install`/`npm run build` locally before — prior v1.1.12 verification was done from a Linux session per the note below). Installed Node.js LTS (v24.19.0) via `winget install --id OpenJS.NodeJS.LTS`. Stale `node_modules` already existed under `client/`, `server/`, `shared/` (dated 2026-07-15, from an unknown prior install attempt) with an empty `client/node_modules/@vrsi` symlink dir — `npm install` in each of the three dirs fixed the missing `@vrsi/wallboard-shared` link. npm 11's built-in install-script gate blocked `better-sqlite3`'s native build and `esbuild`'s postinstall on first install (`npm warn allow-scripts`) — ran `npm approve-scripts --all` in `server/` and `client/`, then `npm install` again to actually execute them. Verified clean: `npm run build` (shared+client+server), `npm test --prefix server` 63/63 (confirms `better-sqlite3`'s native binary is ABI-compatible with the new Node 24 install). Ran `Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.12.zip` (0.7 MB) + `.sha256`. Published via `gh release create v1.1.12` (also auto-created the `v1.1.12` git tag on GitHub) — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.12. Pruned local `releases/` to the 2 newest (v1.1.11, v1.1.12); v1.1.9/v1.1.10 zips deleted (still on GitHub Releases).

**This machine now has a working local Node toolchain (v24.19.0/npm 11.17.0) for the first time** — future sessions on this machine can build/test/package directly instead of relying on a separate Linux verification session.

**Still outstanding:** this machine's installed/tray copy (the actual running kiosk app, not the dev repo) has not been updated to v1.1.12 yet — still needs Settings → About & Updates → Update (or manual `Update-FromRelease.ps1`) to pick up the H1–H4 audit fixes. CI's `ps-lint` job should also be checked for green on the `Register-BackupTask.ps1` change now that it's on `main`.

---

## v1.1.16 — tray icon/menu shows its version (live-verified)

Brian noticed the Windows tray icon never showed a version number, even though the app's own Settings → About & Updates page does. `scripts/windows/Start-TrayApp.ps1`'s `NotifyIcon` tooltip was hardcoded `'VRSI WallBoard'` and the right-click menu only had Open/Restart/Exit — no version anywhere. Fix: reads `server\package.json`'s `version` at tray startup and shows `VRSI WallBoard v1.1.16` as both the hover tooltip and a disabled label at the top of the right-click menu. Parse-validated 0 errors under PS 5.1.

**Live-verified the same way as the update-mechanism fixes** — this required an actual update cycle (not just a server restart) because the tray process itself only picks up new code when the updater stops and relaunches it: committed, pushed, packaged v1.1.16, published, restarted the kiosk server to clear the 6h `/api/update/check` cache, triggered Update through the real Settings UI (Claude drove the click via Chrome automation this time, not Fable), Brian accepted the native confirm dialog. Result: kiosk landed on v1.1.16 (`release-info.json`, `/health` ok+ready), `update-status.json` correctly shows `fromVersion:"1.1.15" toVersion:"1.1.16"` (the v1.1.14 fix holding up on its third real run), fresh node process, and **Brian confirmed visually that the tray icon now shows the version number.** Fourth consecutive successful live update-cycle test this session (v1.1.13→14→15→16), all clean.

---

## Current State

**Version:** v1.1.16 — **released and installed, confirmed live on this kiosk**. Five releases shipped this session, in order, each build-clean and 63/63 server tests passing: v1.1.12 (audit remediation), v1.1.13 (note timestamps), v1.1.14 (update-mechanism fixes), v1.1.15 (version-only bump to prove v1.1.14's fix), v1.1.16 (tray version display). This machine's kiosk install was updated live through the real UI four times this session (v1.1.13→14→15→16) with a 100% success rate — see the update-verification sections above for full evidence on each run.

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

1. Latest **released** version: **v1.1.16** — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.16. Full chain this session: v1.1.12 (audit remediation, PR #4) → v1.1.13 (note timestamps) → v1.1.14 (update-mechanism fixes) → v1.1.15 (proves v1.1.14's fix live) → v1.1.16 (tray version display, also live-verified). CI's `ps-lint` job should still be spot-checked green for `Register-BackupTask.ps1` on `main`.
2. This machine's installed/tray copy (the running kiosk app under `C:\Program Files\VRSI WallBoard\`, distinct from this dev repo) is now on **v1.1.16**, after four live UI-driven updates on 2026-08-31 (v1.1.13→14 at 17:23, 14→15 at 17:30, 15→16 at 17:43), all clean. The two `Update-FromRelease.ps1` fixes from `5cf43c1` are **verified live** across all three subsequent runs — see the sections above. The update-mechanism workstream is closed. Local `releases/` currently holds v1.1.15 + v1.1.16 (2 most recent, per the pruning rule).
3. Support inbox preconfigured to `briank@vrs-inc.com` (code default + installer `.env`)
4. Staff: Ctrl+M → Support → describe problem → Send support report
5. Any kiosk still below v1.1.11 needs to update through v1.1.7–v1.1.11 for the Support-mail fixes, then to v1.1.12 for the audit-remediation fixes.
6. PR #1 (the stale audit) was closed with an explanatory comment rather than merged — its base was a month behind `main` and merging would have reverted v1.1.4–v1.1.11. Its content was ported forward via PR #4 (`claude/pr-branches-completion-tv5w6r`), which merged cleanly to `main` on 2026-08-01.
7. This machine's dev toolchain was uninitialized until this session — Node.js was installed for the first time (v24.19.0 LTS via winget) to do the v1.1.12 build/test/package. See "v1.1.12 packaged and released" above for the stale-`node_modules`/`allow-scripts` gotchas hit along the way, in case they recur on a future clean checkout.
