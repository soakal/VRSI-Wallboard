# VRSI WallBoard — AI Memory

**Last saved:** 2026-07-14
**Storage mode:** Local (SQLite)
**Windows data path:** `C:\ProgramData\VRSIWallBoard\data\` (dev: `server/data`)
**Vault record (v0.9.3→v0.14.1 session log):** Obsidian vault → `10-Projects/VRSI-Wallboard-Session-2026-06-16-v0.9.3-to-v0.14.1.md`

---

## Current State

**Version:** v1.1.5 (root + server + client + shared). Support-report feature is on branch `cursor/support-report-button-51e5` (not released yet).

**Last completed task:** In-app Support tab (zip + mailto to `SUPPORT_EMAIL` / briank@vrs-inc.com) — no Graph mail.

**Next task:** Review/merge PR; decide whether to bump to v1.1.6 and release.

**Blockers / Pending kiosk action:**
To recover an existing kiosk stuck on v1.1.0:
1. As Administrator, delete `C:\Program Files\VRSI WallBoard\server\src`
2. Run `Update-FromRelease.bat` — will download and apply v1.1.1
After that, the in-app Update button works normally forever.

---

## This Session Work (2026-07-14) — Support button (zip + mailto)

**Ask:** Support button so a customer can describe the problem and attach logs for the developer.
**Constraint:** Cannot use Graph mail.
**Delivery:** Option B — package zip + open default mail client.

### What shipped
- Monitoring panel (**Ctrl+M**) → new **Support** tab next to Activity log / Download logs
- `GET /api/storage/support-info` — returns `supportEmail` + form limits
- `POST /api/storage/support` — builds zip (`message.txt`, `system-info.txt`, optional log tails + audit snippet), copies to Desktop when possible, archives under `logs/support-reports/`, streams zip for browser download
- Client downloads zip then opens `mailto:` to `SUPPORT_EMAIL` (default `briank@vrs-inc.com`, overridable in `.env`)
- Docs: `operations-guide.md` §4.0; `.env.example` + `server/.env.production.example`; RULES §12/§13/§19
- Tests: `supportService.test.ts` (4) — suite **62/62** pass; client+server build clean

### Key files
- `server/src/services/supportService.ts`
- `server/src/routes/storage.ts` (support routes)
- `client/src/components/MonitoringPanel.tsx`
- `client/src/api/storageApi.ts`

---

## This Session Work (2026-07-13) — save-reliability + tray (v1.1.4 / v1.1.5)

See RULES §19 and prior session notes for the save-reliability (v1.1.4) and tray-vs-console (v1.1.5) work. Released as v1.1.5.

---

## Key Decisions

### Support reports (2026-07-14)
- No Graph / Mail.Send — kiosk opens local mail client via `mailto:`
- Zip includes message + system info + optional log tails (5 MB combined.log cap)
- `SUPPORT_EMAIL` env (default product inbox) — never invent a second log-export path
- UI lives in Monitoring (System & IT Report) next to Download logs — not Settings About

### Job status flow
`none` → `parts_on_order` → `design` → `build` → `in_progress` → `ready_to_ship` → `shipped`

### Release flow
1. `npm run build` at root
2. `scripts/windows/Package-Release.ps1` → `releases/` zip + `.sha256`
3. `gh release create` with BOTH assets
4. Prune local `releases/` to 2 most recent versions

### StorageProvider + tray
- All storage via StorageProvider; tray is the only production launch path (§6)

---

## Known Issues / Deferred

| # | Issue | Status |
|---|-------|--------|
| 1 | SheetJS CDN → npm package | ✅ Done |
| 2 | XLSM configurable path | Deferred (network-readiness project) |
| 3 | personIdentity.ts deduplication | ✅ Done |
| 4 | ADMIN_TOKEN gate | ✅ Done |
| 5 | Import result counter misses new statuses | Known, display-only, low priority |

---

## Test Suite

`npm test --prefix server` → **62/62 pass**

---

## Context for Next Session

1. Start server: `npm start` at repo root → `http://localhost:3001`
2. Support feature branch: `cursor/support-report-button-51e5`
3. Latest release: **v1.1.5**; Support awaits merge → likely v1.1.6
4. Resume phrase: "Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue."
