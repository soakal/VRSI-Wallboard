# VRSI WallBoard — Security Audit & Hardening Plan

**Audit date:** 2026-07-15  
**App version audited:** 1.1.6 (`main` @ `5331ae1`)  
**Scope:** Server API, client UI, dependencies, Windows installer scripts, Support feature (v1.1.6)

This document records findings from a full-repo security review and a prioritized list of changes for future releases. Use it when planning v1.1.7+ or any work that exposes the server beyond localhost.

---

## Threat model

VRSI WallBoard is designed as a **physical Windows kiosk**: one machine, browser and server on the same host, server bound to loopback by default.

| Deployment | Remote attacker | Local attacker (malware, `curl`, second tab) |
|------------|-----------------|-----------------------------------------------|
| **Default kiosk** (`BIND_HOST=127.0.0.1`, `TRUST_LOCALHOST=true`) | Low — not reachable from LAN | **High** — treated as trusted admin |
| **LAN-exposed** (`BIND_HOST=0.0.0.0` or reverse proxy) | Depends on `ADMIN_TOKEN` and `TRUST_LOCALHOST` | Same as remote if reachable |
| **`ALLOW_OPEN_BOARD=true` + no `ADMIN_TOKEN`** | **Critical** — full write API | Full write API |

**Read findings through this lens.** Most “high” items are **by design** on a locked kiosk. They become bugs when the server is network-reachable or when you need cryptographic accountability (who really wrote a note).

---

## Executive summary

| Area | Verdict |
|------|---------|
| Default kiosk (loopback) | **Acceptable** — architecture is internally consistent |
| Remote exploitation | **Low** if `BIND_HOST=127.0.0.1` and installer-generated `ADMIN_TOKEN` stay in place |
| Data integrity / attribution | **Gap** — client-supplied `Actor` is spoofable |
| Supply chain (import) | **Gap** — `xlsx@0.18.5` has known CVEs, no upstream fix |
| SQL injection / path traversal | **Well mitigated** |
| Client XSS | **Clean** — no `dangerouslySetInnerHTML` |
| Secrets in repo | **None found** |

**Build/test at audit time:** 63/63 server tests pass; full `npm run build` clean.

---

## Findings by severity

### Critical — misconfiguration only

#### C1. `ALLOW_OPEN_BOARD=true` disables auth when `ADMIN_TOKEN` is unset

**File:** `server/src/middleware/adminAuth.ts`

If the server is bound to the network, `ADMIN_TOKEN` is empty, and `ALLOW_OPEN_BOARD=true`, every board/storage/update endpoint is writable without credentials.

**Action:** Never set `ALLOW_OPEN_BOARD=true` in production. Document in ops guide and installer comments. Installer already generates a random `ADMIN_TOKEN`.

---

### High — real on default kiosk (local trust boundary)

#### H1. Localhost bypass = full admin API without token

**Files:** `server/src/middleware/adminAuth.ts`, `client/src/api/boardHeaders.ts`

`TRUST_LOCALHOST=true` (default) lets any loopback caller skip `requireAdminToken`. The client never sends `X-Admin-Token`.

Any local process can: import jobs, backup/restore, export logs, submit support reports, trigger `POST /api/update/run` (PowerShell updater).

**Mitigation today:** `BIND_HOST` defaults to `127.0.0.1`.

**Before LAN exposure:** set `TRUST_LOCALHOST=false`, strong `ADMIN_TOKEN`, wire token into client API calls (or add real user auth).

#### H2. Client-supplied `Actor` — impersonation and note takeover

**Files:** `server/src/routes/board.ts`, `server/src/services/boardService.ts`, `client/src/api/boardApi.ts`

Mutations accept `actor` from JSON with no server session. User IDs are predictable:

```ts
// server/src/services/boardService.ts — getDerivedUsers()
'u_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
```

A local script can spoof any known user for notes, `updatedBy`, and audit fields. Super-user rules are **client-only** (`client/src/lib/agendaFilter.ts`, `NotesSection.tsx`).

