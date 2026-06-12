// Post-run: transcode each tour recording (Playwright only outputs .webm) into a
// universal MP4 (H.264 + yuv420p + faststart) with a friendly name, so the
// videos play anywhere — PowerPoint, Teams, QuickTime, phones, every browser.
//
// Runs as Playwright globalTeardown (after the server stops) and is also exposed
// as `npm run e2e:video` to re-export without re-recording.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ARTIFACTS = path.resolve(__dirname, 'artifacts')
const RESULTS = path.join(ARTIFACTS, 'test-results')
const OUT = path.join(ARTIFACTS, 'videos')

// Map a test-results folder name → a friendly output base name.
const NAME_MAP = [
  { match: '01-upgrade', name: 'VRSI-upgrade-walkthrough' },
  { match: '02-feature', name: 'VRSI-feature-walkthrough' },
]

/** Find an ffmpeg with an H.264 encoder: PATH first, then the winget install. */
function findFfmpeg() {
  const candidates = ['ffmpeg']
  const local = process.env.LOCALAPPDATA
  if (local) {
    const wingetPkgs = path.join(local, 'Microsoft', 'WinGet', 'Packages')
    try {
      for (const dir of fs.readdirSync(wingetPkgs)) {
        if (!/^Gyan\.FFmpeg/i.test(dir)) continue
        const pkg = path.join(wingetPkgs, dir)
        for (const sub of fs.readdirSync(pkg)) {
          const exe = path.join(pkg, sub, 'bin', 'ffmpeg.exe')
          if (fs.existsSync(exe)) candidates.push(exe)
        }
      }
    } catch {
      /* no winget packages dir — fall through */
    }
    candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'))
  }
  for (const c of candidates) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' })
      return c
    } catch {
      /* try next */
    }
  }
  return null
}

/** Collect the newest video.webm per friendly name. */
function collectVideos() {
  const found = {}
  let dirs = []
  try {
    dirs = fs.readdirSync(RESULTS)
  } catch {
    return []
  }
  for (const dir of dirs) {
    const webm = path.join(RESULTS, dir, 'video.webm')
    if (!fs.existsSync(webm)) continue
    const hit = NAME_MAP.find((m) => dir.includes(m.match))
    if (!hit) continue
    const mtime = fs.statSync(webm).mtimeMs
    if (!found[hit.name] || mtime > found[hit.name].mtime) {
      found[hit.name] = { name: hit.name, webm, mtime }
    }
  }
  return Object.values(found)
}

function main() {
  const videos = collectVideos()
  if (videos.length === 0) {
    console.log('[export-videos] no recordings found in', RESULTS)
    return
  }
  fs.mkdirSync(OUT, { recursive: true })

  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    console.log(
      '[export-videos] ffmpeg not found — copying .webm only.\n' +
        '  For universal MP4, install ffmpeg:  winget install Gyan.FFmpeg\n' +
        '  then re-run:  npm run e2e:video',
    )
    for (const v of videos) {
      fs.copyFileSync(v.webm, path.join(OUT, `${v.name}.webm`))
    }
    console.log(`[export-videos] wrote ${videos.length} .webm file(s) to ${OUT}`)
    return
  }

  for (const v of videos) {
    const mp4 = path.join(OUT, `${v.name}.mp4`)
    execFileSync(
      ffmpeg,
      [
        '-y',
        '-i', v.webm,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p', // required for QuickTime / older players
        '-movflags', '+faststart',
        mp4,
      ],
      { stdio: 'ignore' },
    )
    console.log(`[export-videos] ${path.basename(mp4)}`)
  }
  console.log(`[export-videos] MP4(s) ready in ${OUT}`)
}

// Playwright globalTeardown imports this and calls the exported function;
// `node e2e/export-videos.cjs` (npm run e2e:video) runs it directly.
module.exports = main
if (require.main === module) main()
