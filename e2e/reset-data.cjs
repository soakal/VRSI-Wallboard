// Wipes the throwaway demo data dir BEFORE the server starts, so every run
// begins from an identical board (fresh import → every job shows its NEW badge,
// no stale config). This must run before `npm start` — Playwright launches the
// webServer before globalSetup, so the wipe can't live there (the server would
// already hold the SQLite file open). Chained ahead of `npm start` in the
// webServer command in playwright.config.ts.
const fs = require('fs')

const dir = process.env.DATA_DIR
if (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.error(`[reset-data] could not remove ${dir}: ${err.message}`)
  }
  fs.mkdirSync(dir, { recursive: true })
  console.log(`[reset-data] fresh demo data dir: ${dir}`)
}
