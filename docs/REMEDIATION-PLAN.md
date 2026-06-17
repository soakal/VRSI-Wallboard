# VRSI WallBoard — Remediation & Audit Plan (council, 2026-06-17)

**Headline:** v0.15.3 phased remediation — critical update-safety fixes, PII/path bugs, repo cleanup, test coverage, doc sync, and full verification.

> Status: **PLAN ONLY — not yet executed.** Produced by a 6-dimension audit + completeness critic. No release will be cut until Phase 5 sign-off. Owner approval required for any StorageProvider-interface or data-model change.

## Objectives
1. Eliminate every critical/high defect — above all, make the release-zip update path **incapable of clobbering a git checkout**, and fix the two verified data-safety bugs (tokens.json ignoring `DATA_DIR`; restore not covering tokens/config).
2. Remove **committed PII** (real employee emails in `personIdentity.ts` and `DEFAULT_BOARD_CONFIG`) and bring the auth/Graph/MSAL subsystem under review/test for the first time.
3. Clean the working tree: remove the duplicate `VRSI WallBoard/` source tree, relocate release artifacts, prune migration/staging junk.
4. Raise coverage so every feature is unit/e2e-tested **or** has a written manual/Windows runbook with pass criteria — and make CI build the client + run e2e + lint scripts.
5. Bring ALL docs current to v0.15.3 (no stale Electron/fullscreen/CDN/version-0.1.0 references).
6. Prove the whole system works end-to-end on a real Windows kiosk, including a true update cycle with rollback, before declaring done.

---

> **Live-machine finding (2026-06-17, found during verification):** ALL board writes fail with `attempt to write a readonly database` because `C:\ProgramData\VRSIWallBoard\data\wallboard.db` is owned by `BUILTIN\Administrators` and the kiosk user has only *Write* (not *Modify*) on it. The server opens the DB read-only, so block/unblock/notes/status never save. Root cause: the DB was created by an **elevated** process; the installer grants the kiosk user Modify on the *install* dir but **not** on the *data* dir. This is a new Phase 1 critical fix (data-dir ACL + never-run-elevated) plus a one-time recovery command.

## Phase 0 — Safety net & ground truth
*Make changes reversible and confirm what is actually running before touching anything destructive.*

- **[verify/S]** Create a working branch off main; back up `C:\ProgramData\VRSIWallBoard\data` (wallboard.db + tokens.json) + run a scripted backup. — *Acceptance:* branch exists; timestamped DB backup + tokens copy stored outside the repo; working tree clean aside from ignored artifacts.
- **[verify/S] Recover THIS machine's data-dir permissions (one-time, ELEVATED):** `icacls "C:\ProgramData\VRSIWallBoard\data" /grant "<kioskUser>:(OI)(CI)M" /T`, then restart the server. — *Acceptance:* the server can open the DB read-write; a live block→note→unblock round-trip persists.
- **[verify/S]** Confirm running build vs committed source (the destructive-update saga corrupted the dev install): rebuild from source and confirm `server/dist` matches `server/src` and the v0.15.x features are present. — *Acceptance:* fresh `npm run build` succeeds; block-reason auto-note present in rebuilt dist; any divergence recorded.
- **[verify/S]** Confirm the repo-root `VRSI WallBoard/` duplicate tree is a stale staging copy and untracked, so removal is safe. — *Acceptance:* `git ls-files` shows nothing under it; removal recorded as safe.

## Phase 1 — Critical fixes (update safety, data safety, security/PII)
*Close every critical/high finding that risks data loss, install corruption, lockout, or PII exposure. No cleanup/doc churn until these land.*

