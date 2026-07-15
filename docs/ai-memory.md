# VRSI WallBoard — AI Memory

**Last saved:** 2026-07-15
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\`

---

## Current State

**Version:** v1.1.7 (root + server + client + shared — release commit on main)

**Last completed task:** Fable audit of the v1.1.6 Support feature (see below) — two real fixes shipped, released as v1.1.7.

**Next task:** Kiosks update to v1.1.7.

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

## Release flow (v1.1.7)

1. `npm run build` at root
2. `scripts\windows\Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.7.zip` + `.sha256`
3. `gh release create v1.1.7 "releases\VRSI-WallBoard-v1.1.7.zip" "releases\VRSI-WallBoard-v1.1.7.zip.sha256"`
4. Prune local `releases/` to 2 most recent versions (nothing to prune yet — only v1.1.7 present)

---

## Context for Next Session

1. Latest release: **v1.1.7** — https://github.com/soakal/VRSI-Wallboard/releases/tag/v1.1.7
2. Support inbox preconfigured to `briank@vrs-inc.com` (code default + installer `.env`)
3. Staff: Ctrl+M → Support → describe problem → Send support report
4. Kiosks still need to update from v1.1.6 → v1.1.7 to pick up the Outlook-hang timeout fix
