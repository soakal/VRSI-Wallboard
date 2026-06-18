# Claude Code — VRSI WallBoard Project Instructions

## Bootstrap (every session, no exceptions)
1. Read `VRSI-WALLBOARD-RULES.md` in full — it is the project contract
2. Read `docs/ai-memory.md` — it is your session state
3. Scan `package.json` (root, server, client) and confirm the stack matches §1 of the rules file
4. Announce: "Ready. Last task: <X>. Next task: <Y>. Anything to resolve first?"
5. Output the session-start checklist from §0 of `VRSI-WALLBOARD-RULES.md`
6. Do not write a single line of code until steps 1–5 are complete

## Key Project Files

| File | Purpose |
|------|---------|
| `VRSI-WALLBOARD-RULES.md` | Project rules — single source of truth |
| `VRSI-WallBoard-build-plan.md` | Detailed build plan and task list |
| `docs/ai-memory.md` | Session memory — read and write every session |
| `docs/code-guide.md` | Plain-English code walkthrough — keep updated when architecture changes |
| `docs/operations-guide.md` | Install, uninstall, backup, sending logs |
| `.env.example` | Environment variable reference for dev |
| `server\.env.production.example` | Environment variable reference for production |

## Your Role in This Project
- **Planner** — architecture, task breakdown, code review (use Opus)
- **Writer** — implementing a specific scoped task (use Sonnet)
- **Critic** — reviewing output before committing (use Opus)
- Switch roles explicitly; for complex tasks: plan first, get human approval, then write

## Stack (do not assume — verify against package.json each session)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js 20+ + Express + TypeScript + SQLite (better-sqlite3)
- **Auth:** Azure MSAL Device Code Flow (Entra ID)
- **Build:** `npm run build` at root builds both client and server
- **Start:** `npm start` at root starts the compiled server on port 3001

## Coding Rules (summary — full detail in VRSI-WALLBOARD-RULES.md)
- TypeScript strict mode — no `any`, no unguarded `as` casts
- All API routes return `{ data }` or `{ error: { code, message } }` — never raw responses
- No inline styles — Tailwind only
- Parameterized queries only — never string-interpolated SQL
- No `console.log` in production — use `logger` from `server/src/utils/logger.ts`
- App never talks to storage directly — always via the `StorageProvider` interface (§2 of rules)
- Merge, never overwrite — all imports and restores use merge logic (§7)
- Windows-native paths only — no Linux paths, no bash scripts, no systemd

## Environment
- **Data:** `C:\ProgramData\VRSIWallBoard\data\` (override with `DATA_DIR` in `.env`)
- **Backups:** `C:\ProgramData\VRSIWallBoard\backups\` (override with `BACKUP_DIR`)
- **Logs:** `C:\ProgramData\VRSIWallBoard\logs\`
- **Database:** `wallboard.db` (SQLite) in the data dir
- **Token file:** `tokens.json` in the data dir (AES-256-GCM encrypted)

## Git Rules
- Conventional commits: `feat|fix|chore|docs|test|refactor(scope): message`
- One concern per commit — never mix features with refactors
- Never commit secrets, `.env` files, or PII
- Never commit directly to `main` unless the project has no branch protection

## Release Rules
- After packaging a release (`scripts/windows/Package-Release.ps1`) and publishing it, prune the
  local `releases/` folder so it keeps **only the 2 most recent versions** — delete the older
  `VRSI-WallBoard-vX.Y.Z.zip` AND its matching `.zip.sha256`. The folder is gitignored and every
  version stays available on GitHub Releases, so older local zips are safe to remove.
- Publish with `gh` (installed at `C:\Program Files\GitHub CLI\gh.exe`); upload BOTH the `.zip` and
  the `.sha256` — the in-app updater verifies the checksum before extracting.

## Exchange Counter & Session Commands
- Reset exchange counter to 0 on session start
- Every 10 exchanges: output re-anchor line: `[Exchange N | Working on: ___ | Storage: ___]`
- Every 20 exchanges: `/checkpoint` — save memory + commit, keep working
- At 30 exchanges: `/wrap` — full save + output resume instructions
- Human can type `/wrap`, `/checkpoint`, `/status` at any time — respond immediately

## Context Window Management
- At ≥70% context: stop loading new large files, compress responses
- At ≥85% context: stop at safe checkpoint → save → commit → `/clear`
- Save procedure:
  1. Complete or abandon current atomic edit (never save mid-file)
  2. Update `VRSI-WALLBOARD-RULES.md` §1 and §19 if anything changed
  3. Write `docs/ai-memory.md` with full current state
  4. `git add VRSI-WALLBOARD-RULES.md docs/ai-memory.md CLAUDE.md && git commit -m "chore(ai): save session [agent]"`
  5. Tell human: "Context at ~85%. Saved. Run: /clear then say 'Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue.'"

## Resume After /clear
Say exactly this to resume:
> "Read VRSI-WALLBOARD-RULES.md and docs/ai-memory.md, then continue."

## Operations Reference
For install, uninstall, backup/restore, and sending logs — see `docs/operations-guide.md`.

## What You Must Never Do
- Bypass the StorageProvider interface (§2 of rules) — no direct DB or file I/O from routes
- Hard-delete board state that has notes — soft delete or preserve only
- Overwrite on import or restore — always merge
- Use Linux file paths or write bash/systemd scripts
- Hardcode secrets, API keys, or connection strings in source code
- Skip the bootstrap sequence
- Write code before reading `VRSI-WALLBOARD-RULES.md`
- Clear context without writing `docs/ai-memory.md` first
- Log PII (emails, passwords, tokens)
- Add a dependency without verifying: license (MIT/Apache/BSD/ISC only), last updated, actually needed
- Make the SheetJS CDN mistake — always use the npm package (§10 #1 of rules)
- Modify the StorageProvider interface (§2) or Data Model (§3) without explicit human approval