**Recommended fix:** Server-bound identity (see [Implementation plan](#implementation-plan) § P1).

#### H3. Global Microsoft Graph token — not per-caller identity

**Files:** `server/src/auth/tokenRefresher.ts`, calendar/events/sharepoint routes

`isAuthenticated()` is a single server-wide flag. Any caller who reaches the server uses the kiosk’s stored OAuth token for Graph — not their own identity.

**Acceptable for kiosk service-account model.** Revisit if multi-user Graph access is required.

#### H4. Malicious spreadsheet → server `xlsx` parser

**Files:** `server/src/routes/board.ts`, `server/src/services/boardService.ts`, `server/package.json`

- Upload: up to 20 MB in memory via `multer`, no extension/MIME validation
- Parser: `xlsx@0.18.5` (unmaintained; prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363)

Risk: server DoS/crash, not client XSS (React escapes rendered text). Deferred in `VRSI-WALLBOARD-RULES.md` §19 — treat as **network-readiness** work.

---

### Medium

| ID | Finding | Files / notes |
|----|---------|---------------|
| M1 | Unauthenticated reads: `/health`, `/api/auth/status` (user email), `GET /api/config/`, `GET /api/board/export/ship-dates.ics`, `GET /api/update/check` | OK on loopback; leaky if LAN-exposed |
| M2 | `GET /api/storage/security-report` exposes data dirs, audit summaries | Behind admin gate; localhost bypass applies |
| M3 | No rate limiting on import, auth start, presence, geocode proxy | Local DoS/spam |
| M4 | CSP `style-src 'unsafe-inline'` | `server/src/index.ts` — low exploitability today (no DOM XSS) |
| M5 | `localStorage` user/role tampering | `client/src/store/appStore.ts` — UI/agenda only |
| M6 | Shared-kiosk note drafts in `localStorage` | `client/src/components/board/JobCard.tsx` |
| M7 | Restore errors return raw `e.message` | `server/src/routes/storage.ts` — path leakage |
| M8 | `VITE_ADMIN_TOKEN` documented but unused | `client/.env.production.example` — future footgun |
| M9 | `multer@1.4.5-lts.1` deprecated | Upgrade to 2.x advised |
| M10 | SharePoint `webUrl` opened without `https:` check | `FileBrowserPanel.tsx`, `RecentFilesWidget.tsx` |

---

### Low / positive controls

| Item | Status |
|------|--------|
| SQL injection | Parameterized queries throughout `localProvider.ts` |
| Path traversal | Restore + support download validated (`path.basename`, prefix whitelist) |
| XSS (client) | No `dangerouslySetInnerHTML` / `innerHTML` |
| CSRF (cross-origin) | CORS explicit origin, not `*` |
| Secrets in repo | None; `.env` gitignored; installer generates `ADMIN_TOKEN` |
| Tokens at rest | AES-256-GCM + scrypt (`server/src/auth/tokenStore.ts`) |
| Error disclosure | Global handler masks 500s; stacks in logger only |
| ICS export | RFC 5545 text escaping (`server/src/utils/icsGenerator.ts`) |
| Support email | Server-side only; not in UI or `support-info` API |
| Default bind | `127.0.0.1` (`server/src/index.ts`) |
| Board writes | Mutex + merge restore + conflict detection |

---

## Dependency audit (`server/`)

Run before each release:

```powershell
cd server
npm audit
```

| Package | Severity | Notes |
|---------|----------|-------|
| `xlsx@0.18.5` | High | No fix; replace or sandbox (import path only) |
| `uuid` (via `@azure/msal-node`, `node-cron`) | Moderate | Transitive; fix needs major bumps |
| `esbuild` | Low | Dev dependency only |
| `multer@1.4.5-lts.1` | — | Deprecated; upgrade to 2.x |

`client/` production deps: clean at audit time (React stack only).

---

## What to change vs leave alone

### Must change (before wider exposure)

| Change | Why |
|--------|-----|
| Never `ALLOW_OPEN_BOARD=true` in production | Opens API without token |
| Keep `BIND_HOST=127.0.0.1` unless intentionally going LAN | Main remote-risk lever |
| If LAN: `TRUST_LOCALHOST=false` + `ADMIN_TOKEN` + client sends `X-Admin-Token` | Client auth not wired today |
| Remove or implement `VITE_ADMIN_TOKEN` | Avoid accidental token bundling |

**On a normal kiosk:** no code change if bind stays loopback and installer keeps generating `ADMIN_TOKEN`.

### Should change (worth fixing on kiosk)

| Priority | Change | Problem |
|----------|--------|---------|
| P1 | Server-bound identity for board actions | Actor spoofing |
| P2 | Upgrade `multer` 1.x → 2.x | Deprecated upload middleware |
| P3 | Rate-limit import, auth start, presence | Local spam/DoS |
| P4 | Prune `logs/support-reports/` | Disk growth (30 days or last 10 files) |
| P5 | Sanitize restore error responses | Path leakage in JSON |
| P6 | Clear note drafts on user switch | Shared-kiosk privacy |

### Later / release housekeeping

| Change | Why |
|--------|-----|
| Ship **v1.1.7** | v1.1.6 zip predates installer `SUPPORT_EMAIL` auto-write (`6966aba`) |
| Tighten CSP (`style-src` without `'unsafe-inline'`) | Defense in depth |
| Validate SharePoint `webUrl` is `https:` before `window.open` | Compromised response hardening |
| Extra guard on `POST /api/update/run` | Confirm token or typed confirmation |
| Replace/sandbox `xlsx` | Network-readiness / untrusted upload path |

### Do not change (by design)

| Item | Reason |
|------|--------|
| `TRUST_LOCALHOST=true` on kiosk | Browser and server on same machine |
| Unauthenticated `ship-dates.ics` | Data already visible on wallboard |
| `GET /health`, `GET /api/config` on localhost | Monitoring needs |
| Support email hidden from UI | Product requirement |
| Global Graph token for calendar/SharePoint | Shared kiosk service account |

---

## Implementation plan

### P1 — Server-bound identity (recommended)

**Problem:** H2 — anyone on the machine can spoof `actor`.

**Options:**

| Option | Effort | Strength |
|--------|--------|----------|
| **A — Session cookie** | Medium | Server issues session when user picks name; `actor` derived server-side; best for kiosk |
| **B — Validate `actor` against `getDerivedUsers()`** | Small | Stops random IDs; does not stop determined local attacker who knows names |
| **C — Real auth (Entra / PIN)** | Large | Only if leaving single-kiosk trust model |

**Recommendation:** Option A for v1.1.7 or v1.2.0.

**Touch points:**

- `server/src/routes/board.ts` — read actor from session, reject body `actor`
- `server/src/middleware/` — new session middleware (signed cookie or in-memory + UUID)
- `client/src/store/appStore.ts` — `setActiveUser` calls `POST /api/board/session` (or similar)
- `client/src/api/boardApi.ts` — stop sending `actor` in body

**Acceptance:**

- `curl` with forged `actor` JSON is rejected (401/403)
- Note edit/delete only works for session-bound user
- Existing kiosk flow (pick name from list) unchanged in UI

---

### P2 — Upgrade multer to 2.x

**Touch points:** `server/package.json`, `server/src/routes/board.ts` (API surface check)

**Acceptance:** Import still accepts `.xlsm`/`.xlsx` up to 20 MB; existing import tests pass.

---

### P3 — Rate limiting

**Suggested limits:**

| Endpoint | Limit |
|----------|-------|
| `POST /api/board/import` | 5 / minute |
| `POST /api/auth/start` | 3 / 10 minutes |
| `POST /api/board/jobs/:id/presence` | 60 / minute per IP |

**Touch points:** new `server/src/middleware/rateLimit.ts`, wire in `index.ts` or per-router.

**Acceptance:** 429 with `{ error: { code, message } }`; audit log not flooded by spam.

---

### P4 — Support-reports retention

**Pattern:** Same as `pruneAuditLog` (90 days) and `.migrated` file sweep (30 days).

**Touch points:** `server/src/services/supportService.ts`, call from startup or daily cron.

**Suggested policy:** Keep last **10** archives OR **30 days**, whichever is stricter.

---

### P5 — Restore error sanitization

**Touch points:** `server/src/routes/storage.ts` — route restore `catch` through generic message or `errorHandler`.

**Acceptance:** 500 responses never contain `C:\` paths or stack fragments.

---

### P6 — Note draft cleanup

**Touch points:** `client/src/store/appStore.ts` — on `setActiveUser`, clear `localStorage` keys for job note drafts (or prefix by user id).

---

### P7 — `xlsx` replacement (separate project)

Track under network-readiness. Until then:

- Treat uploads as untrusted even on kiosk
- Consider import in a worker subprocess with memory cap
- Document in ops guide: only import files from trusted sources

---

## LAN exposure checklist

Before binding to `0.0.0.0` or placing a reverse proxy in front:

- [ ] `BIND_HOST` reviewed — intentional exposure documented
- [ ] `TRUST_LOCALHOST=false`
- [ ] `ADMIN_TOKEN` set (32+ random chars; installer default OK)
- [ ] `ALLOW_OPEN_BOARD` unset or `false`
- [ ] Client built/served with `X-Admin-Token` header support
- [ ] `CORS_ORIGIN` set to actual SPA origin (not wildcard)
- [ ] ICS export exposure reviewed (`/api/board/export/ship-dates.ics`)
- [ ] `/health` and `/api/auth/status` information disclosure reviewed
- [ ] Firewall rules restrict who can reach the port

---

## Verification checklist (after hardening)

```powershell
# Build & test
npm run build
cd server && npm test

# Dependency audit
cd server && npm audit

# Smoke (server running on 3001)
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/storage/support-info
# support-info must NOT contain email

# Path traversal (expect 404)
curl -o NUL -w "%{http_code}" http://127.0.0.1:3001/api/storage/support-download/..%2F..%2Fetc%2Fpasswd

# Actor spoof test (after P1 — expect 401/403)
# curl -X POST .../notes -d '{"text":"x","actor":{"id":"u_victim","name":"Victim"}}'
```

**Manual (Windows kiosk):**

- [ ] Ctrl+M → Support → zip created, Outlook or mailto fallback
- [ ] Pick user A → add note → switch user B → draft from A not visible
- [ ] Import trusted spreadsheet still works

---

## API exposure reference

### Unauthenticated (no admin token)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Status, auth flags, backup health |
| POST | `/api/auth/start` | Device code flow |
| GET | `/api/auth/status` | Auth state, operator email |
| GET | `/api/config/` | Full app config |
| GET | `/api/config/geocode` | Open-Meteo proxy |
| GET | `/api/board/export/ship-dates.ics` | Job ship dates (by design) |
| GET | `/api/update/check`, `/status` | Version/update info |
| GET | `*` | SPA static assets |

### Graph proxy (`isAuthenticated()` — kiosk token)

`/api/calendars`, `/api/events`, `/api/sharepoint/*`

### Admin (`requireAdminToken` — localhost bypass on kiosk)

All `/api/board/*` (except ICS), `/api/storage/*`, `POST /api/config/`, `POST /api/update/run`

---

## Changelog for this document

| Date | Version | Change |
|------|---------|--------|
| 2026-07-15 | 1.1.6 | Initial audit after Support feature (v1.1.6); findings + hardening plan |

---

## Related docs

- `docs/operations-guide.md` — install, backup, support, logs
- `docs/code-guide.md` — architecture walkthrough
- `docs/REMEDIATION-PLAN.md` — earlier council remediation (2026-06-17)
- `VRSI-WALLBOARD-RULES.md` — project contract (§10 pitfalls, §19 changelog)
- `server/.env.production.example` — `ADMIN_TOKEN`, `TRUST_LOCALHOST`, `BIND_HOST`