- **[fix/S]** Guard `Update-FromRelease.ps1`: abort (before any Copy-Item) if `.git` or `server\src` exists, telling the user to run `Update-WallBoard.ps1`. No `-Force`. — *Acceptance:* release path aborts on a git checkout before any file op; proceeds on a clean release extract.
- **[fix/M]** Harden git-vs-release detection in `update.ts` from `fs.existsSync('.git')` to `git -C repoRoot rev-parse --is-inside-work-tree`; validate repoRoot marker; keep `{data}/{error}`. — *Acceptance:* correct on clone/extract/worktree; invalid repoRoot returns descriptive `{error}`.
- **[fix/S]** Add a WARNING block to `Update-FromRelease.bat` naming the git-clone path. 
- **[fix/M] Data-dir is writable by the kiosk user (the read-only-DB bug):** `Install-DataDirs.ps1` must `icacls`-grant the kiosk user **Modify on the data dir** (default `C:\ProgramData\VRSIWallBoard\data`), and the server/tray must **never run elevated** so it stops creating Administrator-owned DB files. Add a startup self-check that logs a clear warning if the DB is not writable. — *Acceptance:* a fresh install leaves the data dir Modify-able by the kiosk user; the server opens the DB read-write; block/unblock/notes/status all persist; a non-writable DB logs an actionable warning instead of a bare 500.
- **[fix/M]** Fix token path divergence: `tokenStore.ts` resolves `tokens.json` via `resolveDataDir()` (honor `DATA_DIR`), migrating an existing `server/data/tokens.json` on first load. — *Acceptance:* tokens live under `DATA_DIR`; a release update no longer wipes encrypted tokens.
- **[fix/L]** Make backup/restore complete: include app config (+ tokens, or document/enforce re-auth). Through the StorageProvider boundary, merge-never-overwrite. **Owner approval required** if the interface/data model must change.
- **[fix/M]** Remove committed PII: externalize real aliases in `personIdentity.ts` and email defaults in `DEFAULT_BOARD_CONFIG` to config/env. Flag git-history scrub for owner decision (separate).
- **[fix/M]** Add length validation (jobNumber/noteId ≤100; fields ≤1000) to board PATCH/DELETE routes + import; reject with 400 `{error}`.
- **[fix/L]** First-ever audit of Graph/MSAL/auth (refresh race, expired token, 429/5xx, mock-data gated on `DISABLE_AZURE`). Fix anything risking lockout/crash-loop/mock-in-prod.
- **[fix/S]** Reconcile error contract: drop top-level `status` from `errorHandler.ts` so it matches `{error:{code,message}}`.
- **[fix/M]** Decide + document corrupt-DB-at-startup behavior (owner decision); add `RESTORE_CONFLICT_WINDOW_MS` (default 60000) with a log line when the close-timestamp heuristic blocks a restore.

## Phase 2 — Repo hygiene & cleanup
- **[cleanup/M]** Delete the stale `VRSI WallBoard/` duplicate tree; make Package-Release stage in a temp/.releases dir removed after zipping.
- **[cleanup/M]** Relocate release artifacts (`*.zip`, `*.sha256`, `*.lnk`) into a gitignored `releases/`; update Package-Release + .gitignore.
- **[cleanup/S]** Remove the duplicate `Actor` interface in `shared/.../board.ts`; prune stale `*.migrated`; add a routine to delete `*.migrated` >30 days (audit-logged).
- **[cleanup/S]** Remove client `console.*` (ErrorBoundary); add the SSF startup guard log; size-check `update-status.json` (>100 KB rejected).
- **[cleanup/M]** Explicit CimInstance disposal in the PS scripts; add a `type YES` confirm to `Restore-Backup.ps1`; clearer `_Register-Startup`/permission-grant messages.
- **[cleanup/S]** `useMemo` `agendaMonthLabel`; add the RBC internal-API fragility comment to `TwoWeekView`.

## Phase 3 — Test coverage & CI
- **[test/M]** Fix CI: build the client too, run server unit tests + Playwright e2e, add a `windows-latest` job that parses all `*.ps1` + runs PSScriptAnalyzer (advisory).
- **[test/L]** Server tests for: length validation, ship-date override + ICS export, config-route shape/bounds/enum, backup/restore merge semantics.
- **[test/L]** Client tests for: calendar range/view-switching (incl. 2-week RBC lock), agenda filtering/grouping, file-browser toggle.
- **[test/L]** e2e for: settings persistence, backup→mutate→restore (merge not wipe), import error handling, calendar visual regression.
- **[test/M]** Weather/presence resilience + CSP allows api.open-meteo.com; presence cleanup documented.
- **[test/M]** Dependency/license/npm-audit pass (MIT/Apache/BSD/ISC only); lockfiles in sync; record xlsx decision in backlog.
- **[docs/M]** Write `e2e/WINDOWS-VERIFICATION.md` + `docs/TEST-PLAN.md` (feature matrix: Unit/E2E/Manual, status, acceptance).

