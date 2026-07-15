# VRSI WallBoard — AI Memory

**Last saved:** 2026-07-15
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\`

---

## Current State

**Version:** v1.1.6 (root + server + client + shared — release commit on main)

**Last completed task:** v1.1.6 version bump + release prep for Support tab (PR #2 merged).

**Next task:** Publish GitHub release `v1.1.6` zip + sha256 from Windows (`Package-Release.ps1`); kiosks update; set `SUPPORT_EMAIL` in `.env` on each kiosk.

---

## v1.1.6 — Support tab (shipped in this release)

- Monitoring (Ctrl+M) → **Support** tab
- Outlook auto-attach when available; mailto fallback
- `SUPPORT_EMAIL` server-side only (not shown in UI)
- `npm test --prefix server` → 63/63 pass

---

## Release flow (v1.1.6)

1. `npm run build` at root
2. `scripts\windows\Package-Release.ps1` → `releases\VRSI-WallBoard-v1.1.6.zip` + `.sha256`
3. `gh release create v1.1.6 "releases\VRSI-WallBoard-v1.1.6.zip" "releases\VRSI-WallBoard-v1.1.6.zip.sha256"`
4. Prune local `releases/` to 2 most recent versions

---

## Context for Next Session

1. Latest tag after publish: **v1.1.6**
2. Kiosk `.env`: `SUPPORT_EMAIL=briank@vrs-inc.com`
3. Staff: Ctrl+M → Support → describe problem → Send support report
