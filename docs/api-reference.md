# VRSI WallBoard — API Reference

Consolidated reference for every HTTP endpoint the server exposes. See `docs/security-audit.md`
for the full threat model — the short version: the server binds to `127.0.0.1` by default, and
`TRUST_LOCALHOST=true` means any process on the same machine is treated as trusted admin. **On
the standard single-kiosk deployment (default `BIND_HOST`/`TRUST_LOCALHOST`, nothing overridden
in `.env`) the API is already open for anything running on that PC — the kiosk browser, or any
local script — with no token needed.** Confirmed directly in code, not just this doc:
`server/src/index.ts` defaults `BIND_HOST` to `127.0.0.1`; `server/src/middleware/adminAuth.ts`
defaults `TRUST_LOCALHOST` to `true` unless it's explicitly set to `'false'`. The token below
only starts to matter if the server is ever made reachable from *other* machines — wire it in
before that happens, never after.

## Authentication

Most write/admin endpoints require the `X-Admin-Token` header, checked by `requireAdminToken`
(`server/src/middleware/adminAuth.ts`) — **unless** the caller is on `127.0.0.1` and
`TRUST_LOCALHOST` is not explicitly set to `false`, in which case the check is skipped
entirely. This is why the kiosk browser never needs to send a token: browser and server share
the same machine.

**Current token for this deployment** (`ADMIN_TOKEN` in `server/.env` — set this value on the
real server for it to take effect; documenting it here does not configure anything by itself):

```
ADMIN_TOKEN=768e8bace70acd7840dcded42d91ddbdfcbb575d222600cbb962cb4fbc2e5344
```

> This repository is **private**. That is what makes committing a real secret here reasonably
> safe — if this repo's visibility is ever changed back to public, or the value above is ever
> reused anywhere reachable from an untrusted network, **rotate it immediately** (generate a new
> random value, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
> and update every deployment using the old one). A leaked `ADMIN_TOKEN` is equivalent to full
> admin access to the board API for anyone who obtains it.

Send it as: `X-Admin-Token: 768e8bace70acd7840dcded42d91ddbdfcbb575d222600cbb962cb4fbc2e5344`

## Board API (`/api/board`) — admin-gated except where noted

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/export/ship-dates.ics` | **None** (by design) | Ship dates already visible on the wallboard |
| GET | `/presence` | **None** | Who's currently editing which job |
| POST | `/presence/:jobNumber` | **None** | Claim editing presence on a job |
| DELETE | `/presence/:jobNumber` | **None** | Release editing presence |
| POST | `/import` | Admin | Upload `.xlsm`/`.xlsx` (multipart `file`) or `{ jobs: [...] }` JSON |
| GET | `/jobs` | Admin | Full merged job list (`BoardJob[]`) |
| GET | `/config` | Admin | Board config (users, colors, spare carrier) |
| POST | `/config` | Admin | Partial config update, deep-merged |
| GET | `/users` | Admin | Derived user picker list |
| PATCH | `/jobs/:jobNumber/status` | Admin | `{ status, actor }` |
| PATCH | `/jobs/:jobNumber/ship-date` | Admin | `{ shipDateOverride, overrideNote, actor }` |
| PATCH | `/jobs/:jobNumber/binder-printed` | Admin | `{ binderPrinted, actor }` |
| PATCH | `/jobs/:jobNumber/blocked` | Admin | `{ blocked, blockedReason, actor }` |
| POST | `/jobs/:jobNumber/notes` | Admin | `{ text, actor }` |
| PATCH | `/jobs/:jobNumber/notes/:noteId` | Admin | Edit own note |
| DELETE | `/jobs/:jobNumber/notes/:noteId` | Admin | Delete own note |

`actor` in request bodies is **client-supplied, not server-verified** — see `docs/security-audit.md`
finding H2 before treating it as a real identity guarantee.

## Storage API (`/api/storage`) — admin-gated (router-wide)

| Method | Path | Notes |
|---|---|---|
| GET | `/status` | Storage mode, DB path, health |
| GET | `/backups` | List available backups |
| POST | `/backup` | Trigger a backup now |
| POST | `/restore` | Restore from a backup (merges, never overwrites) |
| GET | `/support-info` | Support form limits only — never the inbox address |
| POST | `/support` | Build a support zip, open Outlook/mailto |
| GET | `/support-download/:filename` | Fallback download when Desktop copy fails |
| GET | `/logs-export` | Export server logs |
| GET | `/audit-log` | Read the audit trail |
| GET | `/security-report` | Data dirs, audit summary, `externalHostsContacted` |

## LLM query API (`/api/llm`) — admin-gated (router-wide)

| Method | Path | Notes |
|---|---|---|
| POST | `/query` | `{ question: string }` → `{ data: { answer } }`. See README "Natural-language job query" for the full contract, error codes, and what context the model receives. |

## Update API (`/api/update`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/check` | None | Compares running version to latest GitHub release, 6h cache |
| GET | `/status` | None | Last update run's result |
| POST | `/run` | Admin | Launches the self-update script |

## Config / calendars / auth / SharePoint / events

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/config/` | None | Full app display config |
| GET | `/api/config/geocode` | None | Proxies Open-Meteo ZIP lookups |
| POST | `/api/config/` | Admin | Update app config |
| GET | `/api/auth/status` | None | Azure auth state, operator email |
| POST | `/api/auth/start` | None | Device-code sign-in flow |
| GET | `/api/calendars` | Graph token (server-side) | Outlook calendar list, skipped when `DISABLE_AZURE=true` |
| GET | `/api/events` | Graph token (server-side) | Calendar events + board ship dates merged |
| GET | `/api/sharepoint/*` | Graph token (server-side) | Recent files widget |

## Rotating the token

1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set it as `ADMIN_TOKEN` in the real kiosk's `server/.env` (not this repo's dev copy)
3. Restart the server
4. Update this document to match, so the doc never drifts from what's actually deployed