## Phase 4 — Documentation sync
- **[docs/M]** `VRSI-WALLBOARD-RULES.md`: §1 version 0.1.0→0.15.3; §19 changelog through v0.15.3; §3 block-note behavior; §10 done/open state.
- **[docs/M]** `VRSI-WallBoard-build-plan.md`: drop Electron/systemd/fullscreen; describe the `--app=` windowed model.
- **[docs/M]** `operations-guide.md`: update-path selection, tray-task recovery, update timing, block-feature usage, restore clock-sync caveat, **recovery for a git checkout corrupted by a release update**.
- **[docs/M]** `code-guide.md` / `START-HERE.txt` / `scripts/windows/README.md`: block-note, update-status, token-path, auth overview; drop fullscreen/v0.8.x language.
- **[docs/S]** `docs/ai-memory.md`: current to v0.15.3; note the Obsidian vault is authoritative; record version-consistency expectation.

## Phase 5 — Final verification & sign-off
- **[verify/M]** Full automated suite green (root build TS-strict; all unit + e2e; CI incl. client build + windows-latest lint).
- **[verify/L]** Windows kiosk runbook: tray crash→auto-restart; in-app update runs/restarts/`/health` ok/data preserved; simulate failed update → rollback restores prior version + re-enables tray task; release path **aborts** on a git checkout; `DATA_DIR` tokens survive an update.
- **[verify/M]** Manually verify non-automatable features (auth device-code, file browser/SharePoint, weather, calendar on the wall, presence across two clients); mark each in the matrix.
- **[verify/M]** Commit per concern; bump versions consistently (all package.json + lockfiles + tag + zip + changelog agree); final PII/secret scan; Package-Release; push/tag.

---

## Definition of Done
- No critical/high finding open: release path provably refuses a git checkout; git-vs-release detection is git-command-based.
- `tokens.json` resolves under `DATA_DIR`; existing token file migrated; a real update cycle leaves the kiosk authenticated.
- Backup/restore complete + merge-safe (DB + config, tokens included or exclusion documented); no interface/data-model change without recorded owner approval.
- No real names/emails in tracked source; identity/config defaults from config/env; git-history-scrub decision recorded.
- One source of truth: `VRSI WallBoard/` gone; artifacts in gitignored `releases/`; Package-Release cleans staging; duplicate `Actor` + stale `*.migrated` removed.
- Root build compiles shared+server+client TS-strict, zero errors; no client `console.*`; all routes `{data}/{error}`; parameterized SQL; Tailwind-only.
- Every feature covered by a passing test **or** a runbook entry with acceptance + Verified status.
- CI builds client + runs server tests + e2e + windows-latest PS lint, all green; dependency/license/audit pass recorded (allowed licenses only).
- All docs current to v0.15.3 (no Electron/systemd/fullscreen/CDN/version-0.1.0).
- A real Windows kiosk passes the runbook end-to-end incl. update-with-rollback; feature matrix all Covered/Verified.
- All version numbers + lockfiles + tag + zip + changelog agree; final diff scan shows no PII/.env/secrets.

## Top risks
- Backup-contract / corrupt-DB tasks may need owner-approval-gated interface/data-model changes — flag early.
- PII removal fixes the working tree but **history still leaks** until an owner-approved history rewrite.
- Release-path + rollback can only be truly proven on a **live Windows kiosk**, not CI/this dev box.
- Token-path migration must be tested with a real existing token file or it could strand kiosks into a one-time re-auth.
- The duplicate tree + corrupted dev install mean tooling may be operating on the wrong source — don't skip Phase 0.
- `xlsx` (SheetJS) stays unmaintained; deferral is OK only while XLSM uploads are trusted/local.
- Large Phase 3 test work may surface latent bugs that expand Phase 1; the never-reviewed auth subsystem may too.
